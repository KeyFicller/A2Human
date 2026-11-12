"use client"

import { useState } from "react"
import { OutputForm } from "@/components/output-form"
import { useLocale } from "@/components/locale-provider"
import { localizeError } from "@/lib/copy"
import { fieldTypeLabel, outputShape, schemaPayload, canonicalOutput } from "@/lib/schema-fields"
import { activePlay, deliveryOf, fieldPill, playHintKey, previewFields, usesTimedBoard, type PlayMode } from "@/lib/publish-skills"
import type { SchemaDraft } from "@/lib/schema-fields"
import type { JsonSchema, TaskImage } from "@/lib/types"

export type PreviewSkill = {
  title: string
  name: string
  description: string
  sample: string
  input: SchemaDraft
  output: SchemaDraft
}

function readSchema(draft: SchemaDraft): JsonSchema | null {
  const text = schemaPayload(draft)
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed as JsonSchema
  } catch {
    return null
  }
}

function showsImage(schema: JsonSchema) {
  const shape = outputShape(schema)
  if (shape.kind === "image") return true
  return shape.kind === "fields" && shape.fields.some((field) => field.type === "image")
}

function capsule(selected: boolean) {
  return selected
    ? "rounded-full bg-ink px-3 py-1 text-sm text-[#fbf7ee]"
    : "rounded-full border border-[#d9d0c0] px-3 py-1 text-sm"
}

function WorkerCheck({ skill, schema, play }: { skill: PreviewSkill; schema: JsonSchema; play: PlayMode | null }) {
  const { locale, t } = useLocale()
  const [notice, setNotice] = useState<string | null>(null)
  const shown = previewFields(skill)
  const image = showsImage(schema)
  const delivery = deliveryOf(schema)
  const board = delivery !== "custom" && usesTimedBoard(skill.name, delivery)

  return (
    <div className="mt-6 space-y-4">
      <p className="inline-flex rounded-full bg-[#f3e6c8] px-2 py-0.5 font-mono text-[11px] tracking-[0.08em] text-stamp">{t.publish.workerMark}</p>
      {shown.title ? <h3 className="font-serif text-3xl">{shown.title}</h3> : <p className="text-sm text-muted-foreground">{t.publish.previewNoName}</p>}
      {shown.description ? <p className="text-sm leading-6">{shown.description}</p> : null}
      {shown.task ? (
        <p className="whitespace-pre-wrap leading-7">{shown.task}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t.publish.previewNoTask}</p>
      )}
      {image && !board ? <p className="text-xs leading-5 text-muted-foreground">{t.publish.localOnly}</p> : null}
      <OutputForm
        schema={schema}
        pending={false}
        submitLabel={t.publish.simulate}
        hint={play ? t.output[playHintKey(play)] : undefined}
        board={board}
        onDirty={() => setNotice(null)}
        onError={(message) => setNotice(message || null)}
        onSubmit={(text, picture: TaskImage | null) => {
          try {
            canonicalOutput(schema, text, Boolean(picture))
            setNotice(t.publish.simulateOk)
          } catch (caught) {
            const message = caught instanceof Error ? caught.message : t.publish.saveError
            setNotice(localizeError(message, locale))
          }
        }}
      />
      {notice ? <p className="whitespace-pre-wrap text-sm leading-6">{notice}</p> : null}
    </div>
  )
}

export function SkillPreview({ skill, resetKey }: { skill: PreviewSkill | null; resetKey?: string }) {
  const { locale, t } = useLocale()
  const [tab, setTab] = useState<"agent" | "worker">("worker")
  const schema = skill ? readSchema(skill.output) : null
  const shown = previewFields(skill)
  const inputFields = skill?.input.mode === "fields" ? skill.input.fields.filter((field) => field.name.trim() || field.description?.trim()) : []
  const play = skill && schema ? activePlay(skill.name, deliveryOf(schema)) : null

  return (
    <aside className="sheet p-5 lg:sticky lg:top-24">
      <h2 className="font-serif text-2xl">{t.publish.previewTitle}</h2>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "agent"} className={capsule(tab === "agent")} onClick={() => setTab("agent")}>
          {t.publish.previewAgent}
        </button>
        <button type="button" role="tab" aria-selected={tab === "worker"} className={capsule(tab === "worker")} onClick={() => setTab("worker")}>
          {t.publish.previewWorker}
        </button>
      </div>
      {!skill ? <p className="mt-6 text-sm leading-6 text-muted-foreground">{t.publish.noPreview}</p> : null}
      {skill && tab === "agent" ? (
        <div className="mt-6 space-y-3">
          <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">{t.publish.agentSees}</p>
          {shown.title ? <h3 className="font-serif text-3xl">{shown.title}</h3> : <p className="text-sm text-muted-foreground">{t.publish.previewNoName}</p>}
          {shown.description ? <p className="text-sm leading-6">{shown.description}</p> : <p className="text-sm text-muted-foreground">{t.publish.previewNoCall}</p>}
          {skill.name ? <p className="font-mono text-xs text-muted-foreground">{skill.name}</p> : null}
          {inputFields.length ? (
            <div className="flex flex-wrap gap-2">
              {inputFields.map((field, index) => (
                <span key={`${field.name}-${index}`} className="rounded-full border border-[#d9d0c0] px-3 py-1 text-xs">
                  {fieldPill(field, fieldTypeLabel(field.type, locale), field.required ? t.publish.pillRequired : t.publish.pillOptional)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {skill && schema && tab === "worker" ? <WorkerCheck key={resetKey ?? schemaPayload(skill.output)} skill={skill} schema={schema} play={play} /> : null}
      {skill && !schema && tab === "worker" ? <p className="mt-6 text-sm text-muted-foreground">{t.publish.outputUnread}</p> : null}
      <p className="mt-6 text-xs leading-5 text-muted-foreground">{t.publish.deliveryHint}</p>
    </aside>
  )
}

export function deliveryKindOf(draft: SchemaDraft) {
  return deliveryOf(readSchema(draft) ?? undefined)
}
