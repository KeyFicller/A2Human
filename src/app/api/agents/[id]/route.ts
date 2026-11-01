import { domainError, json, readBody } from "@/lib/http"
import { updateAgent } from "@/lib/rules"
import { readStore, updateStore } from "@/lib/store"

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const store = await readStore()
  const agent = store.agents.find((item) => item.id === id)
  if (!agent) return json({ error: "找不到这个 Agent" }, 404)
  return json(agent)
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await readBody(request)
    const agent = await updateStore((store) =>
      updateAgent(store, id, {
        name: body.name,
        bio: body.bio,
        skills: body.skills,
      }),
    )
    return json(agent)
  } catch (error) {
    return domainError(error)
  }
}
