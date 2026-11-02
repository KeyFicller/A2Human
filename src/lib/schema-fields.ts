import type { JsonSchema } from "./types"

export const FIELD_TYPES = ["string", "integer", "number", "boolean", "image"] as const

export const IMAGE_MODES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const

export type FieldType = (typeof FIELD_TYPES)[number]

export type SchemaField = {
  name: string
  type: FieldType
  required: boolean
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

function propertySchema(field: SchemaField): JsonSchema {
  if (field.type === "image") return { type: "string", contentMediaType: "image/*" }
  return { type: field.type }
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
    if (record.type === "string" && "contentMediaType" in record) {
      if (keys.some((key) => key !== "type" && key !== "contentMediaType")) return null
      if (typeof record.contentMediaType !== "string" || !record.contentMediaType.startsWith("image/")) return null
      fields.push({ name, type: "image", required: required.has(name) })
      continue
    }
    if (keys.some((key) => key !== "type")) return null
    if (!isFieldType(record.type) || record.type === "image") return null
    fields.push({ name, type: record.type, required: required.has(name) })
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
  return fields.map((field) => `${field.name} ${TYPE_LABEL[field.type]}${field.required ? "，必填" : ""}`).join("；")
}
