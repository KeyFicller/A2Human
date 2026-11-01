import { domainError, json, readBody } from "@/lib/http"
import { DomainError, abandonTask, cancelTask, claimTask, submitArtifact } from "@/lib/rules"
import { readStore, updateStore } from "@/lib/store"

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const store = await readStore()
  const task = store.tasks.find((item) => item.id === id)
  if (!task) return json({ error: "找不到这张任务" }, 404)
  const messages = store.messages.filter((message) => message.taskId === id)
  const poster = store.agents.find((agent) => agent.id === task.posterId) ?? null
  const claimant = task.claimantId
    ? (store.agents.find((agent) => agent.id === task.claimantId) ?? null)
    : null
  return json({ task, messages, poster, claimant })
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await readBody(request)
    const agentId = body.agentId
    if (typeof agentId !== "string") return json({ error: "缺少 Agent" }, 400)

    const task = await updateStore((store) => {
      switch (body.action) {
        case "claim":
          return claimTask(store, id, agentId)
        case "artifact":
          return submitArtifact(store, id, agentId, body.text)
        case "abandon":
          return abandonTask(store, id, agentId)
        case "cancel":
          return cancelTask(store, id, agentId)
        default:
          throw new DomainError("未知动作")
      }
    })
    return json(task)
  } catch (error) {
    return domainError(error)
  }
}
