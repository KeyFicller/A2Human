import { wire } from "./copy"
import { DomainError } from "./rules"

export function requestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https"
    return `${proto}://${forwardedHost}`
  }
  return new URL(request.url).origin
}

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

export async function readBody(request: Request) {
  const body = await request.json()
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DomainError(wire("request.body"))
  }
  return body as Record<string, unknown>
}

export function domainError(error: unknown) {
  if (error instanceof DomainError) return json({ error: error.message }, 400)
  if (error instanceof SyntaxError) return json({ error: wire("request.body") }, 400)
  throw error
}
