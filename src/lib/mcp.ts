import { dispatchA2a, projectTask, type RpcResponse } from "./a2a"
import { wire } from "./copy"
import { recordLine } from "./format"
import { expireScores, onDuty, SCORE_WAIT_MS, workRecord } from "./rules"
import type { JsonSchema, Store, Task, TaskStatus } from "./types"

const PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"])
const TASKS_PROTOCOL = "2025-11-25"
const MODERN_PROTOCOL = "2026-07-28"
const SUPPORTED_VERSIONS = [MODERN_PROTOCOL, ...PROTOCOL_VERSIONS]
const DEFAULT_PROTOCOL = TASKS_PROTOCOL
const PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion"
const CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities"
const SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo"
const TASKS_EXTENSION = "io.modelcontextprotocol/tasks"
const SERVER_INFO = { name: "a2human", version: "0.1.0" }
const WAIT_MS = 15_000
const POLL_MS = 1_000
export const MCP_TASK_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MCP_TASK_POLL_MS = 5_000
const LIST_PAGE = 50
const SCORE_TOOL = "a2h_score"
const RELATED_TASK = "io.modelcontextprotocol/related-task"
const IMMEDIATE_RESPONSE = "io.modelcontextprotocol/model-immediate-response"
const TASK_NOT_READY = -32099
const DECISION_KINDS = new Set(["task.input", "task.scoreRequest", "task.reject", "task.fail", "task.cancel"])

const INSTRUCTIONS = wire("mcp.instructions")

type FlatField = {
  name: string
  kind: "string" | "integer" | "number" | "boolean" | "image"
  required: boolean
  description: string
}

type DutyTool = {
  name: string
  description: string
  inputSchema: JsonSchema
  agentId: string
  skillName: string
  fields: FlatField[] | null
}

type Step =
  | { kind: "error"; text: string }
  | { kind: "pending"; taskId: string; agentId: string; text: string }
  | { kind: "done"; text: string }

type TaskView = {
  id?: string
  status?: { state?: string; message?: { parts?: { text?: string }[] } }
  artifacts?: { parts?: { text?: string; data?: unknown }[] }[]
}

export type McpIo = {
  read: () => Store | Promise<Store>
  update: <T>(fn: (store: Store) => T) => T | Promise<T>
  maxWaitMs?: number
  sleep?: (ms: number) => Promise<void>
}

type McpStatus = "working" | "input_required" | "completed" | "failed" | "cancelled"

type McpTask = {
  taskId: string
  status: McpStatus
  statusMessage?: string
  createdAt: string
  lastUpdatedAt: string
  ttl: number
  pollInterval: number
}

export type McpResult = { status: number; body: unknown | null }

export type McpHeaders = {
  protocolVersion?: string | null
  method?: string | null
  name?: string | null
}

function fnv(value: string) {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

function toolName(agentId: string, skillName: string) {
  const id = agentId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8) || "person"
  const skill = [...skillName].filter((char) => /[A-Za-z0-9_-]/.test(char)).join("").slice(0, 24)
  const suffix = fnv(`${agentId}\n${skillName}`)
  return (skill ? `a2h_${id}_${skill}_${suffix}` : `a2h_${id}_${suffix}`).slice(0, 64)
}

function flatFields(schema: JsonSchema | undefined): FlatField[] | null {
  if (!schema || schema.type !== "object") return null
  const properties = schema.properties
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null
  const entries = Object.entries(properties)
  if (entries.length === 0) return null
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [])
  const fields: FlatField[] = []
  for (const [name, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const description = typeof record.description === "string" ? record.description.trim() : ""
    const media = record.contentMediaType
    let kind: FlatField["kind"]
    if (record.type === "string" && typeof media === "string" && media.startsWith("image/")) kind = "image"
    else if ((record.type === "string" || record.type === "integer" || record.type === "number" || record.type === "boolean") && !("contentMediaType" in record)) {
      kind = record.type
    } else return null
    fields.push({ name, kind, required: required.has(name), description })
  }
  return fields
}

function inputSchema(fields: FlatField[] | null): JsonSchema {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  if (fields) {
    for (const field of fields) {
      properties[field.name] =
        field.kind === "image"
          ? { type: "string", description: field.description || wire("mcp.imageDescription") }
          : { type: field.kind, ...(field.description ? { description: field.description } : {}) }
      if (field.required) required.push(field.name)
    }
  } else {
    properties.prompt = { type: "string", description: wire("mcp.promptDescription") }
  }
  if (!properties.task_id) {
    properties.task_id = { type: "string", description: wire("mcp.taskIdDescription") }
  }
  if (!properties.score) {
    properties.score = { type: "integer", description: wire("mcp.scoreDescription") }
  }
  return required.length ? { type: "object", properties, required, additionalProperties: false } : { type: "object", properties, additionalProperties: false }
}

function catalog(store: Store): DutyTool[] {
  const used = new Set<string>()
  const tools: DutyTool[] = []
  for (const agent of onDuty(store.agents)) {
    const record = workRecord(store.tasks, agent.id)
    agent.skills.forEach((skill, index) => {
      let name = toolName(agent.id, skill.name)
      while (used.has(name)) {
        const tail = `_${index + 2}`
        name = `${name.slice(0, 64 - tail.length)}${tail}`
      }
      used.add(name)
      const fields = flatFields(skill.inputSchema)
      tools.push({
        name,
        description: [
          wire("mcp.toolPerson", { name: agent.name, skill: skill.name }),
          wire("mcp.recordLine", { line: recordLine(record.completed, record.averageScore, record.averageDuration) }),
          skill.description,
          wire("mcp.toolPath"),
        ].join("\n"),
        inputSchema: inputSchema(fields),
        agentId: agent.id,
        skillName: skill.name,
        fields,
      })
    })
  }
  return tools
}

export function listDutyTools(store: Store) {
  return catalog(store).map(({ name, description, inputSchema: schema }) => ({
    name,
    description,
    inputSchema: schema,
    execution: { taskSupport: "optional" as const },
  }))
}

function scoreTool() {
  return {
    name: SCORE_TOOL,
    description: wire("mcp.scoreTool"),
    inputSchema: {
      type: "object" as const,
      properties: {
        taskId: { type: "string", description: wire("mcp.scoreTaskId") },
        score: { type: "integer", description: wire("mcp.scoreDescription") },
      },
      required: ["taskId", "score"],
      additionalProperties: false,
    },
    execution: { taskSupport: "forbidden" as const },
  }
}

function statusText(task: TaskView) {
  const parts = task.status?.message?.parts ?? []
  return parts.map((part) => part.text?.trim() ?? "").filter(Boolean).join("\n")
}

function artifactText(task: TaskView) {
  const parts = (task.artifacts ?? []).flatMap((artifact) => artifact.parts ?? [])
  return parts
    .map((part) => {
      if (typeof part.text === "string" && part.text.trim()) return part.text.trim()
      if (part.data == null) return ""
      return typeof part.data === "string" ? part.data : JSON.stringify(part.data)
    })
    .filter(Boolean)
    .join("\n")
}

function taskOf(result: unknown): TaskView | undefined {
  if (!result || typeof result !== "object") return undefined
  const record = result as TaskView & { task?: TaskView }
  if (record.task?.id) return record.task
  if (typeof record.id === "string" && record.status) return record
  return undefined
}

function explain(response: RpcResponse): Step {
  if ("error" in response) return { kind: "error", text: response.error.message }
  const task = taskOf(response.result)
  if (!task?.id) return { kind: "error", text: wire("mcp.noTask") }
  const state = task.status?.state
  const note = statusText(task)
  const artifact = artifactText(task)
  if (state === "TASK_STATE_WORKING" || state === "TASK_STATE_SUBMITTED") {
    return { kind: "pending", taskId: task.id, agentId: "", text: wire("mcp.stillWorking", { id: task.id }) }
  }
  if (state === "TASK_STATE_INPUT_REQUIRED") return { kind: "done", text: note || artifact || state }
  if (state === "TASK_STATE_COMPLETED") return { kind: "done", text: artifact || wire("mcp.emptyArtifact") }
  if (state === "TASK_STATE_FAILED" || state === "TASK_STATE_CANCELED" || state === "TASK_STATE_REJECTED") {
    return { kind: "error", text: note || artifact || state }
  }
  return { kind: "error", text: note || wire("task.stopped", { state: state ?? wire("task.unknownState") }) }
}

function withAgent(step: Step, agentId: string): Step {
  if (step.kind !== "pending") return step
  return { ...step, agentId }
}

function dispatch(store: Store, agentId: string, skillName: string, parts: Record<string, unknown>[], taskId?: string) {
  const messageId = crypto.randomUUID()
  const response = dispatchA2a(
    store,
    { kind: "human", agentId },
    {
      jsonrpc: "2.0",
      id: messageId,
      method: "SendMessage",
      params: {
        configuration: { returnImmediately: true },
        metadata: { caller: "MCP", ...(skillName ? { skill: skillName } : {}) },
        message: {
          role: "ROLE_USER",
          messageId,
          ...(taskId ? { taskId } : {}),
          parts,
        },
      },
    },
    { a2aVersion: "1.0" },
  )
  return withAgent(explain(response), agentId)
}

function mediaFromUrl(url: string) {
  const path = url.toLowerCase()
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg"
  if (path.endsWith(".webp")) return "image/webp"
  if (path.endsWith(".gif")) return "image/gif"
  return "image/png"
}

function imagePart(value: string): { mediaType: string; url?: string; raw?: string } | { error: string } {
  const text = value.trim()
  if (text.startsWith("http://") || text.startsWith("https://")) return { mediaType: mediaFromUrl(text), url: text }
  const matched = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(text)
  if (!matched) return { error: wire("image.url") }
  return { mediaType: matched[1], raw: matched[2].replace(/\s/g, "") }
}

function promptParts(prompt: string): { parts: Record<string, unknown>[] } | { error: string } {
  const text = prompt.trim()
  if (!text) return { error: wire("mcp.promptEmpty") }
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const data = JSON.parse(text) as unknown
      if (data && typeof data === "object") return { parts: [{ mediaType: "application/json", data }] }
    } catch {
      // Plain text that happens to start with a bracket is sent as text.
    }
  }
  return { parts: [{ text }] }
}

function fieldParts(fields: FlatField[], args: Record<string, unknown>): { parts: Record<string, unknown>[] } | { error: string } {
  const data: Record<string, unknown> = {}
  const parts: Record<string, unknown>[] = []
  for (const field of fields) {
    const value = args[field.name]
    if (field.required && (value == null || value === "")) return { error: wire("field.missing", { name: field.name }) }
    if (value == null || value === "") continue
    if (field.kind === "image") {
      if (typeof value !== "string") return { error: wire("image.url") }
      const image = imagePart(value)
      if ("error" in image) return image
      parts.push(image)
      continue
    }
    if (field.kind === "string" && typeof value !== "string") return { error: wire("must.string", { label: field.name }) }
    if (field.kind === "integer" && !Number.isInteger(value)) return { error: wire("must.integer", { label: field.name }) }
    if (field.kind === "number" && typeof value !== "number") return { error: wire("must.number", { label: field.name }) }
    if (field.kind === "boolean" && typeof value !== "boolean") return { error: wire("must.boolean", { label: field.name }) }
    data[field.name] = value
  }
  if (Object.keys(data).length) parts.unshift({ mediaType: "application/json", data })
  if (!parts.length) return { error: wire("mcp.fieldsRequired") }
  return { parts }
}

function argumentRecord(params: unknown) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return {}
  const raw = (params as Record<string, unknown>).arguments
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

function textArg(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function pollTask(store: Store, agentId: string, taskId: string) {
  const response = dispatchA2a(
    store,
    { kind: "human", agentId },
    { jsonrpc: "2.0", id: `get-${taskId}`, method: "GetTask", params: { id: taskId } },
    { a2aVersion: "1.0" },
  )
  return withAgent(explain(response), agentId)
}

function filled(fields: FlatField[] | null, args: Record<string, unknown>) {
  if (!fields) return typeof args.prompt === "string" && args.prompt.trim().length > 0
  return fields.some((field) => args[field.name] != null && args[field.name] !== "")
}

export function dutyStep(store: Store, name: string, args: Record<string, unknown>): Step {
  const tool = catalog(store).find((item) => item.name === name)
  if (!tool) return { kind: "error", text: wire("skill.absent") }
  const taskId = textArg(args.task_id)
  if (args.score != null && args.score !== "") {
    if (!taskId) return { kind: "error", text: wire("score.needsTask") }
    if (!Number.isInteger(args.score) || (args.score as number) < 1 || (args.score as number) > 5) {
      return { kind: "error", text: wire("score.range") }
    }
    return dispatch(store, tool.agentId, tool.skillName, [{ mediaType: "application/json", data: { score: args.score } }], taskId)
  }
  if (taskId && !filled(tool.fields, args)) return pollTask(store, tool.agentId, taskId)
  const content = tool.fields ? fieldParts(tool.fields, args) : promptParts(typeof args.prompt === "string" ? args.prompt : "")
  if ("error" in content) return { kind: "error", text: content.error }
  return dispatch(store, tool.agentId, tool.skillName, content.parts, taskId)
}

function rpc(id: unknown, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result }
}

function protocolError(id: unknown, code: number, message: string, status = 200, data?: unknown): McpResult {
  return {
    status,
    body: { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } },
  }
}

function toolResult(step: Step): McpResult {
  return {
    status: 200,
    body: rpc(null, {
      content: [{ type: "text", text: step.text }],
      ...(step.kind === "error" ? { isError: true } : {}),
    }),
  }
}

function withId(result: McpResult, id: unknown): McpResult {
  if (result.body && typeof result.body === "object" && !Array.isArray(result.body)) {
    ;(result.body as { id: unknown }).id = id
  }
  return result
}

function objectParams(value: unknown) {
  if (value == null) return {}
  if (typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function readTaskParams(params: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(params, "task")) return undefined
  const task = params.task
  if (!task || typeof task !== "object" || Array.isArray(task)) return "invalid" as const
  const ttl = (task as Record<string, unknown>).ttl
  if (ttl != null && (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < 0)) return "invalid" as const
  return "yes" as const
}

function mcpStatus(status: TaskStatus): McpStatus {
  if (status === "submitted" || status === "working") return "working"
  if (status === "input-required") return "input_required"
  if (status === "completed") return "completed"
  if (status === "canceled") return "cancelled"
  return "failed"
}

function terminalStatus(status: McpStatus) {
  return status === "completed" || status === "failed" || status === "cancelled"
}

function expired(task: Task, at = Date.now()) {
  const created = Date.parse(task.createdAt)
  if (!Number.isFinite(created)) return true
  return at - created >= MCP_TASK_TTL_MS
}

function latestDecision(store: Store, task: Task) {
  return [...store.messages].reverse().find((item) => item.taskId === task.id && DECISION_KINDS.has(item.kind))
}

function scorePending(store: Store, task: Task) {
  return task.status === "input-required" && latestDecision(store, task)?.kind === "task.scoreRequest"
}

function mcpStatusMessage(store: Store, task: Task) {
  const status = mcpStatus(task.status)
  if (status === "working") return wire("mcp.workingStatus")
  if (status === "input_required") {
    if (scorePending(store, task)) {
      return wire("mcp.scoreStatus", {
        id: task.id,
        seconds: Math.round(SCORE_WAIT_MS / 1000),
        artifact: task.artifact ?? "",
      })
    }
    return wire("mcp.inputStatus", { text: latestDecision(store, task)?.text ?? "" })
  }
  if (status === "completed") return task.artifact ? wire("mcp.completedStatus") : wire("mcp.emptyArtifact")
  return latestDecision(store, task)?.text || status
}

function projectMcpTask(store: Store, task: Task): McpTask {
  return {
    taskId: task.id,
    status: mcpStatus(task.status),
    statusMessage: mcpStatusMessage(store, task),
    createdAt: task.createdAt,
    lastUpdatedAt: task.updatedAt,
    ttl: MCP_TASK_TTL_MS,
    pollInterval: MCP_TASK_POLL_MS,
  }
}

type Loaded = { ok: true; store: Store; task: Task; view: McpTask } | { ok: false; code: number; message: string }

function loadTask(store: Store, taskId: string): Loaded {
  expireScores(store)
  const task = store.tasks.find((item) => item.id === taskId)
  if (!task) return { ok: false, code: -32602, message: wire("mcp.taskMissing") }
  if (expired(task)) return { ok: false, code: -32602, message: wire("mcp.taskExpired") }
  return { ok: true, store, task, view: projectMcpTask(store, task) }
}

function taskCallResult(store: Store, task: Task) {
  const view = projectTask(store, task, { historyLength: 0, includeArtifacts: true }) as TaskView
  const status = mcpStatus(task.status)
  const meta = { [RELATED_TASK]: { taskId: task.id } }
  if (status === "completed") {
    return { content: [{ type: "text" as const, text: artifactText(view) || wire("mcp.emptyArtifact") }], _meta: meta }
  }
  if (status === "input_required") {
    return { content: [{ type: "text" as const, text: mcpStatusMessage(store, task) }], _meta: meta }
  }
  return {
    content: [{ type: "text" as const, text: statusText(view) || latestDecision(store, task)?.text || status }],
    isError: true,
    _meta: meta,
  }
}

function capabilitiesFor(protocolVersion: string) {
  const tools = { listChanged: false }
  if (protocolVersion !== TASKS_PROTOCOL) return { tools }
  return {
    tools,
    tasks: {
      list: {},
      cancel: {},
      requests: { tools: { call: {} } },
    },
  }
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset), "utf8").toString("base64url")
}

function decodeCursor(cursor: string) {
  const text = Buffer.from(cursor, "base64url").toString("utf8")
  if (!/^\d+$/.test(text)) return undefined
  const offset = Number(text)
  return Number.isSafeInteger(offset) ? offset : undefined
}

async function callLegacy(id: unknown, name: string, args: Record<string, unknown>, io: McpIo): Promise<McpResult> {
  let step = await io.update((store) => dutyStep(store, name, args))
  const deadline = Date.now() + (io.maxWaitMs ?? WAIT_MS)
  const sleep = io.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  while (step.kind === "pending" && Date.now() < deadline) {
    await sleep(Math.min(POLL_MS, deadline - Date.now()))
    const store = await io.read()
    step = withAgent(
      explain(
        dispatchA2a(
          store,
          { kind: "human", agentId: step.agentId },
          { jsonrpc: "2.0", id: `get-${step.taskId}`, method: "GetTask", params: { id: step.taskId } },
          { a2aVersion: "1.0" },
        ),
      ),
      step.agentId,
    )
  }
  return withId(toolResult(step), id)
}

async function callTaskAugmented(id: unknown, name: string, args: Record<string, unknown>, io: McpIo): Promise<McpResult> {
  const outcome = await io.update((store) => {
    const step = dutyStep(store, name, args)
    const taskId = step.kind === "pending" ? step.taskId : step.kind === "done" ? textArg(args.task_id) : undefined
    const task = taskId ? store.tasks.find((item) => item.id === taskId) : undefined
    return { step, view: task ? projectMcpTask(store, task) : undefined }
  })
  if (!outcome.view) return withId(toolResult(outcome.step), id)
  return {
    status: 200,
    body: rpc(id, {
      task: outcome.view,
      _meta: { [IMMEDIATE_RESPONSE]: wire("mcp.taskAccepted", { id: outcome.view.taskId }) },
    }),
  }
}

function applyScore(store: Store, taskId: string, score: unknown): Step {
  expireScores(store)
  if (!Number.isInteger(score) || (score as number) < 1 || (score as number) > 5) return { kind: "error", text: wire("score.range") }
  const task = store.tasks.find((item) => item.id === taskId)
  if (!task || expired(task)) return { kind: "error", text: task ? wire("mcp.taskExpired") : wire("mcp.taskMissing") }
  if (!scorePending(store, task)) return { kind: "error", text: wire("mcp.scoreNotReady") }
  const agentId = task.claimantId ?? task.targetId
  if (!agentId) return { kind: "error", text: wire("mcp.taskMissing") }
  return dispatch(store, agentId, task.skills[0] ?? "", [{ mediaType: "application/json", data: { score } }], taskId)
}

async function scoreWith(id: unknown, args: Record<string, unknown>, io: McpIo): Promise<McpResult> {
  const step = await io.update((store) => {
    const taskId = textArg(args.taskId) ?? textArg(args.task_id)
    if (!taskId) return { kind: "error", text: wire("score.needsTask") } satisfies Step
    return applyScore(store, taskId, args.score)
  })
  return withId(toolResult(step), id)
}

async function getMcpTask(id: unknown, taskId: string, io: McpIo): Promise<McpResult> {
  const loaded = await io.update((store) => loadTask(store, taskId))
  if (!loaded.ok) return protocolError(id, loaded.code, loaded.message)
  return { status: 200, body: rpc(id, loaded.view) }
}

async function listMcpTasks(id: unknown, params: Record<string, unknown>, io: McpIo): Promise<McpResult> {
  if (params.cursor != null && typeof params.cursor !== "string") return protocolError(id, -32602, wire("mcp.cursor"))
  const cursor = typeof params.cursor === "string" ? params.cursor : ""
  let offset = 0
  if (cursor) {
    const decoded = decodeCursor(cursor)
    if (decoded == null) return protocolError(id, -32602, wire("mcp.cursor"))
    offset = decoded
  }
  const page = await io.update((store) => {
    expireScores(store)
    const live = store.tasks.filter((task) => !expired(task))
    const slice = live.slice(offset, offset + LIST_PAGE)
    const next = offset + slice.length < live.length ? encodeCursor(offset + slice.length) : undefined
    return { tasks: slice.map((task) => projectMcpTask(store, task)), ...(next ? { nextCursor: next } : {}) }
  })
  return { status: 200, body: rpc(id, page) }
}

async function cancelMcpTask(id: unknown, taskId: string, io: McpIo): Promise<McpResult> {
  const outcome = await io.update((store) => {
    const loaded = loadTask(store, taskId)
    if (!loaded.ok) return loaded
    if (terminalStatus(loaded.view.status)) {
      return { ok: false as const, code: -32602, message: wire("mcp.cancelTerminal", { status: loaded.view.status }) }
    }
    const agentId = loaded.task.claimantId ?? loaded.task.targetId
    if (!agentId) return { ok: false as const, code: -32602, message: wire("mcp.taskMissing") }
    const response = dispatchA2a(
      store,
      { kind: "human", agentId },
      { jsonrpc: "2.0", id: `cancel-${taskId}`, method: "CancelTask", params: { id: taskId } },
      { a2aVersion: "1.0" },
    )
    if ("error" in response) {
      const status = mcpStatus(loaded.task.status)
      if (terminalStatus(status)) return { ok: false as const, code: -32602, message: wire("mcp.cancelTerminal", { status }) }
      return { ok: false as const, code: -32602, message: response.error.message }
    }
    return { ok: true as const, view: projectMcpTask(store, loaded.task) }
  })
  if (!outcome.ok) return protocolError(id, outcome.code, outcome.message)
  return { status: 200, body: rpc(id, outcome.view) }
}

// tasks/result blocks until a terminal status in the spec. This route answers one JSON body,
// so a working task is polled only until maxWaitMs and then returns -32099. input_required
// returns the ask immediately: there is no SSE stream for an elicitation request.
async function resultMcpTask(id: unknown, taskId: string, io: McpIo): Promise<McpResult> {
  const deadline = Date.now() + (io.maxWaitMs ?? WAIT_MS)
  const sleep = io.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  for (;;) {
    const loaded = await io.update((store) => loadTask(store, taskId))
    if (!loaded.ok) return protocolError(id, loaded.code, loaded.message)
    if (loaded.view.status !== "working") {
      return { status: 200, body: rpc(id, taskCallResult(loaded.store, loaded.task)) }
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) return protocolError(id, TASK_NOT_READY, wire("mcp.taskNotTerminal", { status: loaded.view.status }))
    await sleep(Math.min(MCP_TASK_POLL_MS, remaining))
  }
}

function metaRecord(request: Record<string, unknown>) {
  const params = request.params
  const sources = [
    params && typeof params === "object" && !Array.isArray(params) ? (params as Record<string, unknown>)._meta : undefined,
    request._meta,
  ]
  for (const source of sources) {
    if (source && typeof source === "object" && !Array.isArray(source)) return source as Record<string, unknown>
  }
  return undefined
}

function headerText(value: string | null | undefined) {
  if (!value) return undefined
  const encoded = /^=\?base64\?([A-Za-z0-9+/]+={0,2})\?=$/.exec(value)
  if (!encoded) return value
  return Buffer.from(encoded[1], "base64").toString("utf8")
}

function declaredVersion(request: Record<string, unknown>, headers: McpHeaders | undefined) {
  const meta = metaRecord(request)
  const fromMeta = typeof meta?.[PROTOCOL_VERSION_KEY] === "string" ? meta[PROTOCOL_VERSION_KEY] : undefined
  const fromHeader = headers?.protocolVersion?.trim() || undefined
  return { meta, fromMeta, fromHeader }
}

function openEra(request: Record<string, unknown>, headers: McpHeaders | undefined): McpResult | "legacy" | "modern" {
  const id = request.id ?? null
  const { fromMeta, fromHeader } = declaredVersion(request, headers)
  if (fromHeader && fromMeta && fromHeader !== fromMeta) {
    return protocolError(id, -32020, wire("mcp.headerMismatch", { name: "MCP-Protocol-Version", header: fromHeader, body: fromMeta }), 400)
  }
  const declared = fromMeta ?? fromHeader
  if (!declared) return "legacy"
  if (declared !== MODERN_PROTOCOL) {
    if (PROTOCOL_VERSIONS.has(declared)) return "legacy"
    return protocolError(id, -32022, wire("mcp.unsupportedVersion"), 400, { supported: SUPPORTED_VERSIONS, requested: declared })
  }
  if (!fromHeader) return protocolError(id, -32020, wire("mcp.headerMissing", { name: "MCP-Protocol-Version" }), 400)
  if (!fromMeta) return protocolError(id, -32020, wire("mcp.headerMismatch", { name: "MCP-Protocol-Version", header: fromHeader, body: "" }), 400)
  return "modern"
}

function serverMeta() {
  return { [SERVER_INFO_KEY]: SERVER_INFO }
}

function modernResult(id: unknown, result: Record<string, unknown>, status = 200): McpResult {
  const meta = { ...(result._meta as Record<string, unknown> | undefined), ...serverMeta() }
  return { status, body: rpc(id, { ...result, _meta: meta }) }
}

function hasTasksExtension(capabilities: unknown) {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return false
  const extensions = (capabilities as Record<string, unknown>).extensions
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) return false
  return Object.prototype.hasOwnProperty.call(extensions, TASKS_EXTENSION)
}

function missingTasks(id: unknown): McpResult {
  return protocolError(id, -32021, wire("mcp.missingTasks"), 400, {
    requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } },
  })
}

function namedHeader(method: string, params: Record<string, unknown>) {
  if (method === "tools/call") return typeof params.name === "string" ? params.name : ""
  if (method === "tasks/get" || method === "tasks/update" || method === "tasks/cancel") return textArg(params.taskId) ?? ""
  return undefined
}

function checkModernHeaders(id: unknown, method: string, params: Record<string, unknown>, headers: McpHeaders): McpResult | undefined {
  const methodHeader = headerText(headers.method)
  if (!methodHeader) return protocolError(id, -32020, wire("mcp.headerMissing", { name: "Mcp-Method" }), 400)
  if (methodHeader !== method) {
    return protocolError(id, -32020, wire("mcp.headerMismatch", { name: "Mcp-Method", header: methodHeader, body: method }), 400)
  }
  const expected = namedHeader(method, params)
  if (expected === undefined) return undefined
  const nameHeader = headerText(headers.name)
  if (!nameHeader) return protocolError(id, -32020, wire("mcp.headerMissing", { name: "Mcp-Name" }), 400)
  if (nameHeader !== expected) {
    return protocolError(id, -32020, wire("mcp.headerMismatch", { name: "Mcp-Name", header: nameHeader, body: expected }), 400)
  }
  return undefined
}

function modernToolList(store: Store) {
  return [...listDutyTools(store), scoreTool()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
}

function toolPayload(store: Store, task: Task) {
  const failed = task.status === "failed" || task.status === "rejected"
  if (failed) return { content: [{ type: "text" as const, text: latestDecision(store, task)?.text || "failed" }], isError: true }
  const view = projectTask(store, task, { historyLength: 0, includeArtifacts: true }) as TaskView
  return { content: [{ type: "text" as const, text: artifactText(view) || wire("mcp.emptyArtifact") }], isError: false }
}

function inputRequestsFor(store: Store, task: Task) {
  const message = mcpStatusMessage(store, task)
  if (scorePending(store, task)) {
    return {
      score: {
        method: "elicitation/create",
        params: {
          mode: "form",
          message,
          requestedSchema: {
            type: "object",
            properties: { score: { type: "integer", minimum: 1, maximum: 5 } },
            required: ["score"],
          },
        },
      },
    }
  }
  return {
    followUp: {
      method: "elicitation/create",
      params: {
        mode: "form",
        message,
        requestedSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      },
    },
  }
}

function modernTask(store: Store, task: Task) {
  const a2aFailed = task.status === "failed" || task.status === "rejected"
  const status = a2aFailed || task.status === "completed" ? "completed" : mcpStatus(task.status)
  const body: Record<string, unknown> = {
    resultType: "complete",
    taskId: task.id,
    status,
    statusMessage: mcpStatusMessage(store, task),
    createdAt: task.createdAt,
    lastUpdatedAt: task.updatedAt,
    ttlMs: MCP_TASK_TTL_MS,
    pollIntervalMs: MCP_TASK_POLL_MS,
  }
  if (status === "input_required") body.inputRequests = inputRequestsFor(store, task)
  if (status === "completed") body.result = toolPayload(store, task)
  return body
}

function responseContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const content = (value as Record<string, unknown>).content
  if (!content || typeof content !== "object" || Array.isArray(content)) return undefined
  return content as Record<string, unknown>
}

function scoreFromResponse(value: unknown) {
  const content = responseContent(value)
  if (!content) return undefined
  if (Number.isInteger(content.score)) return content.score as number
  const input = content.input
  if (Number.isInteger(input)) return input as number
  if (input && typeof input === "object" && !Array.isArray(input) && Number.isInteger((input as Record<string, unknown>).score)) {
    return (input as Record<string, unknown>).score as number
  }
  return undefined
}

function textFromResponse(value: unknown) {
  const content = responseContent(value)
  if (!content) return undefined
  if (typeof content.text === "string" && content.text.trim()) return content.text.trim()
  const input = content.input
  if (typeof input === "string" && input.trim()) return input.trim()
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const text = (input as Record<string, unknown>).text
    if (typeof text === "string" && text.trim()) return text.trim()
  }
  return undefined
}

function applyFollowUp(store: Store, taskId: string, text: string): Step {
  expireScores(store)
  const task = store.tasks.find((item) => item.id === taskId)
  if (!task || expired(task)) return { kind: "error", text: task ? wire("mcp.taskExpired") : wire("mcp.taskMissing") }
  if (task.status !== "input-required" || scorePending(store, task)) return { kind: "done", text: "" }
  const agentId = task.claimantId ?? task.targetId
  if (!agentId) return { kind: "error", text: wire("mcp.taskMissing") }
  return dispatch(store, agentId, task.skills[0] ?? "", [{ text }], taskId)
}

async function discoverModern(id: unknown): Promise<McpResult> {
  return modernResult(id, {
    resultType: "complete",
    supportedVersions: SUPPORTED_VERSIONS,
    capabilities: { tools: { listChanged: false }, extensions: { [TASKS_EXTENSION]: {} } },
    instructions: INSTRUCTIONS,
    ttlMs: 3_600_000,
    cacheScope: "public",
  })
}

async function callModernTask(id: unknown, name: string, args: Record<string, unknown>, io: McpIo): Promise<McpResult> {
  const outcome = await io.update((store) => {
    const step = dutyStep(store, name, args)
    const taskId = step.kind === "pending" ? step.taskId : step.kind === "done" ? textArg(args.task_id) : undefined
    const task = taskId ? store.tasks.find((item) => item.id === taskId) : undefined
    return { step, task, store }
  })
  if (!outcome.task) {
    const result = withId(toolResult(outcome.step), id)
    const body = result.body as { result: Record<string, unknown> }
    body.result.resultType = "complete"
    body.result._meta = serverMeta()
    return result
  }
  return modernResult(id, {
    resultType: "task",
    taskId: outcome.task.id,
    status: mcpStatus(outcome.task.status),
    statusMessage: mcpStatusMessage(outcome.store, outcome.task),
    createdAt: outcome.task.createdAt,
    lastUpdatedAt: outcome.task.updatedAt,
    ttlMs: MCP_TASK_TTL_MS,
    pollIntervalMs: MCP_TASK_POLL_MS,
  })
}

async function updateModernTask(id: unknown, params: Record<string, unknown>, io: McpIo): Promise<McpResult> {
  const taskId = textArg(params.taskId)
  if (!taskId) return protocolError(id, -32602, wire("mcp.taskIdParam"))
  const responses = params.inputResponses
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) return protocolError(id, -32602, wire("params.object"))
  const record = responses as Record<string, unknown>
  const outcome = await io.update((store) => {
    const loaded = loadTask(store, taskId)
    if (!loaded.ok) return loaded
    if ("score" in record && scorePending(store, loaded.task)) {
      const score = scoreFromResponse(record.score)
      if (score == null) return { ok: false as const, code: -32602, message: wire("score.range") }
      const step = applyScore(store, taskId, score)
      if (step.kind === "error") return { ok: false as const, code: -32602, message: step.text }
    }
    if ("followUp" in record && loaded.task.status === "input-required" && !scorePending(store, loaded.task)) {
      const text = textFromResponse(record.followUp)
      if (!text) return { ok: false as const, code: -32602, message: wire("mcp.fieldsRequired") }
      const step = applyFollowUp(store, taskId, text)
      if (step.kind === "error") return { ok: false as const, code: -32602, message: step.text }
    }
    return { ok: true as const }
  })
  if (!outcome.ok) return protocolError(id, outcome.code, outcome.message)
  return modernResult(id, { resultType: "complete" })
}

async function cancelModernTask(id: unknown, taskId: string, io: McpIo): Promise<McpResult> {
  const outcome = await io.update((store) => {
    const loaded = loadTask(store, taskId)
    if (!loaded.ok) return loaded
    if (terminalStatus(mcpStatus(loaded.task.status)) || loaded.task.status === "failed" || loaded.task.status === "rejected") {
      return { ok: true as const }
    }
    const agentId = loaded.task.claimantId ?? loaded.task.targetId
    if (!agentId) return { ok: false as const, code: -32602, message: wire("mcp.taskMissing") }
    dispatchA2a(
      store,
      { kind: "human", agentId },
      { jsonrpc: "2.0", id: `cancel-${taskId}`, method: "CancelTask", params: { id: taskId } },
      { a2aVersion: "1.0" },
    )
    return { ok: true as const }
  })
  if (!outcome.ok) return protocolError(id, outcome.code, outcome.message)
  return modernResult(id, { resultType: "complete" })
}

async function handleModern(request: Record<string, unknown>, io: McpIo, headers: McpHeaders): Promise<McpResult> {
  const id = request.id ?? null
  const method = request.method
  if (typeof method !== "string") return protocolError(id, -32600, wire("rpc.not"), 400)
  if (!("id" in request) && method.startsWith("notifications/")) return { status: 202, body: null }
  const params = objectParams(request.params)
  if (!params) return protocolError(id, -32602, wire("params.object"), 400)
  const meta = metaRecord(request)
  if (!meta || !Object.prototype.hasOwnProperty.call(meta, CLIENT_CAPABILITIES_KEY)) {
    return protocolError(id, -32602, wire("mcp.capabilitiesRequired"), 400)
  }
  const headerError = checkModernHeaders(id, method, params, headers)
  if (headerError) return headerError
  const capabilities = meta[CLIENT_CAPABILITIES_KEY]
  const tasks = hasTasksExtension(capabilities)
  if (method === "server/discover") return discoverModern(id)
  if (method === "tools/list") {
    const store = await io.read()
    return modernResult(id, { resultType: "complete", tools: modernToolList(store) })
  }
  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : ""
    const args = argumentRecord(params)
    if (name === SCORE_TOOL) {
      const scored = await scoreWith(id, args, io)
      const body = scored.body as { result?: Record<string, unknown> }
      if (body.result) {
        body.result.resultType = "complete"
        body.result._meta = { ...(body.result._meta as Record<string, unknown> | undefined), ...serverMeta() }
      }
      return scored
    }
    if (tasks) return callModernTask(id, name, args, io)
    const legacy = await callLegacy(id, name, args, io)
    const body = legacy.body as { result?: Record<string, unknown> }
    if (body?.result) {
      body.result.resultType = "complete"
      body.result._meta = { ...(body.result._meta as Record<string, unknown> | undefined), ...serverMeta() }
    }
    return legacy
  }
  if (method === "tasks/get" || method === "tasks/update" || method === "tasks/cancel") {
    if (!tasks) return missingTasks(id)
    if (method === "tasks/update") return updateModernTask(id, params, io)
    const taskId = textArg(params.taskId)
    if (!taskId) return protocolError(id, -32602, wire("mcp.taskIdParam"))
    if (method === "tasks/cancel") return cancelModernTask(id, taskId, io)
    const loaded = await io.update((store) => loadTask(store, taskId))
    if (!loaded.ok) return protocolError(id, loaded.code, loaded.message)
    return modernResult(id, modernTask(loaded.store, loaded.task))
  }
  return protocolError(id, -32601, wire("method.unknown", { method }), 404)
}

export async function handleMcp(body: unknown, io: McpIo, headers?: McpHeaders): Promise<McpResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: wire("rpc.not") } } }
  }
  const request = body as Record<string, unknown>
  const era = openEra(request, headers)
  if (era !== "legacy" && era !== "modern") return era
  if (era === "modern") return handleModern(request, io, headers ?? {})
  const method = request.method
  if (typeof method !== "string") {
    return { status: 400, body: { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32600, message: wire("rpc.not") } } }
  }
  if (!("id" in request) && method.startsWith("notifications/")) return { status: 202, body: null }
  const id = request.id ?? null
  if (method === "initialize") {
    const params = request.params as Record<string, unknown> | undefined
    const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL
    const protocolVersion = PROTOCOL_VERSIONS.has(asked) ? asked : DEFAULT_PROTOCOL
    return {
      status: 200,
      body: rpc(id, {
        protocolVersion,
        capabilities: capabilitiesFor(protocolVersion),
        serverInfo: { name: "a2human", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      }),
    }
  }
  if (method === "ping") return { status: 200, body: rpc(id, {}) }
  if (method === "tools/list") {
    const store = await io.read()
    return { status: 200, body: rpc(id, { tools: [...listDutyTools(store), scoreTool()] }) }
  }
  if (method === "tools/call") {
    const params = objectParams(request.params)
    if (!params) return protocolError(id, -32602, wire("params.object"))
    const name = typeof params.name === "string" ? params.name : ""
    const args = argumentRecord(params)
    const taskMode = readTaskParams(params)
    if (taskMode === "invalid") return protocolError(id, -32602, wire("mcp.taskParams"))
    if (name === SCORE_TOOL) {
      if (taskMode === "yes") return protocolError(id, -32601, wire("mcp.taskForbidden"))
      return scoreWith(id, args, io)
    }
    if (taskMode === "yes") return callTaskAugmented(id, name, args, io)
    return callLegacy(id, name, args, io)
  }
  const params = objectParams(request.params)
  if (method === "tasks/get" || method === "tasks/result" || method === "tasks/cancel") {
    if (!params) return protocolError(id, -32602, wire("params.object"))
    const taskId = textArg(params.taskId)
    if (!taskId) return protocolError(id, -32602, wire("mcp.taskIdParam"))
    if (method === "tasks/get") return getMcpTask(id, taskId, io)
    if (method === "tasks/cancel") return cancelMcpTask(id, taskId, io)
    return resultMcpTask(id, taskId, io)
  }
  if (method === "tasks/list") {
    if (!params) return protocolError(id, -32602, wire("params.object"))
    return listMcpTasks(id, params, io)
  }
  return { status: 200, body: { jsonrpc: "2.0", id, error: { code: -32601, message: wire("method.unknown", { method: String(method) }) } } }
}
