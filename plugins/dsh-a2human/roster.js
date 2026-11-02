const WAITING = new Set(["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING"])
const FAILED = new Set(["TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_REJECTED"])
const ASKING = new Set(["TASK_STATE_INPUT_REQUIRED", "TASK_STATE_AUTH_REQUIRED"])

export function directoryUrl(input) {
  const trimmed = String(input ?? "").trim()
  let url
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error("发现入口要是一个 http 地址")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("发现入口只接受 http 或 https")
  }
  if (url.pathname.endsWith("agent-card.json") || url.pathname.endsWith("/api/a2a")) return url.toString()
  url.pathname = "/.well-known/agent-card.json"
  url.search = ""
  url.hash = ""
  return url.toString()
}

function extensionRoster(card) {
  const extensions = card?.capabilities?.extensions
  if (!Array.isArray(extensions)) return undefined
  for (const extension of extensions) {
    const roster = extension?.params?.onDuty
    if (Array.isArray(roster)) return roster
  }
  return undefined
}

export function readRoster(card) {
  const roster = Array.isArray(card?.a2human?.onDuty) ? card.a2human.onDuty : extensionRoster(card)
  if (!Array.isArray(roster)) return []
  const entries = []
  for (const person of roster) {
    if (!person || typeof person.url !== "string") continue
    let url
    try {
      url = new URL(person.url)
    } catch {
      continue
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue
    const skills = Array.isArray(person.skills) ? person.skills : []
    for (const skill of skills) {
      if (!skill || typeof skill.name !== "string" || skill.name.trim().length === 0) continue
      entries.push({
        personName: typeof person.name === "string" && person.name.trim() ? person.name.trim() : "未命名",
        url: url.toString().replace(/\/$/, ""),
        skillName: skill.name.trim(),
        description: typeof skill.description === "string" ? skill.description.trim() : "",
        inputSchema: skill.inputSchema,
        outputSchema: skill.outputSchema,
      })
    }
  }
  return entries.sort(
    (a, b) => a.personName.localeCompare(b.personName, "zh") || a.skillName.localeCompare(b.skillName, "zh") || a.url.localeCompare(b.url),
  )
}

function fnv(value) {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function toolName(entry) {
  const id = entry.url.split("/").pop()?.replace(/[^A-Za-z0-9_-]/g, "") || "person"
  const skill = entry.skillName.replace(/[^A-Za-z0-9_-]/g, "")
  const suffix = fnv(`${entry.url}\n${entry.skillName}`)
  const raw = `a2h_${id}_${skill}_${suffix}`
  const named = raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64)
  if (/^[A-Za-z0-9_-]+$/.test(named) && named.length > 0) return named
  return `a2h_${suffix}`
}

export function uniqueToolNames(entries) {
  const used = new Set()
  return entries.map((entry) => {
    const base = toolName(entry).slice(0, 64)
    let name = base
    let n = 2
    while (used.has(name)) {
      const tail = `_${n}`
      name = `${base.slice(0, 64 - tail.length)}${tail}`
      n += 1
    }
    used.add(name)
    return { entry, name }
  })
}

export function rosterKey(entries) {
  return entries.map((entry) => `${entry.url}\n${entry.skillName}\n${entry.description}`).join("\n---\n")
}

function schemaLine(label, schema) {
  if (!schema || typeof schema !== "object") return ""
  const text = JSON.stringify(schema)
  return `${label}：${text.length > 800 ? `${text.slice(0, 800)}…` : text}`
}

export function describeDuty(entry) {
  return [
    `在岗的人：${entry.personName}。技能：${entry.skillName}。`,
    entry.description,
    schemaLine("输入", entry.inputSchema),
    schemaLine("输出", entry.outputSchema),
    "prompt 里写要这个人办的事。内容若是 JSON 对象或数组，会按 application/json 送出。这一调用会等到人交回产物。",
  ]
    .filter(Boolean)
    .join("\n")
}

export function summarizeRoster(entries) {
  if (entries.length === 0) return "这张卡上现在没有在岗的人。"
  const lines = entries.map((entry) => `- ${entry.personName} · ${entry.skillName}${entry.description ? `：${entry.description}` : ""}`)
  return `已接上 ${entries.length} 项在岗技能：\n${lines.join("\n")}`
}

export function messageParts(prompt) {
  const text = String(prompt ?? "").trim()
  if (!text) throw new Error("prompt 不能是空的")
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const data = JSON.parse(text)
      if (data && typeof data === "object") return [{ mediaType: "application/json", data }]
    } catch {
      // The model wrote prose that happens to start with a bracket.
    }
  }
  return [{ mediaType: "text/plain", text }]
}

export function sendBody({ messageId, skill, prompt }) {
  return {
    jsonrpc: "2.0",
    id: messageId,
    method: "SendMessage",
    params: {
      configuration: { returnImmediately: true },
      metadata: { skill, caller: "DeepSeek Harness" },
      message: {
        role: "ROLE_USER",
        messageId,
        parts: messageParts(prompt),
      },
    },
  }
}

export function getBody(taskId) {
  return {
    jsonrpc: "2.0",
    id: `get-${taskId}`,
    method: "GetTask",
    params: { id: taskId },
  }
}

export function taskOf(response) {
  if (!response || typeof response !== "object") return null
  if (response.error) return null
  const result = response.result
  if (!result || typeof result !== "object") return null
  if (result.task && typeof result.task === "object") return result.task
  if (typeof result.id === "string" && result.status) return result
  return null
}

function partText(part) {
  if (!part || typeof part !== "object") return ""
  if (typeof part.text === "string" && part.text.trim()) return part.text.trim()
  if (part.data !== undefined) return typeof part.data === "string" ? part.data : JSON.stringify(part.data)
  if (typeof part.raw === "string" && typeof part.mediaType === "string" && part.mediaType.startsWith("image/")) {
    return part.raw.length <= 12000 ? `[图片 ${part.mediaType}] ${part.raw}` : `[图片 ${part.mediaType}，${part.raw.length} 字符 base64]`
  }
  return ""
}

export function artifactText(task) {
  const parts = (task?.artifacts ?? []).flatMap((artifact) => artifact?.parts ?? [])
  return parts.map(partText).filter(Boolean).join("\n")
}

function statusText(task) {
  const parts = task?.status?.message?.parts
  if (!Array.isArray(parts)) return ""
  return parts.map(partText).filter(Boolean).join("\n")
}

export function formatTask(task) {
  const state = task?.status?.state
  const text = artifactText(task)
  const note = statusText(task)
  if (FAILED.has(state)) throw new Error(note || text || state)
  if (ASKING.has(state)) return note || text || state
  if (state === "TASK_STATE_COMPLETED") return text || "人交回了空产物"
  throw new Error(note || `任务停在 ${state || "未知状态"}`)
}

function delay(ms, signal) {
  if (!(ms > 0)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error("已取消"))
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export async function delegateTask({ url, skill, prompt, call, signal, intervalMs = 2000, waitMs = 600000, messageId = crypto.randomUUID() }) {
  const sent = await call(url, sendBody({ messageId, skill, prompt }), signal)
  if (sent?.error) throw new Error(sent.error.message || "SendMessage 失败")
  let task = taskOf(sent)
  if (!task?.id) throw new Error("没有返回任务")
  const deadline = Date.now() + waitMs
  while (WAITING.has(task.status?.state)) {
    if (signal?.aborted) throw new Error("已取消")
    if (Date.now() >= deadline) throw new Error("人还没交，等待超时")
    await delay(intervalMs, signal)
    const got = await call(url, getBody(task.id), signal)
    if (got?.error) throw new Error(got.error.message || "GetTask 失败")
    const next = taskOf(got)
    if (!next?.id) throw new Error("GetTask 没有返回任务")
    task = next
  }
  return formatTask(task)
}
