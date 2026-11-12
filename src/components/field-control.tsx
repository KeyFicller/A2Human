"use client"

import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { useLocale } from "@/components/locale-provider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MicBoard } from "@/components/mic-board"
import { acceptIntegerDraft, controlSpec, imageFromDataUrl, type EnumValue } from "@/lib/field-control"
import type { FieldType } from "@/lib/schema-fields"
import type { TaskAudio, TaskImage } from "@/lib/types"

export function FieldControl({
  type,
  name,
  longString,
  choices,
  value,
  onChange,
  onImage,
  onAudio,
  onImageError,
  ariaLabel,
  blank,
  choiceName,
}: {
  type: FieldType
  name?: string
  longString?: boolean
  choices?: EnumValue[]
  value?: string
  onChange?: (value: string) => void
  onImage?: (image: TaskImage | null) => void
  onAudio?: (audio: TaskAudio | null) => void
  onImageError?: (message: string) => void
  ariaLabel?: string
  blank?: string
  choiceName?: string
}) {
  const { t } = useLocale()
  const spec = controlSpec(type, { name, longString, enum: choices })
  const [local, setLocal] = useState("")
  const [imageError, setImageError] = useState("")
  const [over, setOver] = useState(false)
  const [picture, setPicture] = useState<{ url: string; name: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const readTicket = useRef(0)
  const text = onChange ? (value ?? "") : local

  function setText(next: string) {
    if (spec.kind === "integer" && !acceptIntegerDraft(next)) return
    if (onChange) onChange(next)
    else setLocal(next)
  }

  function reportImage(message: string) {
    if (onImageError) onImageError(message)
    else setImageError(message)
  }

  function clearImage() {
    readTicket.current += 1
    setPicture(null)
    onImage?.(null)
    reportImage("")
    if (fileRef.current) fileRef.current.value = ""
  }

  function takeFile(file: File | undefined) {
    if (!file || spec.kind !== "image") {
      clearImage()
      return
    }
    if (file.size > spec.maxBytes) {
      clearImage()
      reportImage(t.task.imageTooBig)
      return
    }
    const ticket = ++readTicket.current
    const reader = new FileReader()
    reader.onload = () => {
      if (readTicket.current !== ticket) return
      const result = typeof reader.result === "string" ? reader.result : ""
      const parsed = imageFromDataUrl(result, file.name, file.size)
      if ("error" in parsed) {
        clearImage()
        reportImage(parsed.error === "tooBig" ? t.task.imageTooBig : t.task.imageType)
        return
      }
      setPicture({ url: `data:${parsed.image.mediaType};base64,${parsed.image.raw}`, name: file.name })
      onImage?.(parsed.image)
      reportImage("")
    }
    reader.readAsDataURL(file)
  }

  if (spec.kind === "textarea") {
    return (
      <Textarea
        data-field-control="textarea"
        className="mt-1.5"
        value={text}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
      />
    )
  }

  if (spec.kind === "boolean") {
    const checked = text === "true"
    return (
      <label className="mt-1.5 flex items-center gap-2 text-sm text-foreground">
        <input
          data-field-control="checkbox"
          type="checkbox"
          checked={checked}
          aria-label={ariaLabel}
          onChange={(event) => setText(event.target.checked ? "true" : "false")}
        />
        {checked ? t.output.yes : t.output.no}
      </label>
    )
  }

  if (spec.kind === "enum" && spec.widget === "radio") {
    const group = choiceName || ariaLabel || "choice"
    return (
      <fieldset data-field-control="radio" className="mt-1.5 space-y-1" aria-label={ariaLabel}>
        {spec.options.map((option) => {
          const token = String(option)
          return (
            <label key={token} className="flex items-center gap-2 text-sm text-foreground">
              <input type="radio" name={group} value={token} checked={text === token} onChange={() => setText(token)} />
              {token}
            </label>
          )
        })}
      </fieldset>
    )
  }

  if (spec.kind === "enum") {
    return (
      <select
        data-field-control="select"
        className="mt-1.5 h-10 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
        value={text}
        aria-label={ariaLabel}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
      >
        <option value="">{blank ?? t.output.choose}</option>
        {spec.options.map((option) => {
          const token = String(option)
          return (
            <option key={token} value={token}>
              {token}
            </option>
          )
        })}
      </select>
    )
  }

  if (spec.kind === "image") {
    return (
      <div>
        <div
          data-field-control="image"
          role="button"
          tabIndex={0}
          aria-label={ariaLabel}
          className={`mt-1.5 cursor-pointer rounded-xl border border-dashed px-3 py-4 text-center text-sm ${over ? "border-stamp bg-[#f7f1e4]" : "border-[#d9d0c0]"}`}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              fileRef.current?.click()
            }
          }}
          onDragOver={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault()
            setOver(false)
            const file = event.dataTransfer.files?.[0]
            if (file) takeFile(file)
          }}
        >
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            accept={spec.accept}
            onChange={(event) => takeFile(event.target.files?.[0])}
          />
          {picture ? (
            <>
              {/* Data URLs are not next/image sources. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picture.url} alt={picture.name || t.task.pendingAlt} className="mx-auto max-h-32 rounded-lg object-contain" />
              <p className="mt-2">{picture.name}</p>
            </>
          ) : (
            <p>{t.output.drop}</p>
          )}
        </div>
        {picture ? (
          <button
            type="button"
            className="mt-1 text-sm text-action"
            onClick={clearImage}
          >
            {t.output.clear}
          </button>
        ) : null}
        {imageError ? <p className="mt-1 text-sm text-stamp">{imageError}</p> : null}
      </div>
    )
  }

  if (spec.kind === "audio") {
    return <MicBoard onAudio={(audio) => onAudio?.(audio)} />
  }

  return (
    <Input
      data-field-control={spec.kind}
      className="mt-1.5 h-10"
      type={spec.kind === "text" ? "text" : "number"}
      step={spec.kind === "text" ? undefined : spec.step}
      inputMode={spec.inputMode}
      value={text}
      aria-label={ariaLabel}
      autoComplete="off"
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
