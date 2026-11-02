import { dispatchA2a, type RpcResponse } from "./a2a"
import { recordLine } from "./format"
import { onDuty, workRecord } from "./rules"
import type { JsonSchema, Store } from "./types"

const PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"])
const DEFAULT_PROTOCOL = "2025-06-18"
const WAIT_MS = 15_000
const POLL_MS = 1_000

const INSTRUCTIONS =
  "会 A2A 的客户端读发现入口 /.well-known/agent-card.json，从 onDuty 里自己选人，把 SendMessage 打到那个人的 url。这个 MCP 入口是备用：每个在岗技能是一个工具，调用仍发到这个人自己的 A2A 地址。人还在做时，用 task_id 再调一次。人交回产物后，结果是打分请求，用 task_id 和 score 再调一次。"

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
  update: (fn: (store: Store) => Step) => Step | Promise<Step>
  maxWaitMs?: number
  sleep?: (ms: number) => Promise<void>
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
          ? { type: "string", description: field.description || "图片的 http 地址，或 data:image/png;base64,…" }
          : { type: field.kind, ...(field.description ? { description: field.description } : {}) }
      if (field.required) required.push(field.name)
    }
  } else {
    properties.prompt = { type: "string", description: "要这个人办的事。内容若是 JSON 对象或数组，会按 application/json 送出。" }
  }
  if (!properties.task_id) {
    properties.task_id = { type: "string", description: "人还在做、请你补充或请你打分时带上的任务 id。" }
  }
  if (!properties.score) {
    properties.score = { type: "integer", description: "给做这单的人打的 1 到 5 分。只有结果要求打分时才填。" }
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
          `在岗的人：${agent.name}。技能：${skill.name}。`,
          `${recordLine(record.completed, record.averageScore, record.averageDuration)}。`,
          skill.description,
          "会 A2A 的客户端应直接把 SendMessage 打到这个人的地址。这里的调用仍走那个人的 A2A。人还在做时，只填 task_id 再调一次。结果若是打分请求，用 task_id 和 score 再调一次。",
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
  return catalog(store).map(({ name, description, inputSchema: schema }) => ({ name, description, inputSchema: schema }))
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
  if (!task?.id) return { kind: "error", text: "没有返回任务" }
  const state = task.status?.state
  const note = statusText(task)
  const artifact = artifactText(task)
  if (state === "TASK_STATE_WORKING" || state === "TASK_STATE_SUBMITTED") {
    return { kind: "pending", taskId: task.id, agentId: "", text: `人还在做。用同一个工具再调一次，task_id 填 ${task.id}。` }
  }
  if (state === "TASK_STATE_INPUT_REQUIRED") return { kind: "done", text: note || artifact || state }
  if (state === "TASK_STATE_COMPLETED") return { kind: "done", text: artifact || "人交回了空产物" }
  if (state === "TASK_STATE_FAILED" || state === "TASK_STATE_CANCELED" || state === "TASK_STATE_REJECTED") {
    return { kind: "error", text: note || artifact || state }
  }
  return { kind: "error", text: note || `任务停在 ${state ?? "未知状态"}` }
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
        metadata: { skill: skillName, caller: "MCP" },
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
  if (!matched) return { error: "图片要是 http 地址，或 data:image/png;base64,…" }
  return { mediaType: matched[1], raw: matched[2].replace(/\s/g, "") }
}

function promptParts(prompt: string): { parts: Record<string, unknown>[] } | { error: string } {
  const text = prompt.trim()
  if (!text) return { error: "prompt 不能是空的" }
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const data = JSON.parse(text) as unknown
      if (data && typeof data === "object") return { parts: [{ mediaType: "application/json", data }] }
    } catch {
      // 普通文字里碰巧以括号开头，按文字送出。
    }
  }
  return { parts: [{ text }] }
}

function fieldParts(fields: FlatField[], args: Record<string, unknown>): { parts: Record<string, unknown>[] } | { error: string } {
  const data: Record<string, unknown> = {}
  const parts: Record<string, unknown>[] = []
  for (const field of fields) {
    const value = args[field.name]
    if (field.required && (value == null || value === "")) return { error: `还缺 ${field.name}` }
    if (value == null || value === "") continue
    if (field.kind === "image") {
      if (typeof value !== "string") return { error: "图片要是 http 地址，或 data:image/png;base64,…" }
      const image = imagePart(value)
      if ("error" in image) return image
      parts.push(image)
      continue
    }
    if (field.kind === "string" && typeof value !== "string") return { error: `${field.name} 要是文字` }
    if (field.kind === "integer" && !Number.isInteger(value)) return { error: `${field.name} 要是整数` }
    if (field.kind === "number" && typeof value !== "number") return { error: `${field.name} 要是数字` }
    if (field.kind === "boolean" && typeof value !== "boolean") return { error: `${field.name} 要是是或否` }
    data[field.name] = value
  }
  if (Object.keys(data).length) parts.unshift({ mediaType: "application/json", data })
  if (!parts.length) return { error: "要填这项技能要求的内容。" }
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
  if (!tool) return { kind: "error", text: "没有这项在岗技能" }
  const taskId = textArg(args.task_id)
  if (args.score != null && args.score !== "") {
    if (!taskId) return { kind: "error", text: "打分要带上任务 id" }
    if (!Number.isInteger(args.score) || (args.score as number) < 1 || (args.score as number) > 5) {
      return { kind: "error", text: "分数要是 1 到 5 的整数" }
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

function toolResult(step: Step): McpResult {
  return {
    status: 200,
    body: rpc(null, {
      content: [{ type: "text", text: step.text }],
      ...(step.kind === "error" ? { isError: true } : {}),
    }),
  }
}

export async function handleMcp(body: unknown, io: McpIo): Promise<McpResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "请求不是 JSON-RPC" } } }
  }
  const request = body as Record<string, unknown>
  const method = request.method
  if (typeof method !== "string") {
    return { status: 400, body: { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32600, message: "请求不是 JSON-RPC" } } }
  }
  if (!("id" in request) && method.startsWith("notifications/")) return { status: 202, body: null }
  const id = request.id ?? null
  if (method === "initialize") {
    const params = request.params as Record<string, unknown> | undefined
    const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL
    return {
      status: 200,
      body: rpc(id, {
        protocolVersion: PROTOCOL_VERSIONS.has(asked) ? asked : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "a2human", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      }),
    }
  }
  if (method === "ping") return { status: 200, body: rpc(id, {}) }
  if (method === "tools/list") {
    const store = await io.read()
    return { status: 200, body: rpc(id, { tools: listDutyTools(store) }) }
  }
  if (method === "tools/call") {
    const params = request.params as Record<string, unknown> | undefined
    const name = typeof params?.name === "string" ? params.name : ""
    const args = argumentRecord(params)
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
    const body = toolResult(step).body as { id: unknown }
    body.id = id
    return { status: 200, body }
  }
  return { status: 200, body: { jsonrpc: "2.0", id, error: { code: -32601, message: `不认识的方法 ${method}` } } }
}
