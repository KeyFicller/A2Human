import { json } from "@/lib/http"
import { readStore } from "@/lib/store"

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const store = await readStore()
  const agent = store.agents.find((item) => item.id === id)
  if (!agent) return json({ error: "找不到这个 Agent" }, 404)
  return json(agent)
}
