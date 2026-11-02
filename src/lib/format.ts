import type { MessageKind, TaskStatus } from "./types"

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
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

export function durationPhrase(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return `平均 ${whole} 秒`
  const minutes = Math.round(whole / 60)
  if (minutes < 60) return `平均 ${minutes} 分钟`
  const hours = whole / 3600
  if (hours < 24) {
    const shown = Math.round(hours * 10) / 10
    return `平均 ${Number.isInteger(shown) ? String(shown) : shown.toFixed(1)} 小时`
  }
  const days = Math.round((whole / 86400) * 10) / 10
  return `平均 ${Number.isInteger(days) ? String(days) : days.toFixed(1)} 天`
}

export function recordLine(completed = 0, averageScore: number | null = null, averageDuration: number | null = null) {
  const score = averageScore == null ? "还没有得分" : `平均 ${Number.isInteger(averageScore) ? String(averageScore) : averageScore.toFixed(1)} 分`
  const duration = averageDuration == null ? "还没有耗时" : durationPhrase(averageDuration)
  return `完成 ${completed} 单 · ${score} · ${duration}`
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
