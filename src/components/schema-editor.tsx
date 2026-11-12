"use client"

import { useState } from "react"
import { useLocale } from "@/components/locale-provider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatEnum, parseEnumText } from "@/lib/field-control"
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
  const { locale, t } = useLocale()
  const [enumText, setEnumText] = useState<Record<number, string>>({})
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const needsChoices = (type: SchemaField["type"]) => type === "string" || type === "integer" || type === "number"
  function updateField(index: number, patch: Partial<SchemaField>) {
    onChange({
      ...draft,
      fields: draft.fields.map((field, item) => (item === index ? { ...field, ...patch } : field)),
    })
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm">{label}</h3>
        <button
          type="button"
          className="text-sm text-action"
          onClick={() => onChange({ ...draft, fields: [...draft.fields, { name: "", type: "string", required: true }] })}
        >
          {t.schema.addField}
        </button>
      </div>
      <div className="ml-1 space-y-3 border-l border-[#d9d0c0] pl-4">
        {draft.fields.length === 0 ? <p className="text-sm text-muted-foreground">{t.schema.emptyFields}</p> : null}
        {draft.fields.map((field, index) => (
          <div key={index} className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto_auto] sm:items-end">
              <label className="block text-xs text-muted-foreground">
                {t.schema.name}
                <Input
                  className="mt-1"
                  value={field.name}
                  maxLength={40}
                  placeholder={t.schema.namePlaceholder}
                  aria-label={t.schema.ariaName(label)}
                  onChange={(event) => updateField(index, { name: event.target.value })}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                {t.schema.type}
                <select
                  className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
                  value={field.type}
                  aria-label={t.schema.ariaType(label)}
                  onChange={(event) => {
                    const type = event.target.value as SchemaField["type"]
                    setEnumText((current) => ({ ...current, [index]: "" }))
                    updateField(index, { type, enum: undefined })
                  }}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {fieldTypeLabel(type, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-8 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => updateField(index, { required: event.target.checked })}
                />
                {t.schema.required}
              </label>
              <button
                type="button"
                className="h-8 text-left text-sm text-action"
                onClick={() => {
                  setEnumText({})
                  setOpen({})
                  onChange({ ...draft, fields: draft.fields.filter((_, item) => item !== index) })
                }}
              >
                {t.schema.remove}
              </button>
            </div>
            <button type="button" className="text-left text-xs text-action" onClick={() => setOpen((current) => ({ ...current, [index]: !current[index] }))}>
              {open[index] ? t.schema.less : t.schema.more}
            </button>
            {open[index] ? (
              <div className="ml-4 space-y-2 border-l border-[#e4dccb] pl-3">
                <label className="block text-xs text-muted-foreground">
                  {t.schema.note}
                  <Input
                    className="mt-1"
                    value={field.description ?? ""}
                    maxLength={120}
                    placeholder={t.schema.notePlaceholder}
                    aria-label={t.schema.ariaNote(label)}
                    onChange={(event) => updateField(index, { description: event.target.value })}
                  />
                </label>
                {field.type !== "image" ? (
                  <label className="block text-xs text-muted-foreground">
                    {t.schema.example}
                    <Input
                      className="mt-1"
                      value={field.example ?? ""}
                      maxLength={120}
                      placeholder={t.schema.examplePlaceholder}
                      aria-label={t.schema.ariaExample(label)}
                      onChange={(event) => updateField(index, { example: event.target.value })}
                    />
                  </label>
                ) : null}
                {needsChoices(field.type) ? (
                  <label className="block text-xs text-muted-foreground">
                    {t.schema.enum}
                    <Textarea
                      className="mt-1"
                      value={enumText[index] ?? formatEnum(field.enum)}
                      placeholder={t.schema.enumPlaceholder}
                      aria-label={t.schema.ariaEnum(label)}
                      onChange={(event) => {
                        const next = event.target.value
                        setEnumText((current) => ({ ...current, [index]: next }))
                        const parsed = parseEnumText(next, field.type as "string" | "integer" | "number")
                        updateField(index, { enum: parsed.ok && parsed.values.length ? parsed.values : undefined })
                      }}
                    />
                    {enumText[index]?.trim() && !parseEnumText(enumText[index] ?? "", field.type as "string" | "integer" | "number").ok ? (
                      <p className="mt-1 text-stamp">{t.schema.enumInvalid}</p>
                    ) : null}
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
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
  const { t } = useLocale()
  const [note, setNote] = useState<string | null>(null)
  const jsonMode = input.mode === "json" || output.mode === "json"

  return (
    <div className="grid gap-5 rounded-xl bg-[#f7f1e4] p-3">
      {jsonMode ? (
        <>
          <label className="block text-sm">
            {t.schema.inputJson}
            <Textarea
              className="mt-1.5 font-mono text-xs"
              value={input.json}
              placeholder='{"type":"object","properties":{}}'
              onChange={(event) => onChange({ input: { ...input, json: event.target.value }, output })}
            />
          </label>
          <label className="block text-sm">
            {t.schema.outputJson}
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
          <p className="text-xs leading-5 text-muted-foreground">{t.schema.identifierHint}</p>
          <FieldList label={t.schema.input} draft={input} onChange={(next) => onChange({ input: next, output })} />
          <FieldList label={t.schema.output} draft={output} onChange={(next) => onChange({ input, output: next })} />
        </>
      )}
      <button
        type="button"
        className="text-left text-sm text-action"
        onClick={() => {
          if (!jsonMode) {
            setNote(null)
            onChange({ input: toJson(input), output: toJson(output) })
            return
          }
          const nextInput = toFields(input)
          const nextOutput = toFields(output)
          if (!nextInput || !nextOutput) {
            setNote(t.schema.cannotSplit)
            return
          }
          setNote(null)
          onChange({ input: nextInput, output: nextOutput })
        }}
      >
        {jsonMode ? t.schema.useForm : t.schema.useJson}
      </button>
      {note ? <p className="text-sm text-stamp">{note}</p> : null}
    </div>
  )
}
