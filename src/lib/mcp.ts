import { dispatchA2a, projectTask, type RpcResponse } from "./a2a"
import { wire } from "./copy"
import { recordLine } from "./format"
import { expireScores, onDuty, SCORE_WAIT_MS, workRecord } from "./rules"
import type { JsonSchema, Store, Task, TaskStatus } from "./types"

const PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"])
const TASKS_PROTOCOL = "2025-11-25"
const DEFAULT_PROTOCOL = TASKS_PROTOCOL
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

function protocolError(id: unknown, code: number, message: string): McpResult {
  return { status: 200, body: { jsonrpc: "2.0", id, error: { code, message } } }
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

async function scoreWith(id: unknown, args: Record<string, unknown>, io: McpIo): Promise<McpResult> {
  const step = await io.update((store) => {
    expireScores(store)
    const taskId = textArg(args.taskId) ?? textArg(args.task_id)
    if (!taskId) return { kind: "error", text: wire("score.needsTask") } satisfies Step
    if (!Number.isInteger(args.score) || (args.score as number) < 1 || (args.score as number) > 5) {
      return { kind: "error", text: wire("score.range") } satisfies Step
    }
    const task = store.tasks.find((item) => item.id === taskId)
    if (!task || expired(task)) return { kind: "error", text: task ? wire("mcp.taskExpired") : wire("mcp.taskMissing") } satisfies Step
    if (!scorePending(store, task)) return { kind: "error", text: wire("mcp.scoreNotReady") } satisfies Step
    const agentId = task.claimantId ?? task.targetId
    if (!agentId) return { kind: "error", text: wire("mcp.taskMissing") } satisfies Step
    return dispatch(store, agentId, task.skills[0] ?? "", [{ mediaType: "application/json", data: { score: args.score } }], taskId)
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

export async function handleMcp(body: unknown, io: McpIo): Promise<McpResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: wire("rpc.not") } } }
  }
  const request = body as Record<string, unknown>
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
