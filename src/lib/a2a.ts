import { wire } from "./copy"
import { readImage, type TaskImage } from "./images"
import { DomainError, cancelCommandedTask, commandForMessage, expireScores, receiveCommand } from "./rules"
import type { ProtocolMessage, Store, Task, TaskStatus } from "./types"

type Scope = { kind: "human"; agentId: string } | { kind: "pool" }

type ErrorInfo = {
  "@type": "type.googleapis.com/google.rpc.ErrorInfo"
  reason: string
  domain: "a2a-protocol.org"
}

type RpcError = {
  jsonrpc: "2.0"
  id: unknown
  error: { code: number; message: string; data?: ErrorInfo[] }
}
type RpcOk = { jsonrpc: "2.0"; id: unknown; result: unknown }
export type RpcResponse = RpcOk | RpcError

const STATES: Record<TaskStatus, string> = {
  submitted: "TASK_STATE_SUBMITTED",
  working: "TASK_STATE_WORKING",
  completed: "TASK_STATE_COMPLETED",
  canceled: "TASK_STATE_CANCELED",
  failed: "TASK_STATE_FAILED",
  rejected: "TASK_STATE_REJECTED",
  "input-required": "TASK_STATE_INPUT_REQUIRED",
}

const STATE_NAMES = new Map(Object.entries(STATES).map(([status, name]) => [name, status as TaskStatus]))

const REASONS: Record<number, string> = {
  [-32001]: "TASK_NOT_FOUND",
  [-32002]: "TASK_NOT_CANCELABLE",
  [-32003]: "PUSH_NOTIFICATION_NOT_SUPPORTED",
  [-32004]: "UNSUPPORTED_OPERATION",
  [-32005]: "CONTENT_TYPE_NOT_SUPPORTED",
  [-32009]: "VERSION_NOT_SUPPORTED",
  [-32602]: "INVALID_ARGUMENT",
}

const PUSH_METHODS = new Set([
  "CreateTaskPushNotificationConfig",
  "GetTaskPushNotificationConfig",
  "ListTaskPushNotificationConfigs",
  "DeleteTaskPushNotificationConfig",
  "tasks/pushNotificationConfig/set",
  "tasks/pushNotificationConfig/get",
  "tasks/pushNotificationConfig/list",
  "tasks/pushNotificationConfig/delete",
])

const SUPPORTED_VERSIONS = new Set(["1.0", "0.3"])

function ok(id: unknown, result: unknown): RpcOk {
  return { jsonrpc: "2.0", id, result }
}

export function rpcError(id: unknown, code: number, message: string): RpcError {
  const reason = REASONS[code]
  return {
    jsonrpc: "2.0",
    id,
    error: reason
      ? {
          code,
          message,
          data: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason,
              domain: "a2a-protocol.org",
            },
          ],
        }
      : { code, message },
  }
}

function asId(value: unknown) {
  if (value == null || typeof value === "string" || typeof value === "number") return value ?? null
  return undefined
}

function taskContext(task: Task) {
  return task.contextId ?? task.id
}

export function projectTask(
  store: Store,
  task: Task,
  options: { historyLength?: number | null; includeArtifacts?: boolean },
) {
  const contextId = taskContext(task)
  const related = store.messages.filter((item) => item.taskId === task.id)
  const body: Record<string, unknown> = {
    id: task.id,
    contextId,
    status: {
      state: STATES[task.status],
      timestamp: task.updatedAt,
      ...statusMessage(store, task, contextId),
    },
    metadata: {
      title: task.title,
      claimantName: task.claimantName,
      ...(typeof task.workScore === "number" ? { score: task.workScore, scoredBy: task.posterName, person: task.claimantName } : {}),
    },
  }
  if (options.historyLength !== 0) {
    const history = options.historyLength != null ? related.slice(-options.historyLength) : related
    body.history = history.map((message) => projectMessage(message, contextId, task.claimantId))
  }
  if (options.includeArtifacts !== false) {
    const parts = artifactParts(store, task)
    body.artifacts = parts.length
      ? [
          {
            artifactId: `${task.id}:artifact`,
            name: wire("artifact.name"),
            parts,
          },
        ]
      : []
  }
  return body
}

const DECISION_KINDS = new Set(["task.input", "task.scoreRequest", "task.reject", "task.fail", "task.cancel"])

function statusMessage(store: Store, task: Task, contextId: string) {
  if (task.status === "completed") return {}
  const decision = [...store.messages].reverse().find((item) => item.taskId === task.id && DECISION_KINDS.has(item.kind))
  const waiting =
    task.status === "working"
      ? wire("working.poll")
      : task.status === "submitted"
        ? wire("submitted.poll")
        : decision?.kind === "task.scoreRequest"
          ? JSON.stringify({ request: "score", taskId: task.id, person: task.claimantName ?? "", artifact: task.artifact ?? "" })
          : decision?.text
  if (!waiting) return {}
  return {
    message: {
      messageId: decision && task.status !== "working" && task.status !== "submitted" ? decision.id : `${task.id}:awaiting-human`,
      contextId,
      taskId: task.id,
      role: "ROLE_AGENT",
      parts: [{ text: waiting, mediaType: "text/plain" }],
    },
  }
}

function projectMessage(message: ProtocolMessage, contextId: string, claimantId: string | null) {
  const fromHuman =
    message.kind === "task.artifact" ||
    message.kind === "task.reject" ||
    message.kind === "task.fail" ||
    message.kind === "task.input" ||
    message.kind === "task.scoreRequest" ||
    (message.kind === "task.cancel" && message.fromId === claimantId)
  return {
    messageId: message.a2aMessageId ?? message.id,
    contextId,
    taskId: message.taskId,
    role: fromHuman ? "ROLE_AGENT" : "ROLE_USER",
    parts: [{ text: message.text, mediaType: "text/plain" }],
  }
}

function visible(task: Task, scope: Scope) {
  if (scope.kind === "pool") return false
  return task.claimantId === scope.agentId || task.targetId === scope.agentId
}

function requireVisible(store: Store, scope: Scope, id: string) {
  const task = store.tasks.find((item) => item.id === id)
  if (!task || !visible(task, scope)) throw new DomainError(wire("task.missing"), -32001)
  return task
}

function outputSchemaFor(store: Store, task: Task) {
  const agent = store.agents.find((item) => item.id === task.claimantId)
  if (!agent) return undefined
  const named = task.skills.length === 1 ? task.skills[0] : undefined
  const skill = named
    ? agent.skills.find((item) => item.name === named)
    : agent.skills.length === 1
      ? agent.skills[0]
      : undefined
  return skill?.outputSchema
}

function artifactParts(store: Store, task: Task) {
  const parts: Record<string, unknown>[] = []
  if (task.artifact) {
    const schema = outputSchemaFor(store, task)
    if (!schema) parts.push({ text: task.artifact, mediaType: "text/plain" })
    else {
      try {
        parts.push({ data: JSON.parse(task.artifact) as unknown, mediaType: "application/json" })
      } catch {
        parts.push({ text: task.artifact, mediaType: "text/plain" })
      }
    }
  }
  if (task.artifactImage) parts.push(imagePart(task.artifactImage))
  return parts
}

function imagePart(image: TaskImage) {
  return {
    mediaType: image.mediaType,
    ...(image.filename ? { filename: image.filename } : {}),
    ...(image.raw ? { raw: image.raw } : {}),
    ...(image.url ? { url: image.url } : {}),
  }
}

function encodeData(data: unknown) {
  if (typeof data === "string") return data
  try {
    return JSON.stringify(data)
  } catch {
    throw new DomainError(wire("data.json"), -32602)
  }
}

function readParts(parts: unknown) {
  if (!Array.isArray(parts) || parts.length === 0) throw new DomainError(wire("parts.required"), -32602)
  const chunks: string[] = []
  const images: TaskImage[] = []
  for (const part of parts) {
    if (typeof part === "string") {
      chunks.push(part)
      continue
    }
    if (!part || typeof part !== "object") throw new DomainError(wire("part.bad"), -32602)
    const record = part as Record<string, unknown>
    const media = record.mediaType ?? record.media_type
    if (typeof media === "string" && media.startsWith("image/")) {
      const read = readImage(record)
      if ("error" in read) throw new DomainError(read.error, -32602)
      images.push(read.image)
      continue
    }
    if ("raw" in record || "url" in record || "file" in record) {
      throw new DomainError(wire("part.kind"), -32005)
    }
    if ("data" in record && record.data !== undefined) {
      if (typeof media === "string" && media !== "application/json" && media !== "*/*") {
        throw new DomainError(wire("media.unsupported", { media }), -32005)
      }
      const encoded = encodeData(record.data)
      if (encoded.trim()) chunks.push(encoded)
      continue
    }
    if (
      typeof media === "string" &&
      media !== "text/plain" &&
      media !== "text/*" &&
      media !== "*/*" &&
      media !== "application/json"
    ) {
      throw new DomainError(wire("media.unsupported", { media }), -32005)
    }
    if (typeof record.text === "string") chunks.push(record.text)
  }
  const text = chunks.join("\n").trim()
  if (!text && images.length === 0) throw new DomainError(wire("parts.required"), -32602)
  if (images.length > 4) throw new DomainError(wire("images.max"), -32602)
  return { text, images }
}

function metadataValue(params: Record<string, unknown>, message: Record<string, unknown>, key: string) {
  const sources = [params.metadata, message.metadata]
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue
    if (key in source) return (source as Record<string, unknown>)[key]
  }
  return undefined
}

function readSkill(params: Record<string, unknown>, message: Record<string, unknown>) {
  const value = metadataValue(params, message, "skill")
  if (value == null) return undefined
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(wire("skill.type"), -32602)
  }
  return value.trim()
}

function callerName(params: Record<string, unknown>, message: Record<string, unknown>) {
  const name = metadataValue(params, message, "caller")
  if (typeof name !== "string") return wire("caller.name")
  const trimmed = name.trim()
  const length = [...trimmed].length
  if (length >= 1 && length <= 24) return trimmed
  return wire("caller.name")
}

function historyLength(value: unknown) {
  if (value == null) return null
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new DomainError(wire("history.invalid"), -32602)
  }
  return value
}

function configurationOf(params: Record<string, unknown>) {
  const config = params.configuration
  if (config == null) return {}
  if (typeof config !== "object" || Array.isArray(config)) throw new DomainError(wire("config.object"), -32602)
  return config as Record<string, unknown>
}

function wantsImmediate(config: Record<string, unknown>) {
  return config.returnImmediately === true || config.return_immediately === true
}

function assertSendable(config: Record<string, unknown>) {
  if (config.taskPushNotificationConfig != null || config.task_push_notification_config != null) {
    throw new DomainError(wire("push.unsupported"), -32003)
  }
  const modes = config.acceptedOutputModes ?? config.accepted_output_modes
  if (modes == null) return
  if (!Array.isArray(modes) || modes.some((mode) => typeof mode !== "string")) {
    throw new DomainError(wire("modes.type"), -32602)
  }
  const supported = modes.some(
    (mode) =>
      mode === "text/plain" ||
      mode === "text/*" ||
      mode === "*/*" ||
      mode === "application/json" ||
      mode === "image/*" ||
      mode.startsWith("image/"),
  )
  if (!supported) throw new DomainError(wire("modes.kind"), -32005)
}

function readContextId(record: Record<string, unknown>) {
  const value = record.contextId ?? record.context_id
  if (value == null) return undefined
  if (typeof value !== "string") throw new DomainError(wire("context.type"), -32602)
  const trimmed = value.trim()
  if (trimmed.length < 1 || [...trimmed].length > 128) throw new DomainError(wire("context.invalid"), -32602)
  return trimmed
}

function readMessageId(record: Record<string, unknown>) {
  const value = record.messageId ?? record.message_id
  if (typeof value !== "string" || value.trim().length === 0) throw new DomainError(wire("message.missing"), -32602)
  return value.trim()
}

function readTaskId(record: Record<string, unknown>) {
  const value = record.taskId ?? record.task_id
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
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
    throw new DomainError(wire("message.params"), -32602)
  }
  const record = message as Record<string, unknown>
  const role = record.role
  if (role !== "ROLE_USER" && role !== "user") throw new DomainError(wire("role.user"), -32602)
  const messageId = readMessageId(record)
  const { text, images } = readParts(record.parts)
  const taskId = readTaskId(record)
  const contextId = readContextId(record)
  const skill = readSkill(params, record)
  const config = configurationOf(params)
  assertSendable(config)
  const replay = commandForMessage(store, messageId)
  if (!replay && !wantsImmediate(config)) {
    throw new DomainError(wire("returnImmediately"), -32004)
  }
  if (!replay && scope.kind === "pool") {
    throw new DomainError(wire("directory.assign"), -32004)
  }
  if (!replay && scope.kind === "human") {
    const human = store.agents.find((agent) => agent.id === scope.agentId)
    if (skill && human && !human.skills.some((item) => item.name === skill)) {
      throw new DomainError(wire("skill.missing"), -32602)
    }
  }
  const task = receiveCommand(store, {
    humanId: scope.kind === "human" ? scope.agentId : "",
    text,
    images,
    messageId,
    taskId,
    contextId,
    skill,
    callerName: callerName(params, record),
  })
  return {
    task: projectTask(store, task, {
      historyLength: historyLength(config.historyLength ?? config.history_length),
      includeArtifacts: true,
    }),
  }
}

function getTask(store: Store, scope: Scope, params: Record<string, unknown>) {
  const id = taskIdFrom(params)
  if (!id) throw new DomainError(wire("task.id"), -32602)
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
      throw new DomainError(wire("page.size"), -32602)
    }
    pageSize = params.pageSize
  }
  let offset = 0
  if (params.pageToken != null && params.pageToken !== "") {
    if (typeof params.pageToken !== "string" || !/^\d+$/.test(params.pageToken)) {
      throw new DomainError(wire("page.token"), -32602)
    }
    offset = Number(params.pageToken)
  }
  let tasks = store.tasks.filter((task) => visible(task, scope))
  if (typeof params.contextId === "string" && params.contextId) {
    tasks = tasks.filter((task) => taskContext(task) === params.contextId)
  }
  if (params.status != null) {
    if (typeof params.status !== "string" || !STATE_NAMES.has(params.status)) {
      throw new DomainError(wire("protocolStatus.unknown"), -32602)
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
  if (!id) throw new DomainError(wire("task.id"), -32602)
  requireVisible(store, scope, id)
  const task = cancelCommandedTask(store, id)
  return projectTask(store, task, { includeArtifacts: true })
}

export function dispatchA2a(
  store: Store,
  scope: Scope,
  body: unknown,
  options?: { a2aVersion?: string | null },
): RpcResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return rpcError(null, -32600, wire("rpc.not"))
  }
  const request = body as Record<string, unknown>
  const id = asId(request.id)
  if (id === undefined || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return rpcError(id === undefined ? null : id, -32600, wire("rpc.version"))
  }
  const version = options?.a2aVersion?.trim()
  if (version && !SUPPORTED_VERSIONS.has(version)) {
    return rpcError(id, -32009, wire("version.unsupported", { version }))
  }
  const method = request.method
  if (method === "SendStreamingMessage" || method === "message/stream" || method === "SubscribeToTask" || method === "tasks/subscribe") {
    return rpcError(id, -32004, wire("stream.unsupported"))
  }
  if (method === "GetExtendedAgentCard" || method === "agent/getAuthenticatedExtendedCard") {
    return rpcError(id, -32004, wire("card.extended"))
  }
  if (PUSH_METHODS.has(method)) {
    return rpcError(id, -32003, wire("push.unsupported"))
  }
  const params = request.params
  if (params != null && (typeof params !== "object" || Array.isArray(params))) {
    return rpcError(id, -32602, wire("params.object"))
  }
  const record = (params ?? {}) as Record<string, unknown>
  expireScores(store)
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
    return rpcError(id, -32601, wire("method.unknown", { method }))
  } catch (error) {
    if (error instanceof DomainError) {
      const code = error.code ?? (error.message === wire("task.missing") ? -32001 : -32602)
      return rpcError(id, code, error.message)
    }
    throw error
  }
}
