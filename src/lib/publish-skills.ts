const TOOL_ID = /^[a-z][a-z0-9_]{0,23}$/

type NamedSkill = { name: string; title?: string }

export type DraftField = {
  name: string
  type: "string" | "integer" | "number" | "boolean" | "image" | "audio"
  required: boolean
  description?: string
}

export type DeliveryKind = "text" | "image" | "image_text" | "audio" | "audio_text"

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

/** Remount the worker check when the slot or template changes. Delivery changes keep compatible text. */
export function workerSessionKey(slot: number, template: string | null) {
  return `${slot}\n${template ?? ""}`
}

export function personNameIssue(name: string): "name.length" | null {
  const length = [...name.trim()].length
  if (length < 2 || length > 16) return "name.length"
  return null
}

/** Empty and the old placeholder bio are not a real introduction. */
export function bioIssue(bio: string, blocked: string[] = []): "empty" | "placeholder" | null {
  const trimmed = bio.trim()
  if (!trimmed) return "empty"
  if (blocked.some((item) => item.trim() && trimmed === item.trim())) return "placeholder"
  return null
}

export function publishAction(bound: boolean, fresh: boolean): "save" | "publish" {
  return bound && !fresh ? "save" : "publish"
}

export type PlayMode = "timed_draw" | "paper" | "roll" | "wetware" | "book" | "human_check" | "open_mic"

const PLAY_BY_NAME: Record<string, PlayMode> = {
  hand_draw: "timed_draw",
  paper_think: "paper",
  human_roll: "roll",
  wetware_run: "wetware",
  offline_lookup: "book",
  human_check: "human_check",
  open_mic: "open_mic",
}

export function playMode(name: string): PlayMode | null {
  return PLAY_BY_NAME[name] ?? null
}

export function asPlayMode(value: string | null | undefined): PlayMode | null {
  if (
    value === "timed_draw" ||
    value === "paper" ||
    value === "roll" ||
    value === "wetware" ||
    value === "book" ||
    value === "human_check" ||
    value === "open_mic"
  ) {
    return value
  }
  return null
}

export function playHintKey(mode: PlayMode): "playTimed" | "playPaper" | "playRoll" | "playWetware" | "playBook" | "playHuman" | "playMic" {
  if (mode === "timed_draw") return "playTimed"
  if (mode === "paper") return "playPaper"
  if (mode === "roll") return "playRoll"
  if (mode === "wetware") return "playWetware"
  if (mode === "book") return "playBook"
  if (mode === "open_mic") return "playMic"
  return "playHuman"
}

export const DRAW_LIMIT_MS = 30_000

export const MIC_LIMIT_MS = 15_000

export function usesTimedBoard(name: string, delivery: DeliveryKind, play?: string | null) {
  return (asPlayMode(play) ?? playMode(name)) === "timed_draw" && delivery === "image"
}

export function usesTimedMic(name: string, delivery: DeliveryKind, play?: string | null) {
  const mode = asPlayMode(play) ?? playMode(name)
  return mode === "open_mic" && (delivery === "audio" || delivery === "audio_text")
}

/** The play hint and timed board follow the delivery the person will actually publish. */
export function activePlay(name: string, delivery: DeliveryKind | "custom", play?: string | null): PlayMode | null {
  const mode = asPlayMode(play) ?? playMode(name)
  if (!mode || delivery === "custom") return null
  if (mode === "timed_draw") return delivery === "image" ? mode : null
  if (mode === "paper" || mode === "roll") return delivery === "image_text" ? mode : null
  if (mode === "open_mic") return delivery === "audio" || delivery === "audio_text" ? mode : null
  return delivery === "text" ? mode : null
}

/** A custom tool id can still be the carbon drawing preset. The description is the fallback when play was not stored. */
const TIMED_DRAW = /\u4e09\u5341\u79d2|30\s*\u79d2|30s/i
const OPEN_MIC = /\u5341\u4e94\u79d2|15\s*\u79d2|15s/i

export function promisesTimedDraw(text: string) {
  return TIMED_DRAW.test(text)
}

/** A custom tool id can still be the open-mic preset when the copy still promises a timed take. */
export function promisesOpenMic(text: string) {
  return OPEN_MIC.test(text)
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

export function timedClock(startedAt: number | null, now: number, limitMs: number): { phase: "idle" | "live" | "frozen"; leftMs: number } {
  if (startedAt == null) return { phase: "idle", leftMs: limitMs }
  const elapsed = Math.max(0, now - startedAt)
  if (elapsed >= limitMs) return { phase: "frozen", leftMs: 0 }
  return { phase: "live", leftMs: limitMs - elapsed }
}

export function drawClock(startedAt: number | null, now: number) {
  return timedClock(startedAt, now, DRAW_LIMIT_MS)
}

export function micClock(startedAt: number | null, now: number) {
  return timedClock(startedAt, now, MIC_LIMIT_MS)
}

/** Prefer the bundled presets so a stale API catalog cannot add or rename the first-screen list. */
export function mergePresetCatalog<T extends { name: string }>(remote: T[], bundled: T[]): T[] {
  const local = new Map(bundled.map((item) => [item.name, item]))
  const seen = new Set<string>()
  const merged = remote.flatMap((item) => {
    const preset = local.get(item.name)
    if (!preset) return []
    seen.add(item.name)
    return [preset]
  })
  for (const item of bundled) {
    if (!seen.has(item.name)) merged.push(item)
  }
  return merged
}

export type CatalogFieldLabels = { input: Record<string, string>; output: Record<string, string> }

export type CatalogCopy = {
  title: string
  description: string
  sample: string
  /** English labels for the preset's schema fields. The Chinese ones are the schema descriptions. */
  fields?: CatalogFieldLabels
}

type SchemaSide = "input" | "output"

type LabeledPreset = {
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  en?: { fields?: CatalogFieldLabels }
}

function presetProperties(preset: LabeledPreset, side: SchemaSide) {
  const schema = side === "input" ? preset.inputSchema : preset.outputSchema
  const properties = schema?.properties
  return properties && typeof properties === "object" ? (properties as Record<string, Record<string, unknown>>) : {}
}

/** A preset's field labels in one locale, keyed by field name. */
export function presetFieldLabels(preset: LabeledPreset, side: SchemaSide, locale: "zh" | "en"): Record<string, string> {
  if (locale === "en") return { ...(preset.en?.fields?.[side] ?? {}) }
  const labels: Record<string, string> = {}
  for (const [name, property] of Object.entries(presetProperties(preset, side))) {
    if (typeof property.description === "string") labels[name] = property.description
  }
  return labels
}

/** The preset schema with each field described in the current locale. */
export function localizedPresetSchema(preset: LabeledPreset, side: SchemaSide, locale: "zh" | "en") {
  const schema = side === "input" ? preset.inputSchema : preset.outputSchema
  if (!schema || locale === "zh") return schema
  const labels = presetFieldLabels(preset, side, "en")
  const properties = Object.fromEntries(
    Object.entries(presetProperties(preset, side)).map(([name, property]) => [name, labels[name] ? { ...property, description: labels[name] } : property]),
  )
  return { ...schema, properties }
}

/** Swap labels that still read as the preset's label in either locale. A label the person wrote stays. */
export function relabelPresetFields<F extends { name: string; description?: string }>(
  fields: F[],
  preset: LabeledPreset,
  side: SchemaSide,
  locale: "zh" | "en",
): F[] {
  const zh = presetFieldLabels(preset, side, "zh")
  const en = presetFieldLabels(preset, side, "en")
  const target = locale === "en" ? en : zh
  return fields.map((field) => {
    const label = target[field.name]
    if (!label || !field.description) return field
    return field.description === zh[field.name] || field.description === en[field.name] ? { ...field, description: label } : field
  })
}

export function catalogText(
  item: { title: string; description: string; sample: string; en?: CatalogCopy },
  locale: "zh" | "en",
): CatalogCopy {
  if (locale === "en" && item.en?.title && item.en.description && item.en.sample) return item.en
  return { title: item.title, description: item.description, sample: item.sample }
}

/** Show the current locale's catalog copy when a field is still a catalog string. Custom text stays. */
export function alignPresetCopy(
  stored: { title: string; description: string; sample?: string },
  preset: { title: string; description: string; sample: string; en?: CatalogCopy } | null,
  locale: "zh" | "en",
) {
  if (!preset) {
    return { title: stored.title.trim(), description: stored.description, sample: stored.sample ?? "" }
  }
  const zh = catalogText(preset, "zh")
  const en = catalogText(preset, "en")
  const current = catalogText(preset, locale)
  const title = stored.title.trim()
  const sample = stored.sample ?? ""
  return {
    title: !title || title === zh.title || title === en.title ? current.title : title,
    description: stored.description === zh.description || stored.description === en.description ? current.description : stored.description,
    sample: !sample || sample === zh.sample || sample === en.sample ? current.sample : sample,
  }
}

/** Refresh fields that still match the previous locale. Leave anything the person edited. */
export function relocalizeFields(current: CatalogCopy, previous: CatalogCopy, next: CatalogCopy): CatalogCopy {
  return {
    title: current.title === previous.title ? next.title : current.title,
    description: current.description === previous.description ? next.description : current.description,
    sample: current.sample === previous.sample ? next.sample : current.sample,
  }
}

/** Installed chips use the display title, or the tool id when there is no title. Never the blank-action label. */
/** The name people read: the written title, else the preset's title for a preset tool id, else the tool id. */
export function displayTitle(
  skill: { name: string; title?: string },
  catalog: Array<{ name: string; title: string; description: string; sample: string; en?: CatalogCopy }>,
  locale: "zh" | "en",
) {
  const title = skill.title?.trim() ?? ""
  if (title && title !== skill.name) return title
  const preset = catalog.find((item) => item.name === skill.name)
  return (preset && catalogText(preset, locale).title) || title || skill.name
}

/** A stored title that only repeats the tool id is not a display name. The edit form leaves it blank. */
export function editableTitle(title: string | undefined, name: string) {
  const trimmed = title?.trim() ?? ""
  return trimmed === name ? "" : trimmed
}

export function installedLabel(skill: { title?: string; name?: string }) {
  const title = skill.title?.trim() ?? ""
  if (title) return title
  return skill.name?.trim() ?? ""
}

/** The blank action is only the empty slot it just created, not an existing custom skill. */
export function isBlankDraft(skill: { template: string | null; title: string; name: string; description: string }) {
  return skill.template === null && !skill.title.trim() && !skill.name.trim() && !skill.description.trim()
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
  const audio = { type: "string", contentMediaType: "audio/*" }
  if (kind === "image") return { type: "object", properties: { picture }, required: ["picture"] }
  if (kind === "image_text") return { type: "object", properties: { answer, picture }, required: ["answer", "picture"] }
  if (kind === "audio") return { type: "object", properties: { audio }, required: ["audio"] }
  if (kind === "audio_text") return { type: "object", properties: { answer, audio }, required: ["answer", "audio"] }
  return { type: "object", properties: { answer }, required: ["answer"] }
}

function mediaKind(value: { type?: unknown; contentMediaType?: unknown }) {
  if (value.type !== "string" || typeof value.contentMediaType !== "string") return null
  if (value.contentMediaType.startsWith("image/")) return "image"
  if (value.contentMediaType.startsWith("audio/")) return "audio"
  return null
}

export function deliveryOf(
  schema: { type?: unknown; properties?: Record<string, { type?: unknown; contentMediaType?: unknown }>; required?: unknown } | undefined,
): DeliveryKind | "custom" {
  if (!schema || schema.type !== "object" || !schema.properties) return "custom"
  const entries = Object.entries(schema.properties)
  if (!entries.length) return "custom"
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [])
  const images = entries.filter(([, value]) => mediaKind(value) === "image")
  const audios = entries.filter(([, value]) => mediaKind(value) === "audio")
  const rest = entries.filter(([, value]) => mediaKind(value) == null)
  const listed = (name: string) => required.has(name)
  if (audios.length && images.length) return "custom"
  if (audios.length === 1 && rest.length === 0) return listed(audios[0][0]) ? "audio" : "custom"
  if (audios.length === 1 && rest.length === 1 && rest[0][1].type === "string" && listed(rest[0][0])) return "audio_text"
  if (images.length === 1 && rest.length === 0) return listed(images[0][0]) ? "image" : "custom"
  if (images.length === 1 && rest.length === 1 && rest[0][1].type === "string" && listed(rest[0][0])) return "image_text"
  if (images.length === 0 && audios.length === 0 && rest.length === 1 && rest[0][1].type === "string" && listed(rest[0][0])) return "text"
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

export function skillPayload(skill: { name: string; title: string; description: string; inputSchema: string; outputSchema: string; play?: string | null }) {
  const title = skill.title.trim()
  const inputSchema = skill.inputSchema.trim()
  const outputSchema = skill.outputSchema.trim()
  const play = asPlayMode(skill.play)
  return {
    name: skill.name,
    description: skill.description,
    ...(title ? { title } : {}),
    ...(play ? { play } : {}),
    ...(inputSchema ? { inputSchema } : {}),
    ...(outputSchema ? { outputSchema } : {}),
  }
}
