import type { Locale } from "./messages"
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

export const STATUS_LABEL: Record<TaskStatus, string> = {
  submitted: "未派",
  working: "进行中",
  completed: "已交",
  canceled: "已取消",
  failed: "失败",
  rejected: "已拒绝",
  "input-required": "要补充",
}

const STATUS_EN: Record<TaskStatus, string> = {
  submitted: "Unassigned",
  working: "In progress",
  completed: "Delivered",
  canceled: "Canceled",
  failed: "Failed",
  rejected: "Rejected",
  "input-required": "Needs input",
}

const KIND_EN: Record<MessageKind, string> = {
  "task.submit": "Assigned",
  "task.artifact": "Artifact",
  "task.complete": "Completed",
  "task.cancel": "Canceled",
  "task.note": "Note",
  "task.reject": "Rejected",
  "task.fail": "Failed",
  "task.input": "Needs input",
  "task.scoreRequest": "Score request",
  "task.score": "Score",
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

export function durationPhrase(seconds: number, locale: Locale = "zh") {
  const { unit, value } = durationParts(seconds)
  if (locale === "en") {
    const word = unit === "day" ? (value === "1" ? "day" : "days") : unit
    return `avg ${value} ${word}`
  }
  const word = unit === "sec" ? "秒" : unit === "min" ? "分钟" : unit === "hr" ? "小时" : "天"
  return `平均 ${value} ${word}`
}

export function recordLine(
  completed = 0,
  averageScore: number | null = null,
  averageDuration: number | null = null,
  locale: Locale = "zh",
) {
  const shownScore = averageScore == null ? null : Number.isInteger(averageScore) ? String(averageScore) : averageScore.toFixed(1)
  if (locale === "en") {
    const score = shownScore == null ? "no score yet" : `avg score ${shownScore}`
    const duration = averageDuration == null ? "no time yet" : durationPhrase(averageDuration, "en")
    return `Completed ${completed} · ${score} · ${duration}`
  }
  const score = shownScore == null ? "还没有得分" : `平均 ${shownScore} 分`
  const duration = averageDuration == null ? "还没有耗时" : durationPhrase(averageDuration)
  return `完成 ${completed} 单 · ${score} · ${duration}`
}

export function statusLabel(status: TaskStatus, locale: Locale = "zh") {
  return locale === "en" ? STATUS_EN[status] : STATUS_LABEL[status]
}

export function kindLabel(kind: MessageKind, locale: Locale = "zh") {
  return locale === "en" ? KIND_EN[kind] : KIND_LABEL[kind]
}

export function taskOpen(status: TaskStatus) {
  return status === "submitted" || status === "working" || status === "input-required"
}

export const KIND_LABEL: Record<MessageKind, string> = {
  "task.submit": "派单",
  "task.artifact": "产物",
  "task.complete": "完成",
  "task.cancel": "取消",
  "task.note": "补充",
  "task.reject": "拒绝",
  "task.fail": "失败",
  "task.input": "要补充",
  "task.scoreRequest": "请打分",
  "task.score": "打分",
}
