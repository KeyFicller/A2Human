import type { TaskStatus } from "./types"

const A2A_STATE: Record<string, TaskStatus> = {
  TASK_STATE_SUBMITTED: "submitted",
  TASK_STATE_WORKING: "working",
  TASK_STATE_COMPLETED: "completed",
  TASK_STATE_CANCELED: "canceled",
  TASK_STATE_FAILED: "failed",
  TASK_STATE_REJECTED: "rejected",
  TASK_STATE_INPUT_REQUIRED: "input-required",
}

export function taskOpen(status: TaskStatus) {
  return status === "submitted" || status === "working" || status === "input-required"
}

/** The person already handed this in. Scoring can still be open, but it is not their open work. */
export function handedOff(task: { status: TaskStatus; artifact?: string | null; artifactImage?: unknown; artifactAudio?: unknown }) {
  return task.status === "input-required" && Boolean(task.artifact || task.artifactImage || task.artifactAudio)
}

export function needsWorker(task: { status: TaskStatus; artifact?: string | null; artifactImage?: unknown; artifactAudio?: unknown }) {
  return taskOpen(task.status) && !handedOff(task)
}

export function scoreWasSkipped(task: {
  status: string
  workScore?: number
  scoreSkipped?: boolean
  artifact?: string | null
  artifactImage?: unknown
  artifactAudio?: unknown
}) {
  if (task.scoreSkipped) return true
  return task.status === "completed" && typeof task.workScore !== "number" && Boolean(task.artifact || task.artifactImage || task.artifactAudio)
}

export function readableArtifact(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return ""
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return trimmed
    const record = parsed as Record<string, unknown>
    if (typeof record.answer === "string") return record.answer
    const entries = Object.entries(record).filter(([, value]) => typeof value === "string")
    if (entries.length > 0 && entries.length === Object.keys(record).length) {
      return entries.map(([key, value]) => `${key}: ${value as string}`).join("\n")
    }
  } catch {
    return trimmed
  }
  return trimmed
}

export function statusFromState(state: string | undefined, label: (status: TaskStatus) => string) {
  const status = state ? A2A_STATE[state] : undefined
  return status ? label(status) : state || ""
}

export function hireIssue(text: string, skillName: string, skillCount: number): "text" | "skill" | null {
  if (![...text.trim()].length) return "text"
  if (skillCount > 1 && !skillName) return "skill"
  return null
}

export type CallStep = "request" | "progress" | "artifact" | "score" | "complete" | "input" | "reject" | "fail" | "cancel" | "note"

export type CallEvent = {
  id: string
  step: CallStep
  /** Who said it: the calling Agent, or the person on duty. */
  side: "agent" | "human"
  name: string
  text: string
  at: string
  /** True on the latest delivery, which is the one the task's attached image or audio belongs to. */
  media: boolean
}

const STEP: Partial<Record<string, CallStep>> = {
  "task.submit": "request",
  "task.progress": "progress",
  "task.artifact": "artifact",
  "task.score": "score",
  "task.complete": "complete",
  "task.input": "input",
  "task.reject": "reject",
  "task.fail": "fail",
  "task.cancel": "cancel",
  "task.note": "note",
}

/** The call as it happened, oldest first, built only from recorded protocol messages. */
export function callTimeline(
  task: { posterId: string; claimantId: string | null },
  messages: { id: string; fromId: string; fromName: string; kind: string; text: string; createdAt: string }[],
): CallEvent[] {
  const events: CallEvent[] = []
  for (const message of messages) {
    const step = STEP[message.kind]
    if (!step) continue
    const side = message.fromId === task.claimantId && message.fromId !== task.posterId ? "human" : "agent"
    events.push({ id: message.id, step, side, name: message.fromName, text: readableArtifact(message.text), at: message.createdAt, media: false })
  }
  const last = events.map((event) => event.step).lastIndexOf("artifact")
  if (last >= 0) events[last] = { ...events[last], media: true }
  return events
}

/** The brief only adds something when it is not just the title again. */
export function briefRepeatsTitle(title: string, brief: string) {
  const flat = (value: string) => value.split(/\s+/).join(" ").trim()
  return flat(brief) === flat(title) || !flat(brief)
}

/** Tasks this browser sent, newest first. */
export function sentBy<T extends { senderId?: string; updatedAt: string }>(tasks: T[], ids: string[]): T[] {
  if (!ids.length) return []
  return tasks.filter((task) => Boolean(task.senderId) && ids.includes(task.senderId as string)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

/** The id this browser scores with, when it sent this task and the score window is open. */
export function scorerFor(task: { senderId?: string; claimantId: string | null }, ids: string[]): string | null {
  if (!task.senderId || task.senderId === task.claimantId) return null
  return ids.includes(task.senderId) ? task.senderId : null
}
