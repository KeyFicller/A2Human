import type { MessageKind, TaskStatus } from "./types"

export function formatB(paramsB: number) {
  return `${paramsB}B`
}

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
  submitted: "待领",
  working: "进行中",
  completed: "已验收",
  canceled: "已撤回",
}

export const KIND_LABEL: Record<MessageKind, string> = {
  "task.submit": "发布",
  "task.claim": "领取",
  "task.artifact": "产物",
  "task.complete": "结算",
  "task.abandon": "放弃",
  "task.cancel": "撤回",
  "task.note": "补充",
}

export function archLabel(arch: "dense" | "moe") {
  return arch === "moe" ? "MoE" : "Dense"
}
