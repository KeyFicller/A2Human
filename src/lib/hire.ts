export function sendMessageBody(options: {
  text: string
  skill?: string
  caller?: string
  senderId?: string
  messageId?: string
  audio?: { mediaType: string; raw?: string; url?: string; filename?: string }
}) {
  const metadata: Record<string, string> = {}
  if (options.skill) metadata.skill = options.skill
  if (options.caller) metadata.caller = options.caller
  if (options.senderId) metadata.senderId = options.senderId
  const messageId = options.messageId || "hire-1"
  const parts: Array<Record<string, string>> = []
  if (options.text.trim()) parts.push({ text: options.text })
  if (options.audio?.raw || options.audio?.url) {
    const file: Record<string, string> = { mediaType: options.audio.mediaType }
    if (options.audio.filename) file.filename = options.audio.filename
    if (options.audio.raw) file.raw = options.audio.raw
    if (options.audio.url) file.url = options.audio.url
    parts.push(file)
  }
  if (!parts.length) parts.push({ text: options.text })
  return {
    jsonrpc: "2.0" as const,
    id: messageId,
    method: "SendMessage",
    params: {
      configuration: { returnImmediately: true },
      ...(Object.keys(metadata).length ? { metadata } : {}),
      message: {
        role: "ROLE_USER",
        messageId,
        parts,
      },
    },
  }
}

export const VISITOR_KEY = "a2human-visitor-id"
const VISITOR_ID = /^visitor-[a-z0-9-]{8,64}$/

type KeyStore = { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** The id this browser already sent work under before publishing, if any. */
export function keptVisitorId(storage: KeyStore | null): string | null {
  const kept = storage?.getItem(VISITOR_KEY) ?? null
  return kept && VISITOR_ID.test(kept) ? kept : null
}

/** Who a web hire is from: the published card, or one id this browser keeps so it can score later. */
export function webSenderId(agentId: string | null | undefined, storage: KeyStore | null, make: () => string): string | undefined {
  if (agentId) return agentId
  if (!storage) return undefined
  const kept = keptVisitorId(storage)
  if (kept) return kept
  const next = `visitor-${make().toLowerCase().replace(/[^a-z0-9-]/g, "")}`.slice(0, 72)
  if (!VISITOR_ID.test(next)) return undefined
  storage.setItem(VISITOR_KEY, next)
  return next
}
