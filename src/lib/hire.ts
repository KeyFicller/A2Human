export function sendMessageBody(options: { text: string; skill?: string; caller?: string; senderId?: string; messageId?: string }) {
  const metadata: Record<string, string> = {}
  if (options.skill) metadata.skill = options.skill
  if (options.caller) metadata.caller = options.caller
  if (options.senderId) metadata.senderId = options.senderId
  const messageId = options.messageId || "hire-1"
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
        parts: [{ text: options.text }],
      },
    },
  }
}
