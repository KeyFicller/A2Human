import { readImage, type TaskImage } from "./images"
import { canonicalOutput } from "./schema-fields"
import type { Agent, ProtocolMessage, Skill, Store, Task } from "./types"

export class DomainError extends Error {
  readonly code?: number

  constructor(message: string, code?: number) {
    super(message)
    this.name = "DomainError"
    this.code = code
  }
}

function fail(message: string, code?: number): never {
  throw new DomainError(message, code)
}

function now() {
  return new Date().toISOString()
}

function textLength(value: string) {
  return [...value].length
}

function requireAgent(store: Store, id: string) {
  const agent = store.agents.find((item) => item.id === id)
  if (!agent) fail("找不到这个 Agent")
  return agent
}

function requireTask(store: Store, id: string) {
  const task = store.tasks.find((item) => item.id === id)
  if (!task) fail("找不到这张任务")
  return task
}

export const CALLER_ID = "agent_a2a"
const COMMAND_TEXT_MAX = 4000

function addMessage(store: Store, message: Omit<ProtocolMessage, "id" | "createdAt">) {
  store.messages.push({
    ...message,
    id: crypto.randomUUID(),
    createdAt: now(),
  })
}

function cleanName(name: unknown) {
  if (typeof name !== "string") fail("需要一个名字")
  const trimmed = name.trim()
  const length = textLength(trimmed)
  if (length < 2 || length > 16) fail("名字用 2 到 16 个字")
  return trimmed
}

function cleanBio(bio: unknown) {
  if (bio == null || bio === "") return ""
  if (typeof bio !== "string") fail("简介要是一段文字")
  const trimmed = bio.trim()
  if (textLength(trimmed) > 80) fail("简介最多 80 字")
  return trimmed
}

const SCHEMA_MAX = 2000

function cleanSchema(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value == null || value === "") return undefined
  let parsed = value
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      fail(`${label}要是 JSON Schema`)
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(`${label}要是 JSON 对象`)
  let encoded: string
  try {
    encoded = JSON.stringify(parsed)
  } catch {
    fail(`${label}要是 JSON Schema`)
  }
  if (textLength(encoded) > SCHEMA_MAX) fail(`${label}最多 ${SCHEMA_MAX} 字`)
  return JSON.parse(encoded) as Record<string, unknown>
}

function cleanSkills(skills: unknown): Skill[] {
  if (!Array.isArray(skills) || skills.length < 1) fail("至少写一项技能")
  if (skills.length > 6) fail("最多 6 项技能")
  const seen = new Set<string>()
  return skills.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail("技能要包含名称和能完成的内容")
    const record = item as Record<string, unknown>
    if (typeof record.name !== "string" || typeof record.description !== "string") {
      fail("技能要包含名称和能完成的内容")
    }
    const name = record.name.trim()
    const description = record.description.trim()
    if (textLength(name) < 1 || textLength(name) > 24) fail("技能名用 1 到 24 个字")
    if (textLength(description) < 1 || textLength(description) > 120) fail("技能说明用 1 到 120 个字")
    if (seen.has(name)) fail("技能名不能重复")
    seen.add(name)
    const inputSchema = cleanSchema(record.inputSchema, "输入 Schema")
    const outputSchema = cleanSchema(record.outputSchema, "输出 Schema")
    if (Boolean(inputSchema) !== Boolean(outputSchema)) fail("输入和输出的 JSON Schema 要一起写")
    return inputSchema && outputSchema ? { name, description, inputSchema, outputSchema } : { name, description }
  })
}

export function publishAgent(
  store: Store,
  input: { name: unknown; bio: unknown; skills: unknown },
): Agent {
  const agent: Agent = {
    id: crypto.randomUUID(),
    name: cleanName(input.name),
    bio: cleanBio(input.bio) || "人发布的 Agent。",
    human: true,
    available: false,
    skills: cleanSkills(input.skills),
    createdAt: now(),
  }
  store.agents.push(agent)
  return agent
}

export function updateAgent(
  store: Store,
  agentId: string,
  input: { name: unknown; bio: unknown; skills: unknown },
): Agent {
  const agent = requireAgent(store, agentId)
  if (!agent.human) fail("这张卡不能改")
  agent.name = cleanName(input.name)
  agent.bio = cleanBio(input.bio) || "人发布的 Agent。"
  agent.skills = cleanSkills(input.skills)
  if (agent.skills.length < 1) agent.available = false
  return agent
}

export function setAvailability(store: Store, agentId: string, available: unknown): Agent {
  const agent = requireAgent(store, agentId)
  if (!agent.human) fail("这张卡不用上工")
  if (typeof available !== "boolean") fail("在岗状态要是 true 或 false")
  if (available && agent.skills.length < 1) fail("先写至少一项技能再上工")
  agent.available = available
  return agent
}

export function onDuty(agents: Agent[]) {
  return agents
    .filter((agent) => agent.human && agent.available && agent.skills.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "zh") || a.id.localeCompare(b.id))
}

function outputSkill(store: Store, task: Task): Skill | undefined {
  const agent = store.agents.find((item) => item.id === task.claimantId)
  if (!agent) return undefined
  const named = task.skills.length === 1 ? task.skills[0] : undefined
  if (named) return agent.skills.find((skill) => skill.name === named)
  return agent.skills.length === 1 ? agent.skills[0] : undefined
}

export function submitArtifact(store: Store, taskId: string, agentId: string, text: unknown, image?: unknown): Task {
  const task = requireTask(store, taskId)
  const agent = requireAgent(store, agentId)
  const answering = task.status === "working" || task.status === "input-required"
  if (!answering || task.claimantId !== agent.id) {
    fail("只有被派到这单的人能提交产物")
  }
  if (awaitingScore(store, task)) fail("产物已经交了，等模型打分")
  if (text != null && typeof text !== "string") fail("产物要是一段文字")
  const artifact = typeof text === "string" ? text.trim() : ""
  if (artifact && textLength(artifact) > 4000) fail("产物用 1 到 4000 个字")
  let picture: TaskImage | undefined
  if (image != null && image !== "") {
    const read = readImage(image)
    if ("error" in read) fail(read.error)
    picture = read.image
  }
  const outputSchema = outputSkill(store, task)?.outputSchema
  let stored = artifact
  if (outputSchema) {
    try {
      stored = canonicalOutput(outputSchema, artifact, Boolean(picture))
    } catch (error) {
      fail(error instanceof Error ? error.message : "输出格式不对")
    }
  }
  if (stored && textLength(stored) > 4000) fail("产物用 1 到 4000 个字")
  if (!picture && textLength(stored) < 1) fail("产物用 1 到 4000 个字")
  task.artifact = stored || null
  task.artifactImage = picture ?? null
  task.status = "input-required"
  task.updatedAt = now()
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.artifact",
    text: stored || `交了一张图片${picture?.filename ? `：${picture.filename}` : ""}`,
  })
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.scoreRequest",
    text: `请${task.posterName}给这次工作打分`,
  })
  return task
}

export function ensureCaller(store: Store): Agent {
  const existing = store.agents.find((item) => item.id === CALLER_ID)
  if (existing) return existing
  const caller: Agent = {
    id: CALLER_ID,
    name: "外部模型",
    bio: "从 JSON-RPC 进来的调用方。不接任务，只把活派给人。",
    human: false,
    available: false,
    skills: [],
    createdAt: now(),
  }
  store.agents.push(caller)
  return caller
}

function findCommandTask(store: Store, messageId: string) {
  const created = store.tasks.find((item) => item.a2aMessageId === messageId)
  if (created) return created
  const noted = store.messages.find((item) => item.a2aMessageId === messageId)
  if (!noted) return undefined
  return store.tasks.find((item) => item.id === noted.taskId)
}

export function commandForMessage(store: Store, messageId: string) {
  return findCommandTask(store, messageId)
}

function commandTitle(text: string) {
  const flat = text.replace(/\s+/g, " ").trim()
  const slice = [...flat].slice(0, 32).join("")
  if (textLength(slice) >= 4) return slice
  return "模型派来的活"
}

export function receiveCommand(
  store: Store,
  input: {
    humanId: string
    text: string
    images?: TaskImage[]
    messageId: string
    taskId?: string
    contextId?: string
    skill?: string
    callerName: string
  },
): Task {
  const replay = findCommandTask(store, input.messageId)
  if (replay) return replay

  const text = input.text.trim()
  const images = input.images ?? []
  if (textLength(text) > COMMAND_TEXT_MAX) fail(`指令用 1 到 ${COMMAND_TEXT_MAX} 个字`)
  if (textLength(text) < 1 && images.length === 0) fail(`指令用 1 到 ${COMMAND_TEXT_MAX} 个字`)
  if (images.length > 4) fail("最多 4 张图片", -32602)

  if (input.taskId) {
    const task = store.tasks.find((item) => item.id === input.taskId)
    if (!task) fail("找不到这张任务", -32001)
    const mine = task.targetId === input.humanId || task.claimantId === input.humanId
    if (!mine) fail("找不到这张任务", -32001)
    expireScore(store, task, Date.now())
    if (!taskOpenStatus(task.status)) {
      fail("任务已经结束，不能再补消息", -32004)
    }
    const actualContext = task.contextId ?? task.id
    if (input.contextId && input.contextId !== actualContext) {
      fail("contextId 和这张任务对不上", -32602)
    }
    const caller = ensureCaller(store)
    if (awaitingScore(store, task)) {
      if (images.length) fail("打分不用附图片", -32602)
      const score = requireWorkScore(text)
      task.workScore = score
      addMessage(store, {
        taskId: task.id,
        fromId: caller.id,
        fromName: input.callerName,
        kind: "task.score",
        text: `${input.callerName}给${task.claimantName ?? "这个人"}打了 ${score} 分`,
        a2aMessageId: input.messageId,
      })
      addMessage(store, {
        taskId: task.id,
        fromId: task.posterId,
        fromName: task.posterName,
        kind: "task.complete",
        text: "产物已交。",
      })
      task.status = "completed"
      task.updatedAt = now()
      return task
    }
    if (images.length) {
      const next = [...(task.images ?? []), ...images]
      if (next.length > 4) fail("最多 4 张图片", -32602)
      task.images = next
    }
    addMessage(store, {
      taskId: task.id,
      fromId: caller.id,
      fromName: input.callerName,
      kind: "task.note",
      text: text || "又附了图片",
      a2aMessageId: input.messageId,
    })
    task.status = "working"
    task.updatedAt = now()
    return task
  }

  const human = requireAgent(store, input.humanId)
  if (!human.human) fail("只能指挥已经发布的人", -32004)
  if (!human.available) fail("这个人现在没上工", -32004)
  if (input.skill && !human.skills.some((skill) => skill.name === input.skill)) {
    fail("这个人没挂这项技能", -32602)
  }

  const caller = ensureCaller(store)
  const createdAt = now()
  const brief = text || images.map((image) => image.filename || "图片").join("、")
  const task: Task = {
    id: crypto.randomUUID(),
    title: commandTitle(brief),
    brief,
    ...(images.length ? { images } : {}),
    posterId: caller.id,
    posterName: input.callerName,
    skills: input.skill ? [input.skill] : [],
    status: "working",
    claimantId: human.id,
    claimantName: human.name,
    artifact: null,
    createdAt,
    updatedAt: createdAt,
    contextId: input.contextId ?? crypto.randomUUID(),
    a2aMessageId: input.messageId,
    source: "direct",
    targetId: human.id,
  }
  store.tasks.unshift(task)
  addMessage(store, {
    taskId: task.id,
    fromId: caller.id,
    fromName: input.callerName,
    kind: "task.submit",
    text: text || "附了图片",
    a2aMessageId: input.messageId,
  })
  return task
}

const DECISIONS = {
  reject: { status: "rejected", kind: "task.reject" },
  cancel: { status: "canceled", kind: "task.cancel" },
  fail: { status: "failed", kind: "task.fail" },
  input: { status: "input-required", kind: "task.input" },
} as const

export type TaskDecision = keyof typeof DECISIONS

function taskOpenStatus(status: Task["status"]) {
  return status === "submitted" || status === "working" || status === "input-required"
}

export function decideTask(store: Store, taskId: string, agentId: string, action: unknown, text: unknown): Task {
  const task = requireTask(store, taskId)
  const agent = requireAgent(store, agentId)
  if (task.claimantId !== agent.id) fail("只有被派到这单的人能改状态")
  if (!taskOpenStatus(task.status)) fail("任务已经结束")
  if (typeof action !== "string" || !(action in DECISIONS)) fail("未知动作")
  if (awaitingScore(store, task) && action !== "cancel") fail("产物已经交了，等模型打分")
  const decision = DECISIONS[action as TaskDecision]
  const reason = typeof text === "string" ? text.trim() : ""
  if (textLength(reason) < 1 || textLength(reason) > 200) fail("用 1 到 200 个字说明")
  task.status = decision.status
  task.updatedAt = now()
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: decision.kind,
    text: reason,
  })
  return task
}

const SCORE_DECISIONS = new Set<ProtocolMessage["kind"]>(["task.input", "task.scoreRequest", "task.reject", "task.fail", "task.cancel"])

function awaitingScore(store: Store, task: Task) {
  if (task.status !== "input-required") return false
  const decision = [...store.messages].reverse().find((item) => item.taskId === task.id && SCORE_DECISIONS.has(item.kind))
  return decision?.kind === "task.scoreRequest"
}

export const SCORE_WAIT_MS = 60_000

export function expireScores(store: Store, at = Date.now()) {
  let changed = false
  for (const task of store.tasks) {
    if (expireScore(store, task, at)) changed = true
  }
  return changed
}

function expireScore(store: Store, task: Task, at: number) {
  if (!awaitingScore(store, task)) return false
  const request = [...store.messages].reverse().find((item) => item.taskId === task.id && item.kind === "task.scoreRequest")
  if (!request) return false
  const asked = Date.parse(request.createdAt)
  if (!Number.isFinite(asked) || at - asked < SCORE_WAIT_MS) return false
  addMessage(store, {
    taskId: task.id,
    fromId: task.posterId,
    fromName: task.posterName,
    kind: "task.complete",
    text: "模型没有打分，这次打分取消。",
  })
  task.status = "completed"
  task.updatedAt = new Date(at).toISOString()
  return true
}

function requireWorkScore(text: string) {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    fail('分数要写成 {"score":4}', -32602)
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) fail('分数要写成 {"score":4}', -32602)
  const record = data as Record<string, unknown>
  if (Object.keys(record).length !== 1 || !("score" in record)) fail('分数要写成 {"score":4}', -32602)
  const score = record.score
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) fail("分数要是 1 到 5 的整数", -32602)
  return score
}

export function cancelCommandedTask(store: Store, taskId: string): Task {
  const task = requireTask(store, taskId)
  if (task.posterId !== CALLER_ID) fail("只有协议派来的任务能从这里取消", -32002)
  if (!taskOpenStatus(task.status)) fail("任务已经结束，不能取消", -32002)
  const caller = ensureCaller(store)
  task.status = "canceled"
  task.updatedAt = now()
  addMessage(store, {
    taskId: task.id,
    fromId: caller.id,
    fromName: task.posterName,
    kind: "task.cancel",
    text: "调用方取消。",
  })
  return task
}
