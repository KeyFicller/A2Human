"use client"

import { useEffect, useRef, useState } from "react"
import { DrawBoard } from "@/components/draw-board"
import { FieldControl } from "@/components/field-control"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { parseFieldValue } from "@/lib/field-control"
import { fieldTypeLabel, outputShape, type SchemaField } from "@/lib/schema-fields"
import type { JsonSchema, TaskImage } from "@/lib/types"

function fieldLabel(field: SchemaField) {
  return field.description?.trim() || field.name
}

export function OutputForm({
  schema,
  pending,
  onSubmit,
  onError,
  onDirty,
  submitLabel,
  hint,
  board,
  submitVariant = "default",
}: {
  schema: JsonSchema
  pending: boolean
  onSubmit: (text: string, image: TaskImage | null) => void
  onError: (message: string) => void
  onDirty?: () => void
  submitLabel?: string
  hint?: string
  board?: boolean
  submitVariant?: "default" | "outline"
}) {
  const shape = outputShape(schema)
  const { locale, t } = useLocale()
  const [values, setValues] = useState<Record<string, string>>({})
  const [json, setJson] = useState("")
  const imageRef = useRef<TaskImage | null>(null)
  const shapeKey = JSON.stringify(schema)

  useEffect(() => {
    const next = outputShape(JSON.parse(shapeKey) as JsonSchema)
    const wantsImage = next.kind === "image" || (next.kind === "fields" && next.fields.some((field) => field.type === "image"))
    if (!wantsImage) imageRef.current = null
  }, [shapeKey])

  function takeImage(next: TaskImage | null) {
    imageRef.current = next
    onDirty?.()
  }

  function fileInput(label: string) {
    return (
      <div className="block text-sm">
        {label}
        <FieldControl type="image" ariaLabel={label} onImage={takeImage} onImageError={onError} />
      </div>
    )
  }

  function submit(text: string) {
    onError("")
    onSubmit(text, imageRef.current)
  }

  const note = hint ? <p className="text-sm leading-6">{hint}</p> : null

  if (shape.kind === "image") {
    return (
      <div className="space-y-3">
        {note}
        {board ? <DrawBoard onImage={takeImage} /> : fileInput(t.output.image)}
        <Button type="button" variant={submitVariant} disabled={pending} onClick={() => submit("")}>
          {pending ? t.output.submitting : submitLabel || t.output.submit}
        </Button>
      </div>
    )
  }

  if (shape.kind === "value") {
    const label = fieldTypeLabel(shape.type, locale)
    return (
      <div className="space-y-3">
        <div className="block text-sm">
          {label}
          <FieldControl
            type={shape.type}
            longString={shape.type === "string"}
            choices={shape.enum}
            choiceName="value"
            value={values.value ?? ""}
            blank={t.output.choose}
            ariaLabel={label}
            onChange={(next) => {
              onDirty?.()
              setValues({ value: next })
            }}
          />
        </div>
        <Button
          type="button"
          variant={submitVariant}
          disabled={pending}
          onClick={() => {
            const parsed = parseFieldValue(shape.type, values.value ?? "", shape.enum)
            if (parsed.state === "empty") {
              onError(t.output.mustFill(label))
              return
            }
            if (parsed.state === "bad") {
              onError(t.output.mustBe(label))
              return
            }
            submit(JSON.stringify(parsed.value))
          }}
        >
          {pending ? t.output.submitting : submitLabel || t.output.submit}
        </Button>
      </div>
    )
  }

  if (shape.kind === "json") {
    return (
      <div className="space-y-3">
        <Textarea
          value={json}
          onChange={(event) => {
            onDirty?.()
            setJson(event.target.value)
          }}
          placeholder={t.output.jsonPlaceholder}
        />
        <Button type="button" variant={submitVariant} disabled={pending} onClick={() => submit(json)}>
          {pending ? t.output.submitting : submitLabel || t.output.submit}
        </Button>
      </div>
    )
  }

  const images = shape.fields.filter((field) => field.type === "image")
  const dataFields = shape.fields.filter((field) => field.type !== "image")

  const imageOnly = dataFields.length === 0 && images.length === 1

  return (
    <div className="space-y-3">
      {note}
      {images.length > 1 ? <p className="text-sm text-stamp">{t.output.oneImage}</p> : null}
      {dataFields.map((field) => {
        const label = fieldLabel(field)
        return (
          <div key={field.name} className="block text-sm">
            {label}
            <span className="ml-2 text-xs text-muted-foreground">
              {fieldTypeLabel(field.type, locale)}
              {field.required ? t.output.requiredSuffix : ""}
            </span>
            <FieldControl
              type={field.type}
              name={field.name}
              choices={field.enum}
              choiceName={field.name}
              value={values[field.name] ?? ""}
              blank={field.required ? t.output.choose : t.output.skip}
              ariaLabel={label}
              onChange={(next) => {
                onDirty?.()
                setValues({ ...values, [field.name]: next })
              }}
            />
          </div>
        )
      })}
      {images.length === 1 ? (board && imageOnly ? <DrawBoard onImage={takeImage} /> : fileInput(fieldLabel(images[0]))) : null}
      <Button
        type="button"
        variant={submitVariant}
        disabled={pending || images.length > 1}
        onClick={() => {
          const data: Record<string, unknown> = {}
          for (const field of dataFields) {
            if (field.type === "image") continue
            const parsed = parseFieldValue(field.type, values[field.name] ?? "", field.enum)
            if (parsed.state === "empty") continue
            if (parsed.state === "bad") {
              onError(t.output.fieldMustBe(field.name, fieldTypeLabel(field.type, locale)))
              return
            }
            data[field.name] = parsed.value
          }
          submit(dataFields.length === 0 ? "" : JSON.stringify(data))
        }}
      >
        {pending ? t.output.submitting : submitLabel || t.output.submit}
      </Button>
    </div>
  )
}
