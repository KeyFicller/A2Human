import { wire } from "./copy"
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
  if (!agent) fail(wire("agent.missing"))
  return agent
}

function requireTask(store: Store, id: string) {
  const task = store.tasks.find((item) => item.id === id)
  if (!task) fail(wire("task.missing"))
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
  if (typeof name !== "string") fail(wire("name.required"))
  const trimmed = name.trim()
  const length = textLength(trimmed)
  if (length < 2 || length > 16) fail(wire("name.length"))
  return trimmed
}

function cleanBio(bio: unknown) {
  if (bio == null || bio === "") return ""
  if (typeof bio !== "string") fail(wire("bio.type"))
  const trimmed = bio.trim()
  if (textLength(trimmed) > 80) fail(wire("bio.length"))
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
      fail(wire("schema.json", { label }))
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(wire("schema.object", { label }))
  let encoded: string
  try {
    encoded = JSON.stringify(parsed)
  } catch {
    fail(wire("schema.json", { label }))
  }
  if (textLength(encoded) > SCHEMA_MAX) fail(wire("schema.length", { label, max: SCHEMA_MAX }))
  return JSON.parse(encoded) as Record<string, unknown>
}

function cleanSkills(skills: unknown): Skill[] {
  if (!Array.isArray(skills) || skills.length < 1) fail(wire("skills.min"))
  if (skills.length > 6) fail(wire("skills.max"))
  const seen = new Set<string>()
  return skills.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) fail(wire("skill.shape"))
    const record = item as Record<string, unknown>
    if (typeof record.name !== "string" || typeof record.description !== "string") {
      fail(wire("skill.shape"))
    }
    const name = record.name.trim()
    const description = record.description.trim()
    if (textLength(name) < 1 || textLength(name) > 24) fail(wire("skill.name"))
    if (textLength(description) < 1 || textLength(description) > 120) fail(wire("skill.description"))
    if (seen.has(name)) fail(wire("skill.duplicate"))
    seen.add(name)
    const inputSchema = cleanSchema(record.inputSchema, wire("schema.input"))
    const outputSchema = cleanSchema(record.outputSchema, wire("schema.output"))
    if (Boolean(inputSchema) !== Boolean(outputSchema)) fail(wire("schema.pair"))
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
    bio: cleanBio(input.bio) || wire("bio.default"),
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
  if (!agent.human) fail(wire("card.locked"))
  agent.name = cleanName(input.name)
  agent.bio = cleanBio(input.bio) || wire("bio.default")
  agent.skills = cleanSkills(input.skills)
  if (agent.skills.length < 1) agent.available = false
  return agent
}

export function setAvailability(store: Store, agentId: string, available: unknown): Agent {
  const agent = requireAgent(store, agentId)
  if (!agent.human) fail(wire("duty.notHuman"))
  if (typeof available !== "boolean") fail(wire("duty.type"))
  if (available && agent.skills.length < 1) fail(wire("duty.needsSkill"))
  agent.available = available
  return agent
}

export function workRecord(tasks: Task[], agentId: string) {
  const done = tasks.filter((task) => task.claimantId === agentId && task.status === "completed")
  const scores = done.flatMap((task) => (typeof task.workScore === "number" ? [task.workScore] : []))
  const averageScore = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null
  const durations = done.map((task) => {
    const start = Date.parse(task.createdAt)
    const end = Date.parse(task.updatedAt)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
    return Math.max(0, (end - start) / 1000)
  })
  const averageDuration = durations.length ? Math.round(durations.reduce((sum, seconds) => sum + seconds, 0) / durations.length) : null
  return { completed: done.length, averageScore, averageDuration }
}

export function presentAgent(store: Store, agent: Agent): Agent {
  return { ...agent, ...workRecord(store.tasks, agent.id) }
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
    fail(wire("artifact.owner"))
  }
  if (awaitingScore(store, task)) fail(wire("artifact.waiting"))
  if (text != null && typeof text !== "string") fail(wire("artifact.type"))
  const artifact = typeof text === "string" ? text.trim() : ""
  if (artifact && textLength(artifact) > 4000) fail(wire("artifact.length"))
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
      fail(error instanceof Error ? error.message : wire("output.bad"))
    }
  }
  if (stored && textLength(stored) > 4000) fail(wire("artifact.length"))
  if (!picture && textLength(stored) < 1) fail(wire("artifact.length"))
  task.artifact = stored || null
  task.artifactImage = picture ?? null
  task.status = "input-required"
  task.updatedAt = now()
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.artifact",
    text: stored || (picture?.filename ? wire("artifact.imageNamed", { name: picture.filename }) : wire("artifact.imagePlain")),
  })
  addMessage(store, {
    taskId: task.id,
    fromId: agent.id,
    fromName: agent.name,
    kind: "task.scoreRequest",
    text: wire("score.ask", { name: task.posterName }),
  })
  return task
}

export function ensureCaller(store: Store): Agent {
  const existing = store.agents.find((item) => item.id === CALLER_ID)
  if (existing) return existing
  const caller: Agent = {
    id: CALLER_ID,
    name: wire("caller.name"),
    bio: wire("caller.bio"),
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
  return wire("task.defaultTitle")
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
  if (textLength(text) > COMMAND_TEXT_MAX) fail(wire("command.length", { max: COMMAND_TEXT_MAX }))
  if (textLength(text) < 1 && images.length === 0) fail(wire("command.length", { max: COMMAND_TEXT_MAX }))
  if (images.length > 4) fail(wire("images.max"), -32602)

  if (input.taskId) {
    const task = store.tasks.find((item) => item.id === input.taskId)
    if (!task) fail(wire("task.missing"), -32001)
    const mine = task.targetId === input.humanId || task.claimantId === input.humanId
    if (!mine) fail(wire("task.missing"), -32001)
    expireScore(store, task, Date.now())
    if (!taskOpenStatus(task.status)) {
      fail(wire("task.closedMessage"), -32004)
    }
    const actualContext = task.contextId ?? task.id
    if (input.contextId && input.contextId !== actualContext) {
      fail(wire("context.mismatch"), -32602)
    }
    const caller = ensureCaller(store)
    if (awaitingScore(store, task)) {
      if (images.length) fail(wire("score.noImage"), -32602)
      const score = requireWorkScore(text)
      task.workScore = score
      addMessage(store, {
        taskId: task.id,
        fromId: caller.id,
        fromName: input.callerName,
        kind: "task.score",
        text: wire("score.line", { caller: input.callerName, person: task.claimantName ?? wire("person.fallback"), score }),
        a2aMessageId: input.messageId,
      })
      addMessage(store, {
        taskId: task.id,
        fromId: task.posterId,
        fromName: task.posterName,
        kind: "task.complete",
        text: wire("artifact.done"),
      })
      task.status = "completed"
      task.updatedAt = now()
      return task
    }
    if (images.length) {
      const next = [...(task.images ?? []), ...images]
      if (next.length > 4) fail(wire("images.max"), -32602)
      task.images = next
    }
    addMessage(store, {
      taskId: task.id,
      fromId: caller.id,
      fromName: input.callerName,
      kind: "task.note",
      text: text || wire("note.image"),
      a2aMessageId: input.messageId,
    })
    task.status = "working"
    task.updatedAt = now()
    return task
  }

  const human = requireAgent(store, input.humanId)
  if (!human.human) fail(wire("human.only"), -32004)
  if (!human.available) fail(wire("duty.off"), -32004)
  if (input.skill && !human.skills.some((skill) => skill.name === input.skill)) {
    fail(wire("skill.missing"), -32602)
  }

  const caller = ensureCaller(store)
  const createdAt = now()
  const brief = text || images.map((image) => image.filename || wire("image.word")).join(wire("list.sep"))
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
    text: text || wire("note.attached"),
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
  if (task.claimantId !== agent.id) fail(wire("status.owner"))
  if (!taskOpenStatus(task.status)) fail(wire("task.finished"))
  if (typeof action !== "string" || !(action in DECISIONS)) fail(wire("action.unknown"))
  if (awaitingScore(store, task) && action !== "cancel") fail(wire("artifact.waiting"))
  const decision = DECISIONS[action as TaskDecision]
  const reason = typeof text === "string" ? text.trim() : ""
  if (textLength(reason) < 1 || textLength(reason) > 200) fail(wire("reason.length"))
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
    text: wire("score.expired"),
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
    fail(wire("score.format"), -32602)
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) fail(wire("score.format"), -32602)
  const record = data as Record<string, unknown>
  if (Object.keys(record).length !== 1 || !("score" in record)) fail(wire("score.format"), -32602)
  const score = record.score
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) fail(wire("score.range"), -32602)
  return score
}

export function cancelCommandedTask(store: Store, taskId: string): Task {
  const task = requireTask(store, taskId)
  if (task.posterId !== CALLER_ID) fail(wire("cancel.protocol"), -32002)
  if (!taskOpenStatus(task.status)) fail(wire("cancel.closed"), -32002)
  const caller = ensureCaller(store)
  task.status = "canceled"
  task.updatedAt = now()
  addMessage(store, {
    taskId: task.id,
    fromId: caller.id,
    fromName: task.posterName,
    kind: "task.cancel",
    text: wire("cancel.caller"),
  })
  return task
}
