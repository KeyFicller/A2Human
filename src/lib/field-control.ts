import type { FieldType } from "./schema-fields"
import type { TaskImage } from "./types"

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

export const IMAGE_MAX_BYTES = 1_000_000

const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/

// Passage-shaped names use a textarea. Other strings stay on one line.
// The names are the built-in catalog's long fields, plus a few a custom skill is likely to mean the same way.
const PASSAGE_NAMES = new Set([
  "answer",
  "body",
  "brief",
  "comment",
  "content",
  "description",
  "feedback",
  "ideas",
  "material",
  "message",
  "note",
  "plan",
  "prompt",
  "question",
  "reply",
  "request",
  "sources",
  "suggestion",
  "summary",
  "text",
])

export const ENUM_RADIO_MAX = 5

export type EnumValue = string | number

export type ControlSpec =
  | { kind: "text"; inputMode: "text" }
  | { kind: "textarea" }
  | { kind: "integer"; step: 1; inputMode: "numeric" }
  | { kind: "number"; step: "any"; inputMode: "decimal" }
  | { kind: "boolean"; widget: "checkbox" }
  | { kind: "enum"; widget: "radio" | "select"; options: EnumValue[] }
  | { kind: "image"; accept: string; maxBytes: number }

export function stringIsPassage(name: string | undefined, longString = false) {
  if (longString) return true
  const trimmed = (name ?? "").trim()
  if (!trimmed) return false
  if (/[\u3400-\u9fff]/.test(trimmed)) return true
  return PASSAGE_NAMES.has(trimmed.toLowerCase())
}

export function controlSpec(
  type: FieldType,
  options?: { name?: string; longString?: boolean; enum?: EnumValue[] },
): ControlSpec {
  const choices = options?.enum ?? []
  if (choices.length > 0 && type !== "boolean" && type !== "image") {
    return { kind: "enum", widget: choices.length <= ENUM_RADIO_MAX ? "radio" : "select", options: choices }
  }
  if (type === "string") {
    return stringIsPassage(options?.name, options?.longString) ? { kind: "textarea" } : { kind: "text", inputMode: "text" }
  }
  if (type === "integer") return { kind: "integer", step: 1, inputMode: "numeric" }
  if (type === "number") return { kind: "number", step: "any", inputMode: "decimal" }
  if (type === "boolean") return { kind: "boolean", widget: "checkbox" }
  return { kind: "image", accept: IMAGE_ACCEPT, maxBytes: IMAGE_MAX_BYTES }
}

export function parseEnumText(raw: string, type: "string" | "integer" | "number"): { ok: true; values: EnumValue[] } | { ok: false } {
  const parts = raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (parts.length === 0) return { ok: true, values: [] }
  if (parts.length > 20) return { ok: false }
  const values: EnumValue[] = []
  for (const part of parts) {
    if ([...part].length > 80) return { ok: false }
    if (type === "string") {
      if (!values.includes(part)) values.push(part)
      continue
    }
    if (type === "integer") {
      if (!/^-?\d+$/.test(part)) return { ok: false }
      const number = Number(part)
      if (!Number.isSafeInteger(number)) return { ok: false }
      if (!values.includes(number)) values.push(number)
      continue
    }
    if (!/^-?\d+(?:\.\d+)?$/.test(part)) return { ok: false }
    const number = Number(part)
    if (!Number.isFinite(number)) return { ok: false }
    if (!values.includes(number)) values.push(number)
  }
  return { ok: true, values }
}

export function formatEnum(values: EnumValue[] | undefined) {
  return values?.join(", ") ?? ""
}

export function acceptIntegerDraft(raw: string) {
  return raw === "" || raw === "-" || /^-?\d+$/.test(raw)
}

export type ParsedField =
  | { state: "empty" }
  | { state: "bad" }
  | { state: "value"; value: string | number | boolean }

export function parseFieldValue(
  type: "string" | "integer" | "number" | "boolean",
  raw: string,
  choices?: EnumValue[],
): ParsedField {
  const text = raw.trim()
  if (type === "boolean") return { state: "value", value: text === "true" }
  if (!text) return { state: "empty" }
  if (choices?.length) {
    if (type === "string") return choices.some((item) => item === text) ? { state: "value", value: text } : { state: "bad" }
    const number = Number(text)
    if (!Number.isFinite(number) || (type === "integer" && !Number.isInteger(number))) return { state: "bad" }
    return choices.some((item) => item === number) ? { state: "value", value: number } : { state: "bad" }
  }
  if (type === "integer" || type === "number") {
    if (type === "integer" && !/^-?\d+$/.test(text)) return { state: "bad" }
    const number = Number(text)
    if (!Number.isFinite(number) || (type === "integer" && !Number.isInteger(number))) return { state: "bad" }
    return { state: "value", value: number }
  }
  return { state: "value", value: text }
}

export function imageFromDataUrl(
  result: string,
  filename: string,
  size: number,
): { image: TaskImage } | { error: "tooBig" | "type" } {
  if (size > IMAGE_MAX_BYTES) return { error: "tooBig" }
  const matched = DATA_IMAGE.exec(result)
  if (!matched) return { error: "type" }
  const mediaType = matched[1]
  if (mediaType !== "image/png" && mediaType !== "image/jpeg" && mediaType !== "image/webp" && mediaType !== "image/gif") {
    return { error: "type" }
  }
  return { image: { mediaType, raw: matched[2].replace(/\s/g, ""), filename } }
}
