import { dispatchA2a, rpcError } from "@/lib/a2a"
import { wire } from "@/lib/copy"
import { toAgentCard } from "@/lib/card"
import { json, requestOrigin } from "@/lib/http"
import { expireScores } from "@/lib/rules"
import { commitStore, readStore, updateStore } from "@/lib/store"

function rpcFail(code: number, message: string) {
  return json(rpcError(null, code, message))
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const store = await commitStore((store) => expireScores(store))
  const agent = store.agents.find((item) => item.id === id)
  if (!agent) return json({ error: wire("agent.missing") }, 404)
  const origin = requestOrigin(request)
  return json(toAgentCard(agent, origin, store.tasks))
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return rpcFail(-32700, wire("request.body"))
  }
  const known = await readStore()
  if (!known.agents.some((item) => item.id === id)) return rpcFail(-32001, wire("agent.missing"))
  const result = await updateStore((store) =>
    dispatchA2a(store, { kind: "human", agentId: id }, body, { a2aVersion: request.headers.get("a2a-version") }),
  )
  return json(result)
}
