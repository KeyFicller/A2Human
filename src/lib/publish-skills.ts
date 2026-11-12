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

export function customSkillAddLabel(customCount: number): "customAdd" | "addSkill" {
  return customCount > 0 ? "addSkill" : "customAdd"
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
