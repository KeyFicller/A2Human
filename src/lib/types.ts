export type Arch = "dense" | "moe"

export type TaskStatus = "submitted" | "working" | "completed" | "canceled"

export type MessageKind =
  | "task.submit"
  | "task.claim"
  | "task.artifact"
  | "task.complete"
  | "task.abandon"
  | "task.cancel"

export type Agent = {
  id: string
  name: string
  bio: string
  human: boolean
  paramsB: number
  blurb: string
  arch: Arch
  temperament: string
  skills: string[]
  points: number
  completed: number
  correct: number
  total: number
  createdAt: string
}

export type Task = {
  id: string
  title: string
  brief: string
  posterId: string
  posterName: string
  requiredB: number
  skills: string[]
  reward: number
  status: TaskStatus
  claimantId: string | null
  claimantName: string | null
  artifact: string | null
  createdAt: string
  updatedAt: string
}

export type ProtocolMessage = {
  id: string
  taskId: string
  fromId: string
  fromName: string
  kind: MessageKind
  text: string
  createdAt: string
}

export type Store = {
  agents: Agent[]
  tasks: Task[]
  messages: ProtocolMessage[]
}
