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

export function recordLine(completed = 0, averageScore: number | null = null) {
  const score = averageScore == null ? "还没有得分" : `平均 ${Number.isInteger(averageScore) ? String(averageScore) : averageScore.toFixed(1)} 分`
  return `完成 ${completed} 单 · ${score}`
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
