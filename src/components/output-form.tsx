"use client"

import { useEffect, useRef, useState } from "react"
import { DrawBoard } from "@/components/draw-board"
import { MicBoard } from "@/components/mic-board"
import { FieldControl } from "@/components/field-control"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { phrase } from "@/lib/copy"
import { parseFieldValue } from "@/lib/field-control"
import { fieldTypeLabel, outputShape, type SchemaField } from "@/lib/schema-fields"
import type { JsonSchema, TaskAudio, TaskImage } from "@/lib/types"

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
  mic,
  submitVariant = "default",
}: {
  schema: JsonSchema
  pending: boolean
  onSubmit: (text: string, image: TaskImage | null, audio: TaskAudio | null) => void
  onError: (message: string) => void
  onDirty?: () => void
  submitLabel?: string
  hint?: string
  board?: boolean
  mic?: boolean
  submitVariant?: "default" | "outline"
}) {
  const shape = outputShape(schema)
  const { locale, t } = useLocale()
  const [values, setValues] = useState<Record<string, string>>({})
  const [json, setJson] = useState("")
  const imageRef = useRef<TaskImage | null>(null)
  const audioRef = useRef<TaskAudio | null>(null)
  const shapeKey = JSON.stringify(schema)

  useEffect(() => {
    const next = outputShape(JSON.parse(shapeKey) as JsonSchema)
    const wantsImage = next.kind === "image" || (next.kind === "fields" && next.fields.some((field) => field.type === "image"))
    const wantsAudio = next.kind === "audio" || (next.kind === "fields" && next.fields.some((field) => field.type === "audio"))
    if (!wantsImage) imageRef.current = null
    if (!wantsAudio) audioRef.current = null
  }, [shapeKey])

  function takeImage(next: TaskImage | null) {
    imageRef.current = next
    onDirty?.()
  }

  function fileInput(label: string, optional = false) {
    return (
      <div className="block text-sm">
        {label}
        {optional ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {fieldTypeLabel("image", locale)}
            {phrase("schema.optionalMark", undefined, locale)}
          </span>
        ) : null}
        <FieldControl type="image" ariaLabel={label} onImage={takeImage} onImageError={onError} />
      </div>
    )
  }

  function takeAudio(next: TaskAudio | null) {
    audioRef.current = next
    onDirty?.()
  }

  function submit(text: string) {
    onError("")
    onSubmit(text, imageRef.current, audioRef.current)
  }

  // The hand-in is the one loud button on a live job; the publish preview keeps it quiet.
  const submitClass = submitVariant === "default" ? "w-full px-6 text-base sm:w-auto" : undefined
  const note = hint ? <p className="text-sm leading-6">{hint}</p> : null

  if (shape.kind === "image") {
    return (
      <div className="space-y-3">
        {note}
        {board ? <DrawBoard onImage={takeImage} /> : fileInput(t.output.image)}
        <Button type="button" variant={submitVariant} size="lg" className={submitClass} disabled={pending} onClick={() => submit("")}>
          {pending ? t.output.submitting : submitLabel || t.output.submit}
        </Button>
      </div>
    )
  }

  if (shape.kind === "audio") {
    return (
      <div className="space-y-3">
        {note}
        <MicBoard limitMs={mic ? 15_000 : undefined} onAudio={takeAudio} />
        <Button type="button" variant={submitVariant} size="lg" className={submitClass} disabled={pending} onClick={() => submit("")}>
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
          size="lg"
          className={submitClass}
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
        <Button type="button" variant={submitVariant} size="lg" className={submitClass} disabled={pending} onClick={() => submit(json)}>
          {pending ? t.output.submitting : submitLabel || t.output.submit}
        </Button>
      </div>
    )
  }

  const images = shape.fields.filter((field) => field.type === "image")
  const audios = shape.fields.filter((field) => field.type === "audio")
  const dataFields = shape.fields.filter((field) => field.type !== "image" && field.type !== "audio")

  const imageOnly = dataFields.length === 0 && images.length === 1

  return (
    <div className="space-y-3">
      {note}
      {images.length > 1 ? <p className="text-sm text-stamp">{t.output.oneImage}</p> : null}
      {audios.length > 1 ? <p className="text-sm text-stamp">{t.output.oneAudio}</p> : null}
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
      {images.length === 1 ? (board && imageOnly ? <DrawBoard onImage={takeImage} /> : fileInput(fieldLabel(images[0]), !images[0].required)) : null}
      {audios.length === 1 ? <MicBoard limitMs={mic ? 15_000 : undefined} onAudio={takeAudio} /> : null}
      <Button
        type="button"
        variant={submitVariant}
        size="lg"
        className={submitClass}
        disabled={pending || images.length > 1 || audios.length > 1}
        onClick={() => {
          const data: Record<string, unknown> = {}
          for (const field of dataFields) {
            if (field.type !== "string" && field.type !== "integer" && field.type !== "number" && field.type !== "boolean") continue
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
