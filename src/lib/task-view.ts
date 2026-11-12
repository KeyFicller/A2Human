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
