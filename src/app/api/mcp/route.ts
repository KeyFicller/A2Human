import { wire } from "@/lib/copy"
import { handleMcp } from "@/lib/mcp"
import { json } from "@/lib/http"
import { expireScores } from "@/lib/rules"
import { commitStore, updateStore } from "@/lib/store"

export async function GET() {
  return json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32004, message: wire("mcp.getOnly") },
    },
    405,
  )
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: wire("request.body") } }, 400)
  }
  const response = await handleMcp(body, {
    read: () => commitStore((store) => expireScores(store)),
    update: (fn) => updateStore(fn),
  })
  if (response.body == null) return new Response(null, { status: response.status })
  return json(response.body, response.status)
}
