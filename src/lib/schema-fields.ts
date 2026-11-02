import type { JsonSchema } from "./types"

export const FIELD_TYPES = ["string", "integer", "number", "boolean"] as const

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

export function fieldsToSchema(fields: SchemaField[]): JsonSchema | undefined {
  const named = fields.filter((field) => field.name.trim())
  if (named.length === 0) return undefined
  const properties: Record<string, { type: FieldType }> = {}
  const required: string[] = []
  for (const field of named) {
    const name = field.name.trim()
    properties[name] = { type: field.type }
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
    if (Object.keys(record).some((key) => key !== "type")) return null
    if (!isFieldType(record.type)) return null
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

export function describeSchema(schema: JsonSchema) {
  const fields = schemaToFields(schema)
  if (!fields) return JSON.stringify(schema)
  return fields.map((field) => `${field.name} ${TYPE_LABEL[field.type]}${field.required ? "，必填" : ""}`).join("；")
}
