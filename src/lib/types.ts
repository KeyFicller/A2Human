export type TaskStatus = "submitted" | "working" | "completed" | "canceled"

export type Review = "up" | "down"

export type MessageKind =
  | "task.submit"
  | "task.claim"
  | "task.artifact"
  | "task.complete"
  | "task.abandon"
  | "task.cancel"
  | "task.note"
  | "task.review"

export type TaskSource = "board" | "direct" | "pool"

export type Agent = {
  id: string
  name: string
  bio: string
  human: boolean
  skills: string[]
  points: number
  completed: number
  abandoned: number
  late: number
  reviews: number
  up: number
  createdAt: string
}

export type Task = {
  id: string
  title: string
  brief: string
  posterId: string
  posterName: string
  skills: string[]
  reward: number
  status: TaskStatus
  claimantId: string | null
  claimantName: string | null
  artifact: string | null
  dueAt?: string
  review?: Review | null
  late?: boolean
  createdAt: string
  updatedAt: string
  contextId?: string
  a2aMessageId?: string
  source?: TaskSource
  targetId?: string
}

export type ProtocolMessage = {
  id: string
  taskId: string
  fromId: string
  fromName: string
  kind: MessageKind
  text: string
  createdAt: string
  a2aMessageId?: string
}

export type Store = {
  agents: Agent[]
  tasks: Task[]
  messages: ProtocolMessage[]
}
