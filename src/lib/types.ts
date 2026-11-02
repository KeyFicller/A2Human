import type { TaskImage } from "./images"

export type { TaskImage }

export type TaskStatus =
  | "submitted"
  | "working"
  | "completed"
  | "canceled"
  | "failed"
  | "rejected"
  | "input-required"

export type MessageKind =
  | "task.submit"
  | "task.artifact"
  | "task.complete"
  | "task.cancel"
  | "task.note"
  | "task.reject"
  | "task.fail"
  | "task.input"

export type JsonSchema = Record<string, unknown>

export type Skill = {
  name: string
  description: string
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
}

export type Agent = {
  id: string
  name: string
  bio: string
  human: boolean
  available: boolean
  skills: Skill[]
  createdAt: string
}

export type Task = {
  id: string
  title: string
  brief: string
  posterId: string
  posterName: string
  skills: string[]
  status: TaskStatus
  claimantId: string | null
  claimantName: string | null
  artifact: string | null
  images?: TaskImage[]
  artifactImage?: TaskImage | null
  createdAt: string
  updatedAt: string
  contextId?: string
  a2aMessageId?: string
  source?: "direct"
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
