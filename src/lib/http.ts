import { DomainError } from "./rules"

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

export async function readBody(request: Request) {
  const body = await request.json()
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DomainError("请求体不是 JSON")
  }
  return body as Record<string, unknown>
}

export function domainError(error: unknown) {
  if (error instanceof DomainError) return json({ error: error.message }, 400)
  if (error instanceof SyntaxError) return json({ error: "请求体不是 JSON" }, 400)
  throw error
}
