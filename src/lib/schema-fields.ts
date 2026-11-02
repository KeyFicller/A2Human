import type { JsonSchema } from "./types"

export const FIELD_TYPES = ["string", "integer", "number", "boolean", "image"] as const

export const IMAGE_MODES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export type SchemaField = {
  name: string
  type: FieldType
  required: boolean
  description?: string
}

export type SchemaDraft = {
  mode: "fields" | "json"
  fields: SchemaField[]
  json: string
}

const TYPE_LABEL: Record<FieldType, string> = {
  string: "文字",
  integer: "整数",
  number: "数字",
  boolean: "是或否",
  image: "图片",
}

export function emptySchemaDraft(): SchemaDraft {
  return { mode: "fields", fields: [], json: "" }
}

export function fieldTypeLabel(type: FieldType) {
  return TYPE_LABEL[type]
}

function isFieldType(value: unknown): value is FieldType {
  return FIELD_TYPES.some((type) => type === value)
}

function readDescription(record: Record<string, unknown>) {
  if (!("description" in record)) return undefined
  if (typeof record.description !== "string") return null
  const text = record.description.trim()
  if ([...text].length > 120) return null
  return text || undefined
}

function propertySchema(field: SchemaField): JsonSchema {
  const description = field.description?.trim()
  const base: JsonSchema = field.type === "image" ? { type: "string", contentMediaType: "image/*" } : { type: field.type }
  if (!description) return base
  return { ...base, description: [...description].slice(0, 120).join("") }
}

export function fieldsToSchema(fields: SchemaField[]): JsonSchema | undefined {
  const named = fields.filter((field) => field.name.trim())
  if (named.length === 0) return undefined
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const field of named) {
    const name = field.name.trim()
    properties[name] = propertySchema(field)
    if (field.required) required.push(name)
  }
  return required.length ? { type: "object", properties, required } : { type: "object", properties }
}

export function schemaToFields(schema: JsonSchema): SchemaField[] | null {
  if (schema.type !== "object") return null
  const allowed = new Set(["type", "properties", "required"])
  if (Object.keys(schema).some((key) => !allowed.has(key))) return null
  const properties = schema.properties
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null
  const entries = Object.entries(properties)
  if (entries.length === 0) return null
  if (schema.required != null && !Array.isArray(schema.required)) return null
  const required = new Set((schema.required ?? []).filter((item): item is string => typeof item === "string"))
  const fields: SchemaField[] = []
  for (const [name, value] of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    const description = readDescription(record)
    if (description === null) return null
    const described = description ? { description } : {}
    if (record.type === "string" && "contentMediaType" in record) {
      if (keys.some((key) => key !== "type" && key !== "contentMediaType" && key !== "description")) return null
      if (typeof record.contentMediaType !== "string" || !record.contentMediaType.startsWith("image/")) return null
      fields.push({ name, type: "image", required: required.has(name), ...described })
      continue
    }
    if (keys.some((key) => key !== "type" && key !== "description")) return null
    if (!isFieldType(record.type) || record.type === "image") return null
    fields.push({ name, type: record.type, required: required.has(name), ...described })
  }
  return fields
}

export function draftFromSchema(schema: JsonSchema | undefined): SchemaDraft {
  if (!schema) return emptySchemaDraft()
  const json = JSON.stringify(schema, null, 2)
  const fields = schemaToFields(schema)
  if (!fields) return { mode: "json", fields: [], json }
  return { mode: "fields", fields, json }
}

export function schemaPayload(draft: SchemaDraft): string {
  if (draft.mode === "json") return draft.json.trim()
  const schema = fieldsToSchema(draft.fields)
  return schema ? JSON.stringify(schema) : ""
}

export function duplicateFieldName(fields: SchemaField[]) {
  const names = fields.map((field) => field.name.trim()).filter(Boolean)
  return new Set(names).size !== names.length
}

function schemaMentionsImage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some(schemaMentionsImage)
  const record = value as Record<string, unknown>
  if (typeof record.contentMediaType === "string" && record.contentMediaType.startsWith("image/")) return true
  return Object.values(record).some(schemaMentionsImage)
}

export function schemaRequiresImage(schema: JsonSchema | undefined) {
  if (!schema) return false
  const fields = schemaToFields(schema)
  return Boolean(fields?.some((field) => field.type === "image" && field.required))
}

export function contractModes(schema: JsonSchema | undefined) {
  if (!schema) return undefined
  const fields = schemaToFields(schema)
  const images = fields ? fields.some((field) => field.type === "image") : schemaMentionsImage(schema)
  const data = fields ? fields.some((field) => field.type !== "image") : true
  const modes: string[] = []
  if (data) modes.push("application/json")
  if (images) modes.push(...IMAGE_MODES)
  return modes.length ? modes : ["application/json"]
}

export function describeSchema(schema: JsonSchema) {
  const fields = schemaToFields(schema)
  if (!fields) return JSON.stringify(schema)
  return fields
    .map((field) => {
      const head = `${field.name} ${TYPE_LABEL[field.type]}${field.required ? "，必填" : ""}`
      return field.description ? `${head}：${field.description}` : head
    })
    .join("；")
}

const SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "description",
  "contentMediaType",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
])

const VALUE_TYPES = new Set(["string", "integer", "number", "boolean"])

export type OutputShape =
  | { kind: "fields"; fields: SchemaField[] }
  | { kind: "value"; type: "string" | "integer" | "number" | "boolean" }
  | { kind: "image" }
  | { kind: "json" }

function isImageSchema(schema: JsonSchema) {
  return schema.type === "string" && typeof schema.contentMediaType === "string" && schema.contentMediaType.startsWith("image/")
}

export function outputShape(schema: JsonSchema): OutputShape {
  const fields = schemaToFields(schema)
  if (fields) return { kind: "fields", fields }
  if (isImageSchema(schema)) return { kind: "image" }
  if (typeof schema.type === "string" && VALUE_TYPES.has(schema.type)) {
    const keys = Object.keys(schema)
    if (keys.every((key) => ["type", "description", "minimum", "maximum", "minLength", "maxLength", "enum"].includes(key))) {
      return { kind: "value", type: schema.type as "string" | "integer" | "number" | "boolean" }
    }
  }
  return { kind: "json" }
}

function typeLabel(type: string) {
  if (type === "string") return "文字"
  if (type === "integer") return "整数"
  if (type === "number") return "数字"
  if (type === "boolean") return "是或否"
  if (type === "object") return "对象"
  if (type === "array") return "数组"
  return type
}

function valueMatchesType(type: string, value: unknown) {
  if (type === "string") return typeof value === "string"
  if (type === "boolean") return typeof value === "boolean"
  if (type === "integer") return typeof value === "number" && Number.isInteger(value)
  if (type === "number") return typeof value === "number" && Number.isFinite(value)
  if (type === "array") return Array.isArray(value)
  if (type === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value)
  return false
}

function checkValue(schema: JsonSchema, value: unknown, label: string) {
  if (Object.keys(schema).some((key) => !SCHEMA_KEYS.has(key))) throw new Error("这份输出 Schema 有对不齐的规则")
  if (schema.type == null && schema.properties == null && schema.enum == null) {
    throw new Error("这份输出 Schema 有对不齐的规则")
  }
  if (Array.isArray(schema.enum)) {
    const listed = schema.enum.some((item) => Object.is(item, value) || JSON.stringify(item) === JSON.stringify(value))
    if (!listed) throw new Error(`${label} 不在允许的值里`)
  }
  if (typeof schema.type === "string" && !valueMatchesType(schema.type, value)) {
    throw new Error(`${label} 要是${typeLabel(schema.type)}`)
  }
  if (schema.type === "string" && typeof value === "string") {
    const length = [...value].length
    if (typeof schema.minLength === "number" && length < schema.minLength) throw new Error(`${label} 太短`)
    if (typeof schema.maxLength === "number" && length > schema.maxLength) throw new Error(`${label} 太长`)
    if (typeof schema.contentMediaType === "string" && schema.contentMediaType.startsWith("image/")) {
      const image = /^https?:\/\//.test(value) || /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(value)
      if (!image) throw new Error(`${label} 要是图片地址`)
    }
  }
  if ((schema.type === "integer" || schema.type === "number") && typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) throw new Error(`${label} 太小`)
    if (typeof schema.maximum === "number" && value > schema.maximum) throw new Error(`${label} 太大`)
  }
  if (schema.type === "array" && Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) throw new Error(`${label} 项太少`)
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) throw new Error(`${label} 项太多`)
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      value.forEach((item, index) => checkValue(schema.items as JsonSchema, item, `${label}[${index}]`))
    }
  }
  if ((schema.type === "object" || schema.properties) && value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const properties =
      schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
        ? (schema.properties as Record<string, JsonSchema>)
        : {}
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []
    for (const name of required) {
      if (record[name] == null) throw new Error(`${name} 要填`)
    }
    for (const [key, item] of Object.entries(record)) {
      const property = properties[key]
      if (property) checkValue(property, item, key)
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        checkValue(schema.additionalProperties as JsonSchema, item, key)
      } else if (schema.additionalProperties !== true) throw new Error(`输出里没有 ${key}`)
    }
  }
}

function canonicalFields(fields: SchemaField[], text: string, hasImage: boolean) {
  const images = fields.filter((field) => field.type === "image")
  if (images.length > 1) throw new Error("输出里一次只能有一张图片")
  const image = images[0]
  if (image?.required && !hasImage) throw new Error("要交一张图片")
  if (!image && hasImage) throw new Error("这项输出没有图片")
  const dataFields = fields.filter((field) => field.type !== "image")
  if (dataFields.length === 0) {
    if (text.trim()) throw new Error("这项输出只要图片")
    return ""
  }
  let parsed: unknown = {}
  if (text.trim()) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error("输出要按字段交，不能写自由文本")
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("输出要是这些字段")
  const record = parsed as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const field of dataFields) {
    const value = record[field.name]
    if (value == null || value === "") {
      if (field.required) throw new Error(`${field.name} 要填`)
      continue
    }
    checkValue({ type: field.type }, value, field.name)
    out[field.name] = value
  }
  for (const key of Object.keys(record)) {
    if (image && key === image.name) continue
    if (!dataFields.some((field) => field.name === key)) throw new Error(`输出里没有 ${key}`)
  }
  return JSON.stringify(out)
}

export function canonicalOutput(schema: JsonSchema, text: string, hasImage: boolean) {
  const fields = schemaToFields(schema)
  if (fields) return canonicalFields(fields, text, hasImage)
  if (isImageSchema(schema)) {
    if (!hasImage) throw new Error("要交一张图片")
    if (text.trim()) throw new Error("这项输出只要图片")
    return ""
  }
  if (hasImage) throw new Error("这项输出没有图片")
  const trimmed = text.trim()
  if (!trimmed) throw new Error("输出要按 Schema 交，不能留空")
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error("输出要是 JSON，不能写自由文本")
  }
  checkValue(schema, parsed, "输出")
  return JSON.stringify(parsed)
}
