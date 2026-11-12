export type TaskImage = {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"
  raw?: string
  url?: string
  filename?: string
}

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
  | "task.scoreRequest"
  | "task.score"

export type JsonSchema = Record<string, unknown>

export type Skill = {
  name: string
  title?: string
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
  completed?: number
  averageScore?: number | null
  averageDuration?: number | null
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
  progress?: string
  artifact: string | null
  workScore?: number
  images?: TaskImage[]
  artifactImage?: TaskImage | null
  createdAt: string
  updatedAt: string
  contextId?: string
  a2aMessageId?: string
  source?: "direct" | "dispatch"
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
