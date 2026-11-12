export type DecisionAction = "reject" | "fail" | "cancel" | "input"

export type DecisionDefaults = {
  reject: string
  fail: string
  cancel: string
}

export function decisionText(action: DecisionAction, text: string, defaults: DecisionDefaults) {
  if (action === "input") return text
  const written = text.trim()
  if (written) return written
  return defaults[action]
}
