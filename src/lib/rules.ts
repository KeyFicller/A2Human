import { B_TIERS, QUESTIONS, defaultBio, scoreBench, type Skill } from "./bench"
import type { Agent, ProtocolMessage, Store, Task } from "./types"
import { formatB } from "./format"

export class DomainError extends Error {}

function fail(message: string): never {
  throw new DomainError(message)
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

export function assertAnswers(answers: unknown): number[] {
  if (!Array.isArray(answers) || answers.length !== QUESTIONS.length) {
    fail("答卷不完整")
  }
  return answers.map((value, index) => {
    const size = QUESTIONS[index].options.length
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= size) {
      fail(`第 ${index + 1} 题没有有效选项`)
    }
    return value
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
    if (typeof skill !== "string" || !QUESTIONS.some((question) => question.skill === skill)) {
      fail("有技能不在协议目录里")
    }
    return skill as Skill
  })
}

export function canClaim(agent: Agent, task: Task): { ok: true } | { ok: false; reason: string } {
  if (task.status === "working") return { ok: false, reason: "已经有人在做" }
  if (task.status === "completed") return { ok: false, reason: "这单已经结算" }
  if (task.status === "canceled") return { ok: false, reason: "发布方已撤回" }
  if (task.posterId === agent.id) return { ok: false, reason: "不能领自己发出的任务" }

  const sizeOk = agent.paramsB >= task.requiredB
  const skillOk =
    task.skills.length > 0 && task.skills.every((skill) => agent.skills.includes(skill))
  if (sizeOk || skillOk) return { ok: true }

  if (task.skills.length === 0) {
    return { ok: false, reason: `需要 ≥ ${formatB(task.requiredB)}` }
  }
  return {
    ok: false,
    reason: `需要 ≥ ${formatB(task.requiredB)}，或同时点亮 ${task.skills.join("、")}`,
  }
}

export function publishAgent(
  store: Store,
  input: { name: unknown; bio: unknown; answers: unknown },
): Agent {
  const name = cleanName(input.name)
  const answers = assertAnswers(input.answers)
  const result = scoreBench(answers)
  const bio = cleanBio(input.bio) || defaultBio(result)
  const agent: Agent = {
    id: crypto.randomUUID(),
    name,
    bio,
    human: true,
    paramsB: result.paramsB,
    blurb: result.blurb,
    arch: result.arch,
    temperament: result.temperament,
    skills: result.skills,
    points: 40,
    completed: 0,
    correct: result.correct,
    total: result.total,
    createdAt: now(),
  }
  store.agents.push(agent)
  return agent
}

export function retakeBench(
  store: Store,
  agentId: string,
  input: { name: unknown; bio: unknown; answers: unknown },
): Agent {
  const agent = requireAgent(store, agentId)
  if (!agent.human) fail("模型方的卡不能重测")
  const answers = assertAnswers(input.answers)
  const result = scoreBench(answers)
  agent.name = cleanName(input.name)
  agent.bio = cleanBio(input.bio) || defaultBio(result)
  agent.paramsB = result.paramsB
  agent.blurb = result.blurb
  agent.arch = result.arch
  agent.temperament = result.temperament
  agent.skills = result.skills
  agent.correct = result.correct
  agent.total = result.total
  return agent
}

export function postTask(
  store: Store,
  input: {
    agentId: unknown
    title: unknown
    brief: unknown
    requiredB: unknown
    skills: unknown
    reward: unknown
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
  if (typeof input.requiredB !== "number" || !(B_TIERS as readonly number[]).includes(input.requiredB)) {
    fail("档位不在协议刻度上")
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
    requiredB: input.requiredB,
    skills,
    reward: input.reward,
    status: "submitted",
    claimantId: null,
    claimantName: null,
    artifact: null,
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
    text: `${agent.name} 领取。当前尺寸 ${formatB(agent.paramsB)}。`,
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
  task.artifact = artifact
  task.status = "completed"
  task.updatedAt = now()
  agent.points += task.reward
  agent.completed += 1
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
  task.updatedAt = now()
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
    paramsB: 0,
    blurb: "协议入口，不参加测评。",
    arch: "dense",
    temperament: "协议调用",
    skills: [],
    points: 100000,
    completed: 0,
    correct: 0,
    total: 0,
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
    callerName: string
  },
): Task {
  const replay = findCommandTask(store, input.messageId)
  if (replay) return replay

  const text = input.text.trim()
  if (textLength(text) < 1 || textLength(text) > COMMAND_TEXT_MAX) {
    fail(`指令用 1 到 ${COMMAND_TEXT_MAX} 个字`)
  }

  if (input.taskId) {
    const task = requireTask(store, input.taskId)
    if (input.mode === "direct") {
      const mine = task.targetId === input.humanId || task.claimantId === input.humanId
      if (!mine) fail("这张任务不在这个人身上")
    } else if (task.source !== "pool") {
      fail("这张任务不在广场入口")
    }
    if (task.status === "completed" || task.status === "canceled") fail("任务已经结束")
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
    if (!human.human) fail("只能指挥已经发布的人")
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
    requiredB: 0.5,
    skills: [],
    reward,
    status: human ? "working" : "submitted",
    claimantId: human?.id ?? null,
    claimantName: human?.name ?? null,
    artifact: null,
    createdAt,
    updatedAt: createdAt,
    contextId: crypto.randomUUID(),
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
      text: `${human.name} 被直接指派，不用再领。`,
    })
  }
  return task
}

export function cancelCommandedTask(store: Store, taskId: string): Task {
  const task = requireTask(store, taskId)
  if (task.posterId !== CALLER_ID) fail("只有协议派来的任务能从这里取消")
  if (task.status === "completed" || task.status === "canceled") fail("任务已经结束")
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
