import { phrase, type Locale } from "./copy"
import type { MessageKind, TaskStatus } from "./types"

export function formatWhen(iso: string, locale: Locale = "zh") {
  return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

const KIND_PATH: Record<MessageKind, string> = {
  "task.submit": "format.kind.submit",
  "task.artifact": "format.kind.artifact",
  "task.complete": "format.kind.complete",
  "task.cancel": "format.kind.cancel",
  "task.note": "format.kind.note",
  "task.reject": "format.kind.reject",
  "task.fail": "format.kind.fail",
  "task.input": "format.kind.input",
  "task.scoreRequest": "format.kind.scoreRequest",
  "task.score": "format.kind.score",
}

function durationParts(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return { unit: "sec" as const, value: String(whole) }
  const minutes = Math.round(whole / 60)
  if (minutes < 60) return { unit: "min" as const, value: String(minutes) }
  const hours = whole / 3600
  if (hours < 24) {
    const shown = Math.round(hours * 10) / 10
    return { unit: "hr" as const, value: Number.isInteger(shown) ? String(shown) : shown.toFixed(1) }
  }
  const days = Math.round((whole / 86400) * 10) / 10
  return { unit: "day" as const, value: Number.isInteger(days) ? String(days) : days.toFixed(1) }
}

export function durationValue(seconds: number, locale: Locale = "zh") {
  const { unit, value } = durationParts(seconds)
  const word = unit === "day" && value === "1" ? phrase("format.dayOne", undefined, locale) : phrase(`format.units.${unit}`, undefined, locale)
  return `${value} ${word}`
}

export function durationPhrase(seconds: number, locale: Locale = "zh") {
  return phrase("format.avg", { value: durationValue(seconds, locale) }, locale)
}

export function scoreValue(averageScore: number | null) {
  if (averageScore == null || !Number.isFinite(averageScore)) return null
  return Number.isInteger(averageScore) ? String(averageScore) : averageScore.toFixed(1)
}

export function recordLine(
  completed = 0,
  averageScore: number | null = null,
  averageDuration: number | null = null,
  locale: Locale = "zh",
) {
  const shownScore = scoreValue(averageScore)
  const score = shownScore == null ? phrase("format.noScore", undefined, locale) : phrase("format.score", { score: shownScore }, locale)
  const duration = averageDuration == null ? phrase("format.noTime", undefined, locale) : durationPhrase(averageDuration, locale)
  return phrase("format.line", { completed, score, duration }, locale)
}

export function statusLabel(status: TaskStatus, locale: Locale = "zh") {
  return phrase(`format.status.${status}`, undefined, locale)
}

export function kindLabel(kind: MessageKind, locale: Locale = "zh") {
  return phrase(KIND_PATH[kind], undefined, locale)
}

export function taskOpen(status: TaskStatus) {
  return status === "submitted" || status === "working" || status === "input-required"
}
