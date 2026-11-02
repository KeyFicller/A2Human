import { dispatchA2a, rpcError } from "@/lib/a2a"
import { wire } from "@/lib/copy"
import { dispatcherCard } from "@/lib/card"
import { json, requestOrigin } from "@/lib/http"
import { expireScores } from "@/lib/rules"
import { commitStore, updateStore } from "@/lib/store"

export async function GET(request: Request) {
  const origin = requestOrigin(request)
  const store = await commitStore((store) => expireScores(store))
  return json(dispatcherCard(origin, store.agents, store.tasks))
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(rpcError(null, -32700, wire("request.body")))
  }
  const result = await updateStore((store) =>
    dispatchA2a(store, { kind: "pool" }, body, { a2aVersion: request.headers.get("a2a-version") }),
  )
  return json(result)
}
