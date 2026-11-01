import { dispatchA2a } from "@/lib/a2a"
import { dispatcherCard } from "@/lib/card"
import { json } from "@/lib/http"
import { updateStore } from "@/lib/store"

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  return json(dispatcherCard(origin))
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "请求体不是 JSON" } })
  }
  const result = await updateStore((store) => dispatchA2a(store, { kind: "pool" }, body))
  return json(result)
}
