import { domainError, json, readBody } from "@/lib/http"
import { DomainError, submitArtifact } from "@/lib/rules"
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
      if (body.action !== "artifact") throw new DomainError("未知动作")
      return submitArtifact(store, id, agentId, body.text, body.image)
    })
    return json(task)
  } catch (error) {
    return domainError(error)
  }
}
