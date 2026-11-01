import { DomainError, cancelCommandedTask, receiveCommand } from "./rules"
import type { ProtocolMessage, Store, Task, TaskStatus } from "./types"

type Scope = { kind: "human"; agentId: string } | { kind: "pool" }

type RpcError = { jsonrpc: "2.0"; id: unknown; error: { code: number; message: string } }
type RpcOk = { jsonrpc: "2.0"; id: unknown; result: unknown }
export type RpcResponse = RpcOk | RpcError

const STATES: Record<TaskStatus, string> = {
  submitted: "TASK_STATE_SUBMITTED",
  working: "TASK_STATE_WORKING",
  completed: "TASK_STATE_COMPLETED",
  canceled: "TASK_STATE_CANCELED",
}

const STATE_NAMES = new Map(Object.entries(STATES).map(([status, name]) => [name, status as TaskStatus]))

function ok(id: unknown, result: unknown): RpcOk {
  return { jsonrpc: "2.0", id, result }
}

function fail(id: unknown, code: number, message: string): RpcError {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

function asId(value: unknown) {
  if (value == null || typeof value === "string" || typeof value === "number") return value ?? null
  return undefined
}

export function projectTask(
  store: Store,
  task: Task,
  options: { historyLength?: number | null; includeArtifacts?: boolean },
) {
  const related = store.messages.filter((item) => item.taskId === task.id)
  let history = related
  if (options.historyLength != null) {
    history = options.historyLength === 0 ? [] : related.slice(-options.historyLength)
  }
  const body: Record<string, unknown> = {
    id: task.id,
    contextId: task.contextId ?? task.id,
    status: {
      state: STATES[task.status],
      timestamp: task.updatedAt,
    },
    history: history.map(projectMessage),
    metadata: {
      title: task.title,
      source: task.source ?? "board",
      claimantName: task.claimantName,
      reward: task.reward,
    },
  }
  if (options.includeArtifacts !== false) {
    body.artifacts = task.artifact
      ? [
          {
            artifactId: `${task.id}:artifact`,
            name: "产物",
            parts: [{ text: task.artifact }],
          },
        ]
      : []
  }
  return body
}

function projectMessage(message: ProtocolMessage) {
  const fromHuman = message.kind === "task.claim" || message.kind === "task.artifact" || message.kind === "task.abandon"
  return {
    messageId: message.a2aMessageId ?? message.id,
    role: fromHuman ? "ROLE_AGENT" : "ROLE_USER",
    parts: [{ text: message.text }],
    taskId: message.taskId,
  }
}

function visible(task: Task, scope: Scope) {
  if (scope.kind === "pool") return task.source === "pool"
  return task.claimantId === scope.agentId || task.targetId === scope.agentId
}

function requireVisible(store: Store, scope: Scope, id: string) {
  const task = store.tasks.find((item) => item.id === id)
  if (!task || !visible(task, scope)) throw new DomainError("找不到这张任务")
  return task
}

function textFromParts(parts: unknown) {
  if (!Array.isArray(parts) || parts.length === 0) return null
  const chunks: string[] = []
  for (const part of parts) {
    if (typeof part === "string") chunks.push(part)
    else if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
      chunks.push(part.text)
    }
  }
  const text = chunks.join("\n").trim()
  return text.length > 0 ? text : null
}

function callerName(params: Record<string, unknown>, message: Record<string, unknown>) {
  const sources = [params.metadata, message.metadata]
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue
    const name = (source as { caller?: unknown }).caller
    if (typeof name !== "string") continue
    const trimmed = name.trim()
    const length = [...trimmed].length
    if (length >= 1 && length <= 24) return trimmed
  }
  return "外部模型"
}

function historyLength(value: unknown) {
  if (value == null) return null
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new DomainError("historyLength 无效")
  }
  return value
}

function taskIdFrom(params: Record<string, unknown>) {
  if (typeof params.id === "string" && params.id.trim()) return params.id.trim()
  if (typeof params.taskId === "string" && params.taskId.trim()) return params.taskId.trim()
  if (typeof params.name === "string") {
    const matched = /^tasks\/(.+)$/.exec(params.name.trim())
    if (matched) return matched[1]
  }
  return null
}

function sendMessage(store: Store, scope: Scope, params: Record<string, unknown>) {
  const message = params.message
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new DomainError("params.message 缺失")
  }
  const record = message as Record<string, unknown>
  const role = record.role
  if (role !== "ROLE_USER" && role !== "user") throw new DomainError("role 需要是 ROLE_USER")
  if (typeof record.messageId !== "string" || record.messageId.trim().length === 0) {
    throw new DomainError("messageId 缺失")
  }
  const text = textFromParts(record.parts)
  if (!text) throw new DomainError("parts 里需要一段文字")
  const taskId = typeof record.taskId === "string" && record.taskId.trim() ? record.taskId.trim() : undefined
  const task = receiveCommand(store, {
    mode: scope.kind === "human" ? "direct" : "pool",
    humanId: scope.kind === "human" ? scope.agentId : undefined,
    text,
    messageId: record.messageId.trim(),
    taskId,
    callerName: callerName(params, record),
  })
  return { task: projectTask(store, task, { includeArtifacts: true }) }
}

function getTask(store: Store, scope: Scope, params: Record<string, unknown>) {
  const id = taskIdFrom(params)
  if (!id) throw new DomainError("缺少任务 id")
  const task = requireVisible(store, scope, id)
  return projectTask(store, task, {
    historyLength: historyLength(params.historyLength),
    includeArtifacts: true,
  })
}

function listTasks(store: Store, scope: Scope, params: Record<string, unknown>) {
  let pageSize = 50
  if (params.pageSize != null) {
    if (typeof params.pageSize !== "number" || !Number.isInteger(params.pageSize) || params.pageSize < 1 || params.pageSize > 100) {
      throw new DomainError("pageSize 要是 1 到 100 的整数")
    }
    pageSize = params.pageSize
  }
  let offset = 0
  if (params.pageToken != null && params.pageToken !== "") {
    if (typeof params.pageToken !== "string" || !/^\d+$/.test(params.pageToken)) {
      throw new DomainError("pageToken 无效")
    }
    offset = Number(params.pageToken)
  }
  let tasks = store.tasks.filter((task) => visible(task, scope))
  if (typeof params.contextId === "string" && params.contextId) {
    tasks = tasks.filter((task) => (task.contextId ?? task.id) === params.contextId)
  }
  if (params.status != null) {
    if (typeof params.status !== "string" || !STATE_NAMES.has(params.status)) {
      throw new DomainError("status 不在协议状态里")
    }
    const status = STATE_NAMES.get(params.status)
    tasks = tasks.filter((task) => task.status === status)
  }
  const slice = tasks.slice(offset, offset + pageSize)
  const next = offset + slice.length < tasks.length ? String(offset + slice.length) : ""
  const length = historyLength(params.historyLength)
  const includeArtifacts = params.includeArtifacts === true
  return {
    tasks: slice.map((task) => projectTask(store, task, { historyLength: length, includeArtifacts })),
    totalSize: tasks.length,
    pageSize,
    nextPageToken: next,
  }
}

function cancelTask(store: Store, scope: Scope, params: Record<string, unknown>) {
  const id = taskIdFrom(params)
  if (!id) throw new DomainError("缺少任务 id")
  requireVisible(store, scope, id)
  const task = cancelCommandedTask(store, id)
  return projectTask(store, task, { includeArtifacts: true })
}

export function dispatchA2a(store: Store, scope: Scope, body: unknown): RpcResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(null, -32600, "请求不是 JSON-RPC")
  }
  const request = body as Record<string, unknown>
  const id = asId(request.id)
  if (id === undefined || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return fail(id === undefined ? null : id, -32600, "请求不是 JSON-RPC 2.0")
  }
  const method = request.method
  if (method === "SendStreamingMessage" || method === "message/stream" || method === "SubscribeToTask" || method === "tasks/subscribe") {
    return fail(id, -32004, "不支持流式。请用 SendMessage，再轮询 GetTask。")
  }
  const params = request.params
  if (params != null && (typeof params !== "object" || Array.isArray(params))) {
    return fail(id, -32602, "params 要是对象")
  }
  const record = (params ?? {}) as Record<string, unknown>
  try {
    if (method === "SendMessage" || method === "message/send") {
      return ok(id, sendMessage(store, scope, record))
    }
    if (method === "GetTask" || method === "tasks/get") {
      return ok(id, getTask(store, scope, record))
    }
    if (method === "ListTasks" || method === "tasks/list") {
      return ok(id, listTasks(store, scope, record))
    }
    if (method === "CancelTask" || method === "tasks/cancel") {
      return ok(id, cancelTask(store, scope, record))
    }
    return fail(id, -32601, `不认识的方法 ${method}`)
  } catch (error) {
    if (error instanceof DomainError) {
      const code = error.message === "找不到这张任务" ? -32001 : -32602
      return fail(id, code, error.message)
    }
    throw error
  }
}
