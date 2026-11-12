import type { Task } from "./types"

let cache: { agentId: string; tasks: Task[]; at: number } | null = null

export function cachedTasks(agentId: string | undefined) {
  if (!agentId || cache?.agentId !== agentId) return null
  return cache.tasks
}

export function rememberTasks(agentId: string, tasks: Task[]) {
  cache = { agentId, tasks, at: Date.now() }
}
