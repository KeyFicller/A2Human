import { reputationOf } from "./reputation"
import { DUE_HOURS, SKILLS, type Skill } from "./skills"
import type { Agent, ProtocolMessage, Review, Store, Task } from "./types"

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
const COMMAND_REWARD = 12
const COMMAND_TEXT_MAX = 4000

function addMessage(
  store: Store,
  message: Omit<ProtocolMessage, "id" | "createdAt">,
) {
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

function cleanSkills(skills: unknown): Skill[] {
  if (skills == null) return []
  if (!Array.isArray(skills)) fail("技能格式不对")
  const unique = [...new Set(skills)]
  if (unique.length > 4) fail("一张任务最多点名 4 个技能")
  return unique.map((skill) => {
    if (typeof skill !== "string" || !(SKILLS as readonly string[]).includes(skill)) {
      fail("有技能不在目录里")
    }
    return skill as Skill
  })
}

export function canClaim(agent: Agent, task: Task): { ok: true } | { ok: false; reason: string } {
  if (task.status === "working") return { ok: false, reason: "已经有人在做" }
  if (task.status === "completed") return { ok: false, reason: "这单已经结算" }
  if (task.status === "canceled") return { ok: false, reason: "发布方已撤回" }
  if (task.posterId === agent.id) return { ok: false, reason: "不能领自己发出的任务" }
  return { ok: true }
}

function claimedSkills(skills: unknown) {
  const cleaned = cleanSkills(skills)
  if (cleaned.length < 1) fail("至少标一项你会的")
  return cleaned
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
    skills: claimedSkills(input.skills),
    points: 40,
    completed: 0,
    abandoned: 0,
    late: 0,
    reviews: 0,
    up: 0,
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
  if (!agent.human) fail("模型方的卡不能改")
  agent.name = cleanName(input.name)
  agent.bio = cleanBio(input.bio) || "人发布的 Agent。"
  agent.skills = claimedSkills(input.skills)
  return agent
}

export function setAvailability(store: Store, agentId: string, available: unknown): Agent {
  const agent = requireAgent(store, agentId)
  if (!agent.human) fail("模型方不用挂上岗")
  if (typeof available !== "boolean") fail("在岗状态要是 true 或 false")
  if (available && agent.skills.length < 1) fail("先标至少一项技能再挂上岗")
  agent.available = available
  return agent
}

function compareOnDuty(a: Agent, b: Agent) {
  const left = reputationOf(a).approval
  const right = reputationOf(b).approval
  if (left == null && right != null) return 1
  if (right == null && left != null) return -1
  if (left != null && right != null && left !== right) return right - left
  return b.completed - a.completed || a.id.localeCompare(b.id)
}

export function onDuty(agents: Agent[], skill?: string) {
  return agents
    .filter((agent) => agent.human && agent.available && (!skill || agent.skills.includes(skill)))
    .sort(compareOnDuty)
}

export function postTask(
  store: Store,
  input: {
    agentId: unknown
    title: unknown
    brief: unknown
    skills: unknown
    reward: unknown
    dueHours: unknown
  },
): Task {
  if (typeof input.agentId !== "string") fail("缺少发布方")
  const poster = requireAgent(store, input.agentId)
  if (!poster.human) fail("这个入口只给人类 Agent 发任务")
  if (typeof input.title !== "string") fail("需要标题")
  const title = input.title.trim()
  if (textLength(title) < 4 || textLength(title) > 32) fail("标题用 4 到 32 个字")
  if (typeof input.brief !== "string") fail("需要任务说明")
  const brief = input.brief.trim()
  if (textLength(brief) < 10 || textLength(brief) > 400) fail("说明用 10 到 400 个字")
  if (typeof input.reward !== "number" || !Number.isInteger(input.reward) || input.reward < 1 || input.reward > 100) {
    fail("悬赏要是 1 到 100 的整数参数点")
  }
  if (poster.points < input.reward) {
    fail(`参数点不够。你有 ${poster.points}，这单要 ${input.reward}`)
  }
  if (typeof input.dueHours !== "number" || !(DUE_HOURS as readonly number[]).includes(input.dueHours)) {
    fail("截止时间要是 4、12、24 或 72 小时")
  }
  const skills = cleanSkills(input.skills)
  poster.points -= input.reward
  const createdAt = now()
  const task: Task = {
    id: crypto.randomUUID(),
    title,
    brief,
    posterId: poster.id,
    posterName: poster.name,
    skills,
    reward: input.reward,
    status: "submitted",
    claimantId: null,
    claimantName: null,
    artifact: null,
    dueAt: new Date(Date.now() + input.dueHours * 60 * 60 * 1000).toISOString(),
    review: null,
    createdAt,
    updatedAt: createdAt,
    source: "board",
    contextId: crypto.randomUUID(),
  }
  store.tasks.unshift(task)
  addMessage(store, {
    taskId: task.id,
    fromId: poster.id,
    fromName: poster.name,
    kind: "task.submit",
    text: brief,
  })
  return task
}

export function claimTask(store: Store, taskId: string, agentId: string): Task {
  const task = requireTask(store, taskId)
  const agent = requireAgent(store, agentId)
  if (!agent.human) fail("模型方不在这个广场上领任务")
  const gate = canClaim(agent, task)
  if (!gate.ok) fail(gate.reason)
  task.status = "working"
  task.claimantId = agent.id
  task.claimantName = agent.name
  task.updatedAt = now()
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.claim",
    text: `${agent.name} 领取。`,
  })
  return task
}

export function submitArtifact(store: Store, taskId: string, agentId: string, text: unknown): Task {
  const task = requireTask(store, taskId)
  const agent = requireAgent(store, agentId)
  if (task.status !== "working" || task.claimantId !== agent.id) {
    fail("只有领取这单的人能提交产物")
  }
  if (typeof text !== "string") fail("产物要是一段文字")
  const artifact = text.trim()
  if (textLength(artifact) < 8 || textLength(artifact) > 800) {
    fail("产物用 8 到 800 个字")
  }
  const overdue = Boolean(task.dueAt && Date.parse(task.dueAt) < Date.now())
  task.artifact = artifact
  task.late = overdue
  task.status = "completed"
  task.updatedAt = now()
  agent.points += task.reward
  agent.completed += 1
  if (overdue) agent.late += 1
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.artifact",
    text: artifact,
  })
  addMessage(store, {
    taskId: task.id,
    fromId: task.posterId,
    fromName: task.posterName,
    kind: "task.complete",
    text: `产物已入账，结算 ${task.reward} 参数点。`,
  })
  return task
}

export function abandonTask(store: Store, taskId: string, agentId: string): Task {
  const task = requireTask(store, taskId)
  const agent = requireAgent(store, agentId)
  if (task.status !== "working" || task.claimantId !== agent.id) {
    fail("这单不在你手上")
  }
  if (task.source === "direct") {
    fail("这是模型直接派给你的，不能转手。做完提交，或等对方取消。")
  }
  task.status = "submitted"
  task.claimantId = null
  task.claimantName = null
  task.artifact = null
  task.late = false
  task.updatedAt = now()
  agent.abandoned += 1
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.abandon",
    text: "放弃领取，任务回到待领。",
  })
  return task
}

export function cancelTask(store: Store, taskId: string, agentId: string): Task {
  const task = requireTask(store, taskId)
  const agent = requireAgent(store, agentId)
  if (task.posterId !== agent.id) fail("只有发布方能撤回")
  if (task.status !== "submitted") fail("已经有人领取，不能撤回")
  task.status = "canceled"
  task.updatedAt = now()
  agent.points += task.reward
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.cancel",
    text: `任务撤回，${task.reward} 参数点退回。`,
  })
  return task
}

export function ensureCaller(store: Store): Agent {
  const existing = store.agents.find((item) => item.id === CALLER_ID)
  if (existing) return existing
  const caller: Agent = {
    id: CALLER_ID,
    name: "外部模型",
    bio: "从 JSON-RPC 进来的调用方。不领任务，只把活派给人。",
    human: false,
    available: false,
    skills: [],
    points: 100000,
    completed: 0,
    abandoned: 0,
    late: 0,
    reviews: 0,
    up: 0,
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
    mode: "direct" | "pool"
    humanId?: string
    text: string
    messageId: string
    taskId?: string
    contextId?: string
    skill?: string
    callerName: string
    dueHours?: number
  },
): Task {
  const replay = findCommandTask(store, input.messageId)
  if (replay) return replay

  const text = input.text.trim()
  if (textLength(text) < 1 || textLength(text) > COMMAND_TEXT_MAX) {
    fail(`指令用 1 到 ${COMMAND_TEXT_MAX} 个字`)
  }

  if (input.taskId) {
    const task = store.tasks.find((item) => item.id === input.taskId)
    if (!task) fail("找不到这张任务", -32001)
    if (input.mode === "direct") {
      const mine = task.targetId === input.humanId || task.claimantId === input.humanId
      if (!mine) fail("找不到这张任务", -32001)
    } else if (task.source !== "pool") {
      fail("找不到这张任务", -32001)
    }
    if (task.status === "completed" || task.status === "canceled") {
      fail("任务已经结束，不能再补消息", -32004)
    }
    const actualContext = task.contextId ?? task.id
    if (input.contextId && input.contextId !== actualContext) {
      fail("contextId 和这张任务对不上", -32602)
    }
    const caller = ensureCaller(store)
    addMessage(store, {
      taskId: task.id,
      fromId: caller.id,
      fromName: input.callerName,
      kind: "task.note",
      text,
      a2aMessageId: input.messageId,
    })
    task.updatedAt = now()
    return task
  }

  let human: Agent | null = null
  if (input.mode === "direct") {
    if (!input.humanId) fail("缺少要指挥的人")
    human = requireAgent(store, input.humanId)
    if (!human.human) fail("只能指挥已经发布的人", -32004)
    if (!human.available) fail("这个人现在没挂上岗", -32004)
  } else {
    if (!input.humanId) fail("没有可指派的在岗的人", -32004)
    human = requireAgent(store, input.humanId)
    if (!human.human || !human.available) fail("这个人现在没挂上岗", -32004)
  }

  const caller = ensureCaller(store)
  const reward = caller.points >= COMMAND_REWARD ? COMMAND_REWARD : 0
  caller.points -= reward
  const createdAt = now()
  const task: Task = {
    id: crypto.randomUUID(),
    title: commandTitle(text),
    brief: text,
    posterId: caller.id,
    posterName: input.callerName,
    skills: input.skill ? [input.skill] : [],
    reward,
    status: human ? "working" : "submitted",
    claimantId: human?.id ?? null,
    claimantName: human?.name ?? null,
    artifact: null,
    dueAt: new Date(Date.now() + (input.dueHours ?? 24) * 60 * 60 * 1000).toISOString(),
    review: null,
    createdAt,
    updatedAt: createdAt,
    contextId: input.contextId ?? crypto.randomUUID(),
    a2aMessageId: input.messageId,
    source: input.mode,
    targetId: human?.id,
  }
  store.tasks.unshift(task)
  addMessage(store, {
    taskId: task.id,
    fromId: caller.id,
    fromName: input.callerName,
    kind: "task.submit",
    text,
    a2aMessageId: input.messageId,
  })
  if (human) {
    addMessage(store, {
      taskId: task.id,
      fromId: human.id,
      fromName: human.name,
      kind: "task.claim",
      text: input.mode === "direct" ? `${human.name} 在岗，被直接指派。` : `${human.name} 在岗，按技能被指派。`,
    })
  }
  return task
}

export function cancelCommandedTask(store: Store, taskId: string): Task {
  const task = requireTask(store, taskId)
  if (task.posterId !== CALLER_ID) fail("只有协议派来的任务能从这里取消", -32002)
  if (task.status === "completed" || task.status === "canceled") fail("任务已经结束，不能取消", -32002)
  const caller = ensureCaller(store)
  caller.points += task.reward
  task.status = "canceled"
  task.updatedAt = now()
  addMessage(store, {
    taskId: task.id,
    fromId: caller.id,
    fromName: task.posterName,
    kind: "task.cancel",
    text: task.reward > 0 ? `调用方取消，${task.reward} 参数点退回。` : "调用方取消。",
  })
  return task
}

export function rateTask(store: Store, taskId: string, agentId: string, vote: unknown): Task {
  const task = requireTask(store, taskId)
  const agent = requireAgent(store, agentId)
  if (task.posterId !== agent.id) fail("只有发布方能评价")
  if (task.status !== "completed") fail("还没有可评价的产物")
  if (vote !== "up" && vote !== "down") fail("评价只能是好评或差评")
  if (task.review === vote) return task
  if (task.review) fail("已经评价过")
  if (!task.claimantId) fail("这单没有领取人")
  const claimant = requireAgent(store, task.claimantId)
  const review = vote as Review
  task.review = review
  task.updatedAt = now()
  claimant.reviews += 1
  if (review === "up") claimant.up += 1
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.review",
    text: review === "up" ? "好评。" : "差评。",
  })
  return task
}
