"use client"

import { useState } from "react"
import { FieldControl } from "@/components/field-control"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { parseFieldValue } from "@/lib/field-control"
import { fieldTypeLabel, outputShape } from "@/lib/schema-fields"
import type { JsonSchema, TaskImage } from "@/lib/types"

export function OutputForm({
  schema,
  pending,
  onSubmit,
  onError,
  submitLabel,
}: {
  schema: JsonSchema
  pending: boolean
  onSubmit: (text: string, image: TaskImage | null) => void
  onError: (message: string) => void
  submitLabel?: string
}) {
  const shape = outputShape(schema)
  const { locale, t } = useLocale()
  const [values, setValues] = useState<Record<string, string>>({})
  const [json, setJson] = useState("")
  const [image, setImage] = useState<TaskImage | null>(null)

  function fileInput(label: string) {
    return (
      <div className="block text-sm">
        {label}
        <FieldControl type="image" ariaLabel={label} onImage={setImage} onImageError={onError} />
      </div>
    )
  }

  function submit(text: string) {
    onError("")
    onSubmit(text, image)
  }

  if (shape.kind === "image") {
    return (
      <div className="space-y-3">
        {fileInput(t.output.image)}
        <Button type="button" disabled={pending} onClick={() => submit("")}>
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
            onChange={(next) => setValues({ value: next })}
          />
        </div>
        <Button
          type="button"
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
        <Textarea value={json} onChange={(event) => setJson(event.target.value)} placeholder={t.output.jsonPlaceholder} />
        <Button type="button" disabled={pending} onClick={() => submit(json)}>
          {pending ? t.output.submitting : submitLabel || t.output.submit}
        </Button>
      </div>
    )
  }

  const images = shape.fields.filter((field) => field.type === "image")
  const dataFields = shape.fields.filter((field) => field.type !== "image")

  return (
    <div className="space-y-3">
      {images.length > 1 ? <p className="text-sm text-stamp">{t.output.oneImage}</p> : null}
      {dataFields.map((field) => (
        <div key={field.name} className="block text-sm">
          {field.name}
          <span className="ml-2 text-xs text-muted-foreground">
            {fieldTypeLabel(field.type, locale)}
            {field.required ? t.output.requiredSuffix : ""}
            {field.description ? `${t.output.noteColon}${field.description}` : ""}
          </span>
          <FieldControl
            type={field.type}
            name={field.name}
            choices={field.enum}
            choiceName={field.name}
            value={values[field.name] ?? ""}
            blank={field.required ? t.output.choose : t.output.skip}
            ariaLabel={field.name}
            onChange={(next) => setValues({ ...values, [field.name]: next })}
          />
        </div>
      ))}
      {images.length === 1 ? fileInput(images[0].name) : null}
      <Button
        type="button"
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
          submit(JSON.stringify(data))
        }}
      >
        {pending ? t.output.submitting : submitLabel || t.output.submit}
      </Button>
    </div>
  )
}
