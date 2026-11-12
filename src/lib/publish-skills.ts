const TOOL_ID = /^[a-z][a-z0-9_]{0,23}$/

type NamedSkill = { name: string; title?: string }

export type DraftField = {
  name: string
  type: "string" | "integer" | "number" | "boolean" | "image"
  required: boolean
  description?: string
}

export type DeliveryKind = "text" | "image" | "image_text"

type DeliveryProperty = { type: string; contentMediaType?: string }

export type DeliverySchema = {
  type: "object"
  properties: Record<string, DeliveryProperty>
  required: string[]
}

export function canAddCustomSkill(skillCount: number) {
  return skillCount < 6
}

/** A second skill is an explicit action. The blank-template control never turns into it. */
export function canStartAnother(skillCount: number) {
  return skillCount > 0 && skillCount < 6
}

export type SlotIdentity = {
  name: string
  title: string
  description: string
  sample: string
  template: string | null
  nameTouched: boolean
}

export function blankIdentity(): SlotIdentity {
  return { name: "", title: "", description: "", sample: "", template: null, nameTouched: false }
}

export function presetIdentity(
  item: { name: string; title: string; description: string; sample: string },
  taken: string[] = [],
  skills: NamedSkill[] = [],
): SlotIdentity {
  const name = taken.includes(item.name) ? toolIdFromTitle(item.title, taken, skills) : item.name
  return {
    name,
    title: item.title,
    description: item.description,
    sample: item.sample,
    template: item.name,
    nameTouched: true,
  }
}

/** Replace the skill being edited. An empty list gains its first skill and does not grow past that. */
export function applyToSlot<T>(slots: T[], index: number, next: T): T[] {
  if (slots.length === 0) return [next]
  const at = Math.min(Math.max(index, 0), slots.length - 1)
  return slots.map((slot, item) => (item === at ? next : slot))
}

export function addAnotherSlot<T>(slots: T[], blank: T): T[] | null {
  if (!canStartAnother(slots.length)) return null
  return [...slots, blank]
}

export function toolIdProblem(value: string): "empty" | "invalid" | null {
  if (!value) return "empty"
  if (!TOOL_ID.test(value)) return "invalid"
  return null
}

/** Keep a hand-edited id. An untouched id follows the display name, and a blank name does not invent `skill`. */
export function toolIdAfterTitle(title: string, taken: Iterable<string>, skills: NamedSkill[], nameTouched: boolean, current: string) {
  if (nameTouched) return current
  const trimmed = title.trim()
  if (!trimmed) return ""
  return toolIdFromTitle(trimmed, taken, skills)
}

export function withToolId(slot: SlotIdentity, name: string): SlotIdentity {
  return { ...slot, name, nameTouched: true }
}

export function previewFields(skill: { title: string; description: string; sample: string } | null) {
  return {
    title: skill?.title.trim() ?? "",
    description: skill?.description.trim() ?? "",
    task: skill?.sample.trim() ?? "",
  }
}

/** Try-fill and check results are keyed to the slot, its template, and the delivery schema. */
export function previewSessionKey(slot: number, template: string | null, delivery: string) {
  return `${slot}\n${template ?? ""}\n${delivery}`
}

export function personNameIssue(name: string): "name.length" | null {
  const length = [...name.trim()].length
  if (length < 2 || length > 16) return "name.length"
  return null
}

export function publishAction(bound: boolean, fresh: boolean): "save" | "publish" {
  return bound && !fresh ? "save" : "publish"
}

export type PlayMode = "timed_draw" | "paper" | "roll" | "wetware" | "book" | "human_check"

const PLAY_BY_NAME: Record<string, PlayMode> = {
  hand_draw: "timed_draw",
  paper_think: "paper",
  human_roll: "roll",
  wetware_run: "wetware",
  offline_lookup: "book",
  human_check: "human_check",
}

export function playMode(name: string): PlayMode | null {
  return PLAY_BY_NAME[name] ?? null
}

export function playHintKey(mode: PlayMode): "playTimed" | "playPaper" | "playRoll" | "playWetware" | "playBook" | "playHuman" {
  if (mode === "timed_draw") return "playTimed"
  if (mode === "paper") return "playPaper"
  if (mode === "roll") return "playRoll"
  if (mode === "wetware") return "playWetware"
  if (mode === "book") return "playBook"
  return "playHuman"
}

export const DRAW_LIMIT_MS = 30_000

export function usesTimedBoard(name: string, delivery: DeliveryKind) {
  return playMode(name) === "timed_draw" && delivery === "image"
}

/** The play hint and timed board follow the delivery the person will actually publish. */
export function activePlay(name: string, delivery: DeliveryKind | "custom"): PlayMode | null {
  const mode = playMode(name)
  if (!mode || delivery === "custom") return null
  if (mode === "timed_draw") return delivery === "image" ? mode : null
  if (mode === "paper" || mode === "roll") return delivery === "image_text" ? mode : null
  return delivery === "text" ? mode : null
}

/** `{}` is an empty field form, not extra text beside an image-only delivery. */
export function blankDeliveryText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return true
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false
    return Object.keys(parsed).length === 0
  } catch {
    return false
  }
}

export function drawClock(startedAt: number | null, now: number): { phase: "idle" | "live" | "frozen"; leftMs: number } {
  if (startedAt == null) return { phase: "idle", leftMs: DRAW_LIMIT_MS }
  const elapsed = Math.max(0, now - startedAt)
  if (elapsed >= DRAW_LIMIT_MS) return { phase: "frozen", leftMs: 0 }
  return { phase: "live", leftMs: DRAW_LIMIT_MS - elapsed }
}

/** Prefer the bundled preset text so a stale API catalog cannot drop the play-mode contract. */
export function mergePresetCatalog<T extends { name: string }>(remote: T[], bundled: T[]): T[] {
  const local = new Map(bundled.map((item) => [item.name, item]))
  const seen = new Set<string>()
  const merged = remote.map((item) => {
    seen.add(item.name)
    return local.get(item.name) ?? item
  })
  for (const item of bundled) {
    if (!seen.has(item.name)) merged.push(item)
  }
  return merged
}

export function defaultTaskInput(label: string): DraftField[] {
  return [{ name: "task", type: "string", required: true, description: label }]
}

export function fieldPill(field: { name: string; description?: string }, typeLabel: string, mark: string) {
  const label = field.description?.trim() || field.name || "…"
  return `${label} · ${typeLabel} · ${mark}`
}

export function deliverySchema(kind: DeliveryKind): DeliverySchema {
  const answer = { type: "string" }
  const picture = { type: "string", contentMediaType: "image/*" }
  if (kind === "image") return { type: "object", properties: { picture }, required: ["picture"] }
  if (kind === "image_text") return { type: "object", properties: { answer, picture }, required: ["answer", "picture"] }
  return { type: "object", properties: { answer }, required: ["answer"] }
}

function isImageProperty(value: { type?: unknown; contentMediaType?: unknown }) {
  return value.type === "string" && typeof value.contentMediaType === "string" && value.contentMediaType.startsWith("image/")
}

export function deliveryOf(
  schema: { type?: unknown; properties?: Record<string, { type?: unknown; contentMediaType?: unknown }>; required?: unknown } | undefined,
): DeliveryKind | "custom" {
  if (!schema || schema.type !== "object" || !schema.properties) return "custom"
  const entries = Object.entries(schema.properties)
  if (!entries.length) return "custom"
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [])
  if (!entries.every(([name]) => required.has(name))) return "custom"
  const images = entries.filter(([, value]) => isImageProperty(value))
  const rest = entries.filter(([, value]) => !isImageProperty(value))
  if (images.length === 1 && rest.length === 0) return "image"
  if (images.length === 1 && rest.length === 1 && rest[0][1].type === "string") return "image_text"
  if (images.length === 0 && rest.length === 1 && rest[0][1].type === "string") return "text"
  return "custom"
}

function fnvTail(value: string) {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 4)
}

function asciiSlug(value: string) {
  const parts = value.toLowerCase().match(/[a-z0-9]+/g)
  if (!parts) return ""
  const slug = parts.join("_").replace(/^[^a-z]+/, "").slice(0, 24).replace(/_+$/, "")
  return TOOL_ID.test(slug) ? slug : ""
}

function withSuffix(base: string, index: number) {
  if (index < 2) return base.slice(0, 24).replace(/_+$/, "")
  const suffix = `_${index}`
  return `${base.slice(0, 24 - suffix.length)}${suffix}`
}

export function toolIdFromTitle(title: string, taken: Iterable<string> = [], skills: NamedSkill[] = []) {
  const used = new Set(taken)
  const reserved = new Set(skills.map((skill) => skill.name))
  const trimmed = title.trim()
  const preset = skills.find((skill) => skill.title === trimmed)
  if (preset && TOOL_ID.test(preset.name) && !used.has(preset.name)) return preset.name
  const slug = asciiSlug(trimmed)
  const base = slug && !reserved.has(slug) ? slug : trimmed ? `skill_${fnvTail(trimmed)}` : "skill"
  for (let index = used.has(base) || reserved.has(base) ? 2 : 0; index < 100; index = index === 0 ? 2 : index + 1) {
    const candidate = withSuffix(base, index)
    if (TOOL_ID.test(candidate) && !used.has(candidate) && !reserved.has(candidate)) return candidate
  }
  return "skill"
}

export function skillPayload(skill: { name: string; title: string; description: string; inputSchema: string; outputSchema: string }) {
  const title = skill.title.trim()
  const inputSchema = skill.inputSchema.trim()
  const outputSchema = skill.outputSchema.trim()
  return {
    name: skill.name,
    description: skill.description,
    ...(title ? { title } : {}),
    ...(inputSchema ? { inputSchema } : {}),
    ...(outputSchema ? { outputSchema } : {}),
  }
}
