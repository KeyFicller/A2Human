"use client"

import { useState, type ChangeEvent, type KeyboardEvent } from "react"
import { useLocale } from "@/components/locale-provider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { acceptIntegerDraft, controlSpec, imageFromDataUrl } from "@/lib/field-control"
import type { FieldType } from "@/lib/schema-fields"
import type { TaskImage } from "@/lib/types"

export function FieldControl({
  type,
  name,
  longString,
  value,
  onChange,
  onImage,
  onImageError,
  ariaLabel,
  blank,
  compact,
  preview,
}: {
  type: FieldType
  name?: string
  longString?: boolean
  value?: string
  onChange?: (value: string) => void
  onImage?: (image: TaskImage | null) => void
  onImageError?: (message: string) => void
  ariaLabel?: string
  blank?: string
  compact?: boolean
  preview?: boolean
}) {
  const { t } = useLocale()
  const spec = controlSpec(type, { name, longString })
  const [local, setLocal] = useState("")
  const [imageError, setImageError] = useState("")
  const text = onChange ? (value ?? "") : local
  const spaced = compact ? "mt-1" : "mt-1.5"
  const height = compact ? "h-8" : "h-10"

  function setText(next: string) {
    if (spec.kind === "integer" && !acceptIntegerDraft(next)) return
    if (onChange) onChange(next)
    else setLocal(next)
  }

  function reportImage(message: string) {
    if (onImageError) onImageError(message)
    else setImageError(message)
  }

  function keepEnter(event: KeyboardEvent) {
    if (preview && event.key === "Enter") event.preventDefault()
  }

  if (spec.kind === "textarea") {
    return (
      <Textarea
        data-field-control="textarea"
        className={spaced}
        value={text}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
      />
    )
  }

  if (spec.kind === "boolean") {
    return (
      <select
        data-field-control="boolean"
        className={`${spaced} ${height} w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground`}
        value={text}
        aria-label={ariaLabel}
        autoComplete="off"
        onKeyDown={keepEnter}
        onChange={(event) => setText(event.target.value)}
      >
        <option value="">{blank ?? t.output.choose}</option>
        <option value="true">{t.output.yes}</option>
        <option value="false">{t.output.no}</option>
      </select>
    )
  }

  if (spec.kind === "image") {
    return (
      <div>
        <input
          data-field-control="image"
          className={`${spaced} block text-sm`}
          type="file"
          accept={spec.accept}
          aria-label={ariaLabel}
          onChange={(event) => {
            const input = event.target
            const file = input.files?.[0]
            if (!file) {
              onImage?.(null)
              reportImage("")
              return
            }
            if (file.size > spec.maxBytes) {
              input.value = ""
              onImage?.(null)
              reportImage(t.task.imageTooBig)
              return
            }
            const reader = new FileReader()
            reader.onload = () => {
              if (input.files?.[0] !== file) return
              const result = typeof reader.result === "string" ? reader.result : ""
              const parsed = imageFromDataUrl(result, file.name, file.size)
              if ("error" in parsed) {
                input.value = ""
                onImage?.(null)
                reportImage(parsed.error === "tooBig" ? t.task.imageTooBig : t.task.imageType)
                return
              }
              onImage?.(parsed.image)
              reportImage("")
            }
            reader.readAsDataURL(file)
          }}
        />
        {imageError ? <p className="mt-1 text-sm text-stamp">{imageError}</p> : null}
      </div>
    )
  }

  return (
    <Input
      data-field-control={spec.kind}
      className={`${spaced} ${height}`}
      type={spec.kind === "text" ? "text" : "number"}
      step={spec.kind === "text" ? undefined : spec.step}
      inputMode={spec.inputMode}
      value={text}
      aria-label={ariaLabel}
      autoComplete="off"
      onKeyDown={keepEnter}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value
        const rejected = spec.kind === "integer" && (!acceptIntegerDraft(next) || (next === "" && event.target.validity.badInput))
        if (rejected) {
          event.target.value = text
          return
        }
        setText(next)
      }}
    />
  )
}
