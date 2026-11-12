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
