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
}

export const KIND_LABEL: Record<MessageKind, string> = {
  "task.submit": "派单",
  "task.artifact": "产物",
  "task.complete": "完成",
  "task.cancel": "取消",
  "task.note": "补充",
}
