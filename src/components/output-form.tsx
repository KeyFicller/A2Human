"use client"

import { useState } from "react"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { fieldTypeLabel, outputShape } from "@/lib/schema-fields"
import type { JsonSchema, TaskImage } from "@/lib/types"

function readFile(
  file: File,
  onImage: (image: TaskImage | null) => void,
  onError: (message: string) => void,
  tooBig: string,
  wrongType: string,
) {
  if (file.size > 1_000_000) {
    onImage(null)
    onError(tooBig)
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const result = typeof reader.result === "string" ? reader.result : ""
    const matched = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(result)
    if (!matched) {
      onImage(null)
      onError(wrongType)
      return
    }
    onImage({ mediaType: matched[1] as TaskImage["mediaType"], raw: matched[2].replace(/\s/g, ""), filename: file.name })
    onError("")
  }
  reader.readAsDataURL(file)
}

export function OutputForm({
  schema,
  pending,
  onSubmit,
  onError,
}: {
  schema: JsonSchema
  pending: boolean
  onSubmit: (text: string, image: TaskImage | null) => void
  onError: (message: string) => void
}) {
  const shape = outputShape(schema)
  const { locale, t } = useLocale()
  const [values, setValues] = useState<Record<string, string>>({})
  const [json, setJson] = useState("")
  const [image, setImage] = useState<TaskImage | null>(null)

  function fileInput(label: string) {
    return (
      <label className="block text-sm">
        {label}
        <input
          className="mt-1.5 block text-sm"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) {
              setImage(null)
              return
            }
            readFile(file, setImage, onError, t.task.imageTooBig, t.task.imageType)
          }}
        />
      </label>
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
          {pending ? t.output.submitting : t.output.submit}
        </Button>
      </div>
    )
  }

  if (shape.kind === "value") {
    const label = fieldTypeLabel(shape.type, locale)
    return (
      <div className="space-y-3">
        <label className="block text-sm">
          {label}
          {shape.type === "boolean" ? (
            <select
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={values.value ?? ""}
              onChange={(event) => setValues({ value: event.target.value })}
            >
              <option value="">{t.output.choose}</option>
              <option value="true">{t.output.yes}</option>
              <option value="false">{t.output.no}</option>
            </select>
          ) : (
            <Input
              className="mt-1.5 h-10"
              inputMode={shape.type === "string" ? "text" : "decimal"}
              value={values.value ?? ""}
              onChange={(event) => setValues({ value: event.target.value })}
            />
          )}
        </label>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            const raw = (values.value ?? "").trim()
            if (!raw) {
              onError(t.output.mustFill(label))
              return
            }
            if (shape.type === "boolean") {
              submit(JSON.stringify(raw === "true"))
              return
            }
            if (shape.type === "integer" || shape.type === "number") {
              const number = Number(raw)
              if (!Number.isFinite(number) || (shape.type === "integer" && !Number.isInteger(number))) {
                onError(t.output.mustBe(label))
                return
              }
              submit(JSON.stringify(number))
              return
            }
            submit(JSON.stringify(raw))
          }}
        >
          {pending ? t.output.submitting : t.output.submit}
        </Button>
      </div>
    )
  }

  if (shape.kind === "json") {
    return (
      <div className="space-y-3">
        <Textarea value={json} onChange={(event) => setJson(event.target.value)} placeholder={t.output.jsonPlaceholder} />
        <Button type="button" disabled={pending} onClick={() => submit(json)}>
          {pending ? t.output.submitting : t.output.submit}
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
        <label key={field.name} className="block text-sm">
          {field.name}
          <span className="ml-2 text-xs text-muted-foreground">
            {fieldTypeLabel(field.type, locale)}
            {field.required ? t.output.requiredSuffix : ""}
            {field.description ? `${t.output.noteColon}${field.description}` : ""}
          </span>
          {field.type === "boolean" ? (
            <select
              className="mt-1.5 h-10 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              value={values[field.name] ?? ""}
              onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
            >
              <option value="">{field.required ? t.output.choose : t.output.skip}</option>
              <option value="true">{t.output.yes}</option>
              <option value="false">{t.output.no}</option>
            </select>
          ) : (
            <Input
              className="mt-1.5 h-10"
              inputMode={field.type === "string" ? "text" : "decimal"}
              value={values[field.name] ?? ""}
              onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
            />
          )}
        </label>
      ))}
      {images.length === 1 ? fileInput(images[0].name) : null}
      <Button
        type="button"
        disabled={pending || images.length > 1}
        onClick={() => {
          const data: Record<string, unknown> = {}
          for (const field of dataFields) {
            const raw = (values[field.name] ?? "").trim()
            if (!raw) continue
            if (field.type === "boolean") {
              data[field.name] = raw === "true"
              continue
            }
            if (field.type === "integer" || field.type === "number") {
              const number = Number(raw)
              if (!Number.isFinite(number) || (field.type === "integer" && !Number.isInteger(number))) {
                onError(t.output.fieldMustBe(field.name, fieldTypeLabel(field.type, locale)))
                return
              }
              data[field.name] = number
              continue
            }
            data[field.name] = raw
          }
          submit(JSON.stringify(data))
        }}
      >
        {pending ? t.output.submitting : t.output.submit}
      </Button>
    </div>
  )
}
