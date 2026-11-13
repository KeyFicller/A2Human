"use client"

import { memo, useEffect, useState } from "react"
import { OutputForm } from "@/components/output-form"
import { useLocale } from "@/components/locale-provider"
import { localizeError } from "@/lib/copy"
import { fieldTypeLabel, outputShape, schemaPayload, canonicalOutput } from "@/lib/schema-fields"
import { activePlay, deliveryOf, fieldPill, playHintKey, previewFields, usesTimedBoard, usesTimedMic, type PlayMode } from "@/lib/publish-skills"
import type { SchemaDraft } from "@/lib/schema-fields"
import type { Messages } from "@/lib/messages"
import type { JsonSchema, TaskImage } from "@/lib/types"

export type PreviewSkill = {
  title: string
  name: string
  description: string
  sample: string
  play?: string | null
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
  const board = delivery !== "custom" && usesTimedBoard(skill.name, delivery, skill.play)
  const mic = delivery !== "custom" && usesTimedMic(skill.name, delivery, skill.play)
  const schemaKey = JSON.stringify(schema)

  useEffect(() => {
    setNotice(null)
  }, [schemaKey])

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
        submitVariant="outline"
        hint={play ? t.output[playHintKey(play)] : undefined}
        board={board}
        mic={mic}
        onDirty={() => setNotice(null)}
        onError={(message) => setNotice(message || null)}
        onSubmit={(text, picture: TaskImage | null, audio) => {
          try {
            canonicalOutput(schema, text, Boolean(picture), Boolean(audio))
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

function deliveryLabel(kind: ReturnType<typeof deliveryOf>, t: Messages["publish"]) {
  if (kind === "text") return t.deliverText
  if (kind === "image") return t.deliverImage
  if (kind === "image_text") return t.deliverBoth
  if (kind === "audio") return t.deliverAudio
  if (kind === "audio_text") return t.deliverAudioText
  return t.deliverCustom
}

/** The skill as a calling Agent reads it: who answers, what it is, what comes back. */
function AgentCard({ skill, schema, personName }: { skill: PreviewSkill; schema: JsonSchema | null; personName: string }) {
  const { locale, t } = useLocale()
  const shown = previewFields(skill)
  const delivery = schema ? deliveryOf(schema) : "custom"
  const timed = delivery !== "custom" && usesTimedBoard(skill.name, delivery, skill.play)
  const mic = delivery !== "custom" && usesTimedMic(skill.name, delivery, skill.play)
  const inputFields = skill.input.mode === "fields" ? skill.input.fields.filter((field) => field.name.trim() || field.description?.trim()) : []
  const person = personName.trim()

  return (
    <article className="mt-5 rounded-2xl border border-[#d9d0c0] bg-[#fffdf8] p-5 shadow-[3px_3px_0_#ead9c0]">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.18em] text-stamp">{t.publish.cardMark}</p>
        {skill.name ? <p className="truncate font-mono text-[11px] text-muted-foreground">{skill.name}</p> : null}
      </div>
      {shown.title ? <h3 className="mt-3 font-serif text-3xl leading-tight">{shown.title}</h3> : <p className="mt-3 text-sm text-muted-foreground">{t.publish.previewNoName}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{person ? t.publish.cardBy(person) : t.publish.cardNoPerson}</p>
      {shown.description ? (
        <p className="mt-4 font-serif text-lg leading-8">{shown.description}</p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t.publish.previewNoCall}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-stamp px-3 py-1 text-xs text-[#fbf7ee]">{t.publish.delivers(deliveryLabel(delivery, t.publish))}</span>
        {timed ? <span className="rounded-full border border-stamp px-3 py-1 text-xs text-stamp">{t.publish.timedDraw}</span> : null}
        {mic ? <span className="rounded-full border border-stamp px-3 py-1 text-xs text-stamp">{t.publish.timedMic}</span> : null}
      </div>
      {inputFields.length ? (
        <div className="mt-4 border-t border-dashed border-[#e4d8c4] pt-3">
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">{t.publish.cardInputs}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {inputFields.map((field, index) => (
              <span key={`${field.name}-${index}`} className="rounded-full border border-[#d9d0c0] px-2.5 py-0.5 text-xs text-muted-foreground">
                {fieldPill(field, fieldTypeLabel(field.type, locale), field.required ? t.publish.pillRequired : t.publish.pillOptional)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

export const SkillPreview = memo(function SkillPreview({
  skill,
  resetKey,
  personName = "",
}: {
  skill: PreviewSkill | null
  resetKey?: string
  personName?: string
}) {
  const { locale, t } = useLocale()
  const [tab, setTab] = useState<"agent" | "worker">("agent")
  const schema = skill ? readSchema(skill.output) : null
  const play = skill && schema ? activePlay(skill.name, deliveryOf(schema), skill.play) : null
  // A fresh blank (write-your-own) slot has nothing to show yet. One line beats a card full of "not yet" placeholders.
  const shown = previewFields(skill)
  const blank = Boolean(skill) && !shown.title && !shown.description && !shown.task

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
      {blank ? (
        <p className="mt-5 rounded-2xl border border-dashed border-[#d9d0c0] px-5 py-8 text-center text-sm leading-6 text-muted-foreground">{t.publish.previewBlank}</p>
      ) : null}
      {skill && !blank && tab === "agent" ? <AgentCard skill={skill} schema={schema} personName={personName} /> : null}
      {skill && !blank && schema && tab === "worker" ? <WorkerCheck key={resetKey ?? schemaPayload(skill.output)} skill={skill} schema={schema} play={play} /> : null}
      {skill && !blank && !schema && tab === "worker" ? <p className="mt-6 text-sm text-muted-foreground">{t.publish.outputUnread}</p> : null}
      <p className="mt-6 text-xs leading-5 text-muted-foreground">{t.publish.deliveryHint}</p>
    </aside>
  )
})

export function deliveryKindOf(draft: SchemaDraft) {
  return deliveryOf(readSchema(draft) ?? undefined)
}
