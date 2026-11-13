import { apiUrl } from "./api-origin"
import { wire } from "./copy"

export const AGENT_KEY = "a2human-agent-id"
export const PUBLISHED_KEY = "a2human-just-published"

export class ApiError extends Error {}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  // A proxy or crash page has no JSON error. Keep the status so the next report says what broke.
  if (!response.ok) throw new ApiError(data.error || `${wire("request.failed")}\nHTTP ${response.status}`)
  return data
}
