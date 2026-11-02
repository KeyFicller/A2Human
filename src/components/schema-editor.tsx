"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  FIELD_TYPES,
  fieldTypeLabel,
  fieldsToSchema,
  schemaToFields,
  type SchemaDraft,
  type SchemaField,
} from "@/lib/schema-fields"
import type { JsonSchema } from "@/lib/types"

function toJson(draft: SchemaDraft): SchemaDraft {
  if (draft.mode === "json") return draft
  const schema = fieldsToSchema(draft.fields)
  return { mode: "json", fields: draft.fields, json: schema ? JSON.stringify(schema, null, 2) : "" }
}

function toFields(draft: SchemaDraft): SchemaDraft | null {
  if (draft.mode === "fields") return draft
  const trimmed = draft.json.trim()
  if (!trimmed) return { mode: "fields", fields: [], json: "" }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const fields = schemaToFields(parsed as JsonSchema)
  if (!fields) return null
  return { mode: "fields", fields, json: draft.json }
}

function FieldList({
  label,
  draft,
  onChange,
}: {
  label: string
  draft: SchemaDraft
  onChange: (next: SchemaDraft) => void
}) {
  function updateField(index: number, patch: Partial<SchemaField>) {
    onChange({
      ...draft,
      fields: draft.fields.map((field, item) => (item === index ? { ...field, ...patch } : field)),
    })
  }

  return (
    <div className="space-y-2">
      <p className="text-sm">{label}</p>
      {draft.fields.length === 0 ? <p className="text-sm text-muted-foreground">还没加。不写的话，模型只看上面的说明。</p> : null}
      {draft.fields.map((field, index) => (
        <div key={index} className="grid gap-2">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_auto_auto] sm:items-center">
          <Input
            value={field.name}
            maxLength={40}
            placeholder="这项叫什么"
            aria-label={`${label}名称`}
            onChange={(event) => updateField(index, { name: event.target.value })}
          />
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={field.type}
            aria-label={`${label}类型`}
            onChange={(event) => updateField(index, { type: event.target.value as SchemaField["type"] })}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {fieldTypeLabel(type)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) => updateField(index, { required: event.target.checked })}
            />
            必填
          </label>
          <button
            type="button"
            className="text-left text-sm text-stamp"
            onClick={() => onChange({ ...draft, fields: draft.fields.filter((_, item) => item !== index) })}
          >
            去掉
          </button>
        </div>
          <Input
            value={field.description ?? ""}
            maxLength={120}
            placeholder="这项说明什么，可以不写"
            aria-label={`${label}说明`}
            onChange={(event) => updateField(index, { description: event.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        className="text-sm text-stamp"
        onClick={() => onChange({ ...draft, fields: [...draft.fields, { name: "", type: "string", required: true }] })}
      >
        加一项
      </button>
    </div>
  )
}

export function SchemaEditor({
  input,
  output,
  onChange,
}: {
  input: SchemaDraft
  output: SchemaDraft
  onChange: (next: { input: SchemaDraft; output: SchemaDraft }) => void
}) {
  const [note, setNote] = useState<string | null>(null)
  const jsonMode = input.mode === "json" || output.mode === "json"

  return (
    <div className="grid gap-3 rounded-xl bg-[#f7f1e4] p-3">
      {jsonMode ? (
        <>
          <label className="block text-sm">
            输入 JSON Schema
            <Textarea
              className="mt-1.5 font-mono text-xs"
              value={input.json}
              placeholder='{"type":"object","properties":{}}'
              onChange={(event) => onChange({ input: { ...input, json: event.target.value }, output })}
            />
          </label>
          <label className="block text-sm">
            输出 JSON Schema
            <Textarea
              className="mt-1.5 font-mono text-xs"
              value={output.json}
              placeholder='{"type":"object","properties":{}}'
              onChange={(event) => onChange({ input, output: { ...output, json: event.target.value } })}
            />
          </label>
        </>
      ) : (
        <>
          <FieldList label="输入" draft={input} onChange={(next) => onChange({ input: next, output })} />
          <FieldList label="输出" draft={output} onChange={(next) => onChange({ input, output: next })} />
        </>
      )}
      <button
        type="button"
        className="text-left text-sm text-stamp"
        onClick={() => {
          if (!jsonMode) {
            setNote(null)
            onChange({ input: toJson(input), output: toJson(output) })
            return
          }
          const nextInput = toFields(input)
          const nextOutput = toFields(output)
          if (!nextInput || !nextOutput) {
            setNote("这份 Schema 拆不成单项，继续用 JSON 写。")
            return
          }
          setNote(null)
          onChange({ input: nextInput, output: nextOutput })
        }}
      >
        {jsonMode ? "改用表单填写" : "改用 JSON Schema"}
      </button>
      {note ? <p className="text-sm text-stamp">{note}</p> : null}
    </div>
  )
}
