"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { useText } from "@/components/locale-provider"
import { SchemaEditor } from "@/components/schema-editor"
import { SkillPreview, deliveryKindOf, type PreviewSkill } from "@/components/skill-preview"
import { ErrorNote, LoadingLine } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, PUBLISHED_KEY, api } from "@/lib/client"
import { localizeError, wire } from "@/lib/copy"
import { go, pagesExport } from "@/lib/paths"
import {
  activePlay,
  addAnotherSlot,
  applyToSlot,
  bioIssue,
  blankIdentity,
  canStartAnother,
  defaultTaskInput,
  deliveryOf,
  deliverySchema,
  editableTitle,
  fieldPill,
  installedLabel,
  isBlankDraft,
  isLockedPreset,
  mergePresetCatalog,
  personNameIssue,
  playMode,
  presetIdentity,
  publishAction,
  publishedSkill,
  workerSessionKey,
  toolIdAfterTitle,
  toolIdProblem,
  type DeliveryKind,
  type SlotIdentity,
} from "@/lib/publish-skills"
import { FIELD_TYPES, draftFromSchema, duplicateFieldName, fieldTypeLabel, schemaPayload, type SchemaDraft, type SchemaField } from "@/lib/schema-fields"
import {
  CUSTOM_SKILL_NAME,
  SKILL_CATALOG,
  catalogNames,
  catalogText,
  localizedPresetSchema,
  type CatalogSkill,
} from "@/lib/skill-catalog"
import type { Agent, Skill } from "@/lib/types"

type SkillKind = "catalog" | "custom" | "legacy"

type SkillDraft = PreviewSkill & {
  input: SchemaDraft
  output: SchemaDraft
  kind: SkillKind
  nameTouched: boolean
  originalName: string
  template: string | null
}

function kindFor(name: string, names: Set<string>, previous: SkillKind): SkillKind {
  if (names.has(name)) return "catalog"
  if (CUSTOM_SKILL_NAME.test(name)) return "custom"
  return previous === "legacy" ? "legacy" : "custom"
}

function draftOf(identity: SlotIdentity, item: CatalogSkill | null, taskLabel: string, names: Set<string>, locale: "zh" | "en" = "zh"): SkillDraft {
  return {
    ...identity,
    input: item ? draftFromSchema(localizedPresetSchema(item, "input", locale)) : { mode: "fields", fields: defaultTaskInput(taskLabel), json: "" },
    output: item ? draftFromSchema(localizedPresetSchema(item, "output", locale)) : draftFromSchema(deliverySchema("text")),
    kind: names.has(identity.name) ? "catalog" : "custom",
    originalName: identity.name,
  }
}

function emptyCustom(taskLabel: string, names: Set<string>): SkillDraft {
  return draftOf(blankIdentity(), null, taskLabel, names)
}

function draftFrom(skill: Skill, names: Set<string>, catalog: CatalogSkill[], locale: "zh" | "en"): SkillDraft {
  const preset = catalog.find((item) => item.name === skill.name)
  if (preset) {
    const copy = catalogText(preset, locale)
    return { ...draftOf(presetIdentity({ ...preset, ...copy }), preset, "", names, locale), originalName: skill.name }
  }
  const kind = kindFor(skill.name, names, CUSTOM_SKILL_NAME.test(skill.name) ? "custom" : "legacy")
  return {
    name: skill.name,
    title: editableTitle(skill.title, skill.name),
    description: skill.description,
    sample: "",
    input: draftFromSchema(skill.inputSchema),
    output: draftFromSchema(skill.outputSchema),
    kind,
    nameTouched: true,
    originalName: skill.name,
    template: null,
  }
}

function capsule(selected: boolean) {
  return selected
    ? "rounded-full bg-ink px-3 py-1 text-sm text-[#fbf7ee]"
    : "rounded-full border border-[#d9d0c0] px-3 py-1 text-sm disabled:opacity-40"
}

export default function PublishPage() {
  const router = useRouter()
  const { agent, ready, signIn, refresh } = useAgent()
  const { locale, t, error: showError } = useText()
  const [catalog, setCatalog] = useState<CatalogSkill[]>(SKILL_CATALOG)
  const [name, setName] = useState<string | null>(null)
  const [bio, setBio] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillDraft[] | null>(null)
  const [focus, setFocus] = useState(0)
  const [advanced, setAdvanced] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [bioError, setBioError] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const nameRef = useRef<HTMLLabelElement>(null)
  const bioRef = useRef<HTMLLabelElement>(null)
  const localeRef = useRef(locale)

  useEffect(() => {
    let cancel = false
    api<{ skills: CatalogSkill[] }>("/api/skill-catalog")
      .then((body) => {
        if (!cancel && Array.isArray(body.skills) && body.skills.length) setCatalog(mergePresetCatalog(body.skills, SKILL_CATALOG))
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    const previous = localeRef.current
    localeRef.current = locale
    if (previous === locale) return
    setSkills((current) => {
      if (!current) return current
      return current.map((skill) => {
        if (!skill.template) return skill
        const item = catalog.find((entry) => entry.name === skill.template)
        if (!item) return skill
        const copy = catalogText(item, locale)
        return { ...draftOf(presetIdentity({ ...item, ...copy }), item, "", catalogNames(catalog), locale), originalName: skill.originalName }
      })
    })
  }, [catalog, locale])

  const names = catalogNames(catalog)
  const editing = Boolean(agent)
  const nameValue = name ?? (editing ? agent?.name ?? "" : "")
  const bioValue = bio ?? (editing ? agent?.bio ?? "" : "")
  const skillValue = skills ?? (editing && agent?.skills.length ? agent.skills.map((skill) => draftFrom(skill, names, catalog, locale)) : [])
  const focusIndex = skillValue.length ? Math.min(focus, skillValue.length - 1) : 0
  const active = skillValue[focusIndex]
  const locked = Boolean(active && isLockedPreset(active, catalog))
  const action = publishAction(Boolean(agent), false)

  if (!ready) return <LoadingLine />

  function updateSkill(index: number, patch: Partial<SkillDraft>) {
    setArmed(false)
    setSkills(
      skillValue.map((skill, item) => {
        if (item !== index) return skill
        const next = { ...skill, ...patch }
        const nameTouched = patch.name !== undefined ? true : skill.nameTouched
        if (patch.title !== undefined) {
          const taken = skillValue.filter((_, other) => other !== index).map((other) => other.name)
          next.name = toolIdAfterTitle(next.title, taken, catalog, nameTouched, patch.name ?? skill.name)
        }
        next.nameTouched = nameTouched
        next.kind = kindFor(next.name, names, skill.kind)
        return next
      }),
    )
  }

  function removeSkill(index: number) {
    const next = skillValue.filter((_, item) => item !== index)
    setSkills(next)
    setFocus((current) => Math.max(0, Math.min(current > index ? current - 1 : current, Math.max(next.length - 1, 0))))
    setAdvanced(false)
  }

  function applyPreset(item: CatalogSkill) {
    const already = skillValue.findIndex((skill) => skill.template === item.name || skill.name === item.name)
    if (already >= 0) {
      setFocus(already)
      setAdvanced(false)
      return
    }
    const index = skillValue.length ? focusIndex : 0
    const copy = catalogText(item, locale)
    const next = draftOf(presetIdentity({ ...item, ...copy }), item, t.publish.taskLabel, names, locale)
    setSkills(applyToSlot(skillValue, index, next))
    setFocus(index)
    setAdvanced(false)
  }

  function writeOwn() {
    const index = skillValue.length ? focusIndex : 0
    setSkills(applyToSlot(skillValue, index, emptyCustom(t.publish.taskLabel, names)))
    setFocus(index)
    setAdvanced(false)
  }

  function addAnother() {
    const next = addAnotherSlot(skillValue, emptyCustom(t.publish.taskLabel, names))
    if (!next) return
    setSkills(next)
    setFocus(next.length - 1)
    setAdvanced(false)
  }

  function setDelivery(kind: DeliveryKind) {
    if (!active) return
    const preset = active.template ? catalog.find((item) => item.name === active.template) : undefined
    const presetKind = preset?.outputSchema ? deliveryOf(preset.outputSchema) : "custom"
    const output = preset && presetKind === kind ? localizedPresetSchema(preset, "output", locale) : deliverySchema(kind)
    updateSkill(focusIndex, { output: draftFromSchema(output) })
  }

  function patchInput(index: number, patch: Partial<SchemaField>) {
    if (!active || active.input.mode !== "fields") return
    updateSkill(focusIndex, {
      input: {
        ...active.input,
        fields: active.input.fields.map((field, item) => (item === index ? { ...field, ...patch, ...(patch.type ? { enum: undefined } : {}) } : field)),
      },
    })
  }

  const delivery = active ? deliveryKindOf(active.output) : "custom"
  // The id follows the name, so an untouched blank slot is not an error yet.
  const toolIssue = active && (active.name || active.title.trim()) ? toolIdProblem(active.name) : null
  const inputFields = active?.input.mode === "fields" ? active.input.fields : []
  const deliveryChoices: Array<[DeliveryKind, string]> = [
    ["text", t.publish.deliverText],
    ["image", t.publish.deliverImage],
    ["image_text", t.publish.deliverBoth],
    ["audio", t.publish.deliverAudio],
    ["audio_text", t.publish.deliverAudioText],
  ]

  return (
    <form
      className="mx-auto max-w-6xl"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        if (personNameIssue(nameValue)) {
          setNameError(localizeError(wire("name.length"), locale))
          setArmed(false)
          const field = nameRef.current?.querySelector("input")
          if (field instanceof HTMLInputElement) field.focus()
          nameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
        setNameError(null)
        if (bioIssue(bioValue, [t.publish.bioPlaceholder, wire("bio.default")])) {
          setBioError(t.publish.needBio)
          setArmed(false)
          const field = bioRef.current?.querySelector("input")
          if (field instanceof HTMLInputElement) field.focus()
          bioRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
        setBioError(null)
        if (skillValue.length < 1) {
          setError(t.publish.needSkill)
          setPending(false)
          return
        }
        // An existing skill that never had a display name can keep saving without one.
        const untitledKept = (skill: SkillDraft) => Boolean(skill.originalName) && skill.name === skill.originalName && !skill.title.trim()
        if (skillValue.some((skill) => (!untitledKept(skill) && ![...skill.title.trim()].length) || [...skill.title.trim()].length > 32)) {
          setError(t.publish.needTitle)
          setPending(false)
          return
        }
        if (skillValue.some((skill) => ![...skill.description.trim()].length || [...skill.description.trim()].length > 320)) {
          setError(t.publish.needDescription)
          setPending(false)
          return
        }
        if (
          skillValue.some((skill) => {
            const folded = skill.name.toLowerCase()
            return catalog.some((item) => item.name.toLowerCase() === folded && item.name !== skill.name)
          })
        ) {
          setError(t.publish.customReserved)
          setPending(false)
          return
        }
        if (
          skillValue.some((skill) => {
            if (names.has(skill.name) || CUSTOM_SKILL_NAME.test(skill.name)) return false
            return !(skill.kind === "legacy" && skill.name === skill.originalName)
          })
        ) {
          setError(t.publish.customInvalid)
          setPending(false)
          return
        }
        if (
          skillValue.some(
            (skill) =>
              (skill.input.mode === "fields" && duplicateFieldName(skill.input.fields)) ||
              (skill.output.mode === "fields" && duplicateFieldName(skill.output.fields)),
          )
        ) {
          setError(t.publish.duplicate)
          setPending(false)
          return
        }
        if (
          skillValue.some((skill) => {
            const inputSchema = schemaPayload(skill.input).trim()
            const outputSchema = schemaPayload(skill.output).trim()
            return Boolean(inputSchema) !== Boolean(outputSchema)
          })
        ) {
          setError(t.publish.pair)
          setPending(false)
          return
        }
        if (action === "publish" && !armed) {
          setArmed(true)
          return
        }
        setPending(true)
        const payload = {
          name: nameValue,
          bio: bioValue,
          skills: skillValue.map((skill) => {
            const kind = deliveryKindOf(skill.output)
            return publishedSkill(
              {
                name: skill.name,
                title: skill.title,
                description: skill.description.trim(),
                inputSchema: schemaPayload(skill.input),
                outputSchema: schemaPayload(skill.output),
                play: activePlay(skill.template || skill.name, kind),
                template: skill.template,
              },
              catalog,
              locale,
            )
          }),
        }
        const request = editing && agent ? api<Agent>(`/api/agents/${agent.id}`, payload) : api<Agent>("/api/agents", payload)
        request
          .then(async (next) => {
            sessionStorage.setItem(PUBLISHED_KEY, "1")
            if (agent) await refresh()
            else await signIn(next.id)
            if (pagesExport) go("/me")
            else router.push("/me")
          })
          .catch((caught: unknown) => {
            setError(caught instanceof ApiError ? showError(caught, t.publish.saveError) : t.publish.saveError)
            setPending(false)
            setArmed(false)
          })
      }}
    >
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">{t.brand}</p>
      <h1 className="mt-2 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">
        {editing && agent ? t.publish.editingTitle(agent.name) : t.publish.pageTitle}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{t.publish.pageLead}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="person-name" ref={nameRef}>
          {t.publish.name}
          <Input
            id="person-name"
            className="mt-1.5 h-10"
            value={nameValue}
            maxLength={16}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "person-name-error" : undefined}
            onChange={(event) => {
              const next = event.target.value
              setName(next)
              setArmed(false)
              if (nameError) setNameError(personNameIssue(next) ? localizeError(wire("name.length"), locale) : null)
            }}
          />
          {nameError ? (
            <span id="person-name-error" className="mt-1 block text-sm text-stamp" role="alert">
              {nameError}
            </span>
          ) : null}
        </label>
        <label className="text-sm" htmlFor="person-bio" ref={bioRef}>
          {t.publish.bio}
          <Input
            id="person-bio"
            className="mt-1.5 h-10"
            value={bioValue}
            maxLength={80}
            placeholder={t.publish.bioPlaceholder}
            aria-invalid={bioError ? true : undefined}
            aria-describedby={bioError ? "person-bio-error" : undefined}
            onChange={(event) => {
              setBio(event.target.value)
              if (bioError) setBioError(null)
              setArmed(false)
            }}
          />
          {bioError ? (
            <span id="person-bio-error" className="mt-1 block text-sm text-stamp" role="alert">
              {bioError}
            </span>
          ) : null}
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t.publish.personHint}</p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="sheet relative space-y-8 p-5">
          {active ? (
            <button
              type="button"
              aria-label={t.publish.removeSkill}
              className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-lg leading-none text-stamp hover:bg-[#f3e6c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stamp"
              onClick={() => removeSkill(focusIndex)}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
          <section className="space-y-4">
            <h2 className="pr-10 font-mono text-[11px] tracking-[0.16em] text-stamp">01 / {t.publish.who}</h2>
            <div className="flex flex-wrap gap-2">
              {catalog.map((item) => {
                const selected = active?.template === item.name
                return (
                  <button key={item.name} type="button" aria-pressed={selected} className={capsule(selected)} onClick={() => applyPreset(item)}>
                    {catalogText(item, locale).title || item.name}
                  </button>
                )
              })}
              <button type="button" aria-pressed={Boolean(active && isBlankDraft(active))} className={capsule(Boolean(active && isBlankDraft(active)))} onClick={writeOwn}>
                {t.publish.customAdd}
              </button>
            </div>
            {skillValue.length ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t.publish.installed}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {skillValue.map((skill, index) => (
                    <button
                      key={`${skill.originalName}-${index}`}
                      type="button"
                      aria-pressed={index === focusIndex}
                      className={capsule(index === focusIndex)}
                      onClick={() => {
                        if (index === focusIndex) return
                        setFocus(index)
                        setAdvanced(false)
                      }}
                    >
                      {installedLabel(skill) || t.publish.untitled(index + 1)}
                    </button>
                  ))}
                  {canStartAnother(skillValue.length) ? (
                    <button
                      type="button"
                      aria-label={t.publish.addSkill}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[#d9d0c0] text-lg leading-none text-stamp hover:bg-[#f3e6c8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stamp"
                      onClick={addAnother}
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {active ? (
              locked ? (
                <div className="space-y-4">
                  <p className="text-xs leading-5 text-muted-foreground">{t.publish.presetLocked}</p>
                  <div className="space-y-1">
                    <p className="text-sm">{t.publish.displayName}</p>
                    <p className="text-base">{active.title}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm">{t.publish.callWhen}</p>
                    <p className="whitespace-pre-wrap text-base leading-6">{active.description}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm">{t.publish.toolId}</p>
                    <p className="font-mono text-base">{active.name}</p>
                  </div>
                </div>
              ) : (
                <>
                  <label className="block text-sm">
                    {t.publish.displayName}
                    <Input
                      className="mt-1.5 h-10"
                      value={active.title}
                      maxLength={32}
                      placeholder={t.publish.displayPlaceholder}
                      onChange={(event) => updateSkill(focusIndex, { title: event.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    {t.publish.callWhen}
                    <Textarea
                      className="mt-1.5 min-h-24"
                      value={active.description}
                      maxLength={320}
                      placeholder={t.publish.callHint}
                      onChange={(event) => updateSkill(focusIndex, { description: event.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    {t.publish.toolId}
                    <Textarea
                      className="mt-1.5 min-h-[3.5rem] resize-none font-mono"
                      rows={2}
                      value={active.name}
                      spellCheck={false}
                      placeholder={t.publish.toolIdHint}
                      aria-invalid={toolIssue ? true : undefined}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.preventDefault()
                      }}
                      onChange={(event) => updateSkill(focusIndex, { name: event.target.value.replace(/[\r\n]+/g, "") })}
                    />
                    {toolIssue ? (
                      <span className="mt-1 block text-sm text-stamp" role="alert">
                        {toolIssue === "empty" ? t.publish.toolIdEmpty : t.publish.toolIdInvalid}
                      </span>
                    ) : null}
                  </label>
                </>
              )
            ) : null}
          </section>

          {active ? (
            <section className="space-y-4">
              <h2 className="font-mono text-[11px] tracking-[0.16em] text-stamp">02 / {t.publish.before}</h2>
              {locked ? (
                <>
                  {inputFields.length ? (
                    <ul className="space-y-1">
                      {inputFields.map((field, index) => (
                        <li key={index} className="text-sm">
                          {fieldPill(field, fieldTypeLabel(field.type, locale), field.required ? t.publish.pillRequired : t.publish.pillOptional)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {active.sample ? (
                    <div className="space-y-1">
                      <p className="text-sm">{t.publish.sample}</p>
                      <p className="whitespace-pre-wrap text-base leading-6">{active.sample}</p>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-sm">{t.publish.deliver}</p>
                    <div className="flex flex-wrap gap-2">
                      {deliveryChoices.filter(([kind]) => kind === delivery).map(([, label]) => (
                        <span key={label} className="rounded-full bg-ink px-3 py-1 text-sm text-[#fbf7ee]">
                          {label}
                        </span>
                      ))}
                      {delivery === "custom" ? (
                        <span className="rounded-full bg-ink px-3 py-1 text-sm text-[#fbf7ee]">{t.publish.deliverCustom}</span>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {inputFields.length === 0 ? (
                    <button
                      type="button"
                      className="text-sm text-action"
                      onClick={() => updateSkill(focusIndex, { input: { mode: "fields", fields: defaultTaskInput(t.publish.taskLabel), json: "" } })}
                    >
                      {t.publish.useTask}
                    </button>
                  ) : null}
                  {!advanced && active.input.mode === "fields"
                    ? inputFields.map((field, index) => (
                        <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto_auto] sm:items-end">
                          <label className="block text-xs text-muted-foreground">
                            {t.schema.name}
                            <Input className="mt-1" value={field.name} maxLength={40} onChange={(event) => patchInput(index, { name: event.target.value })} />
                          </label>
                          <label className="block text-xs text-muted-foreground">
                            {t.schema.type}
                            <select
                              className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                              value={field.type}
                              onChange={(event) => patchInput(index, { type: event.target.value as SchemaField["type"] })}
                            >
                              {FIELD_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {fieldTypeLabel(type, locale)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex h-8 items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={field.required} onChange={(event) => patchInput(index, { required: event.target.checked })} />
                            {t.schema.required}
                          </label>
                          <button type="button" className="h-8 text-left text-sm text-action" onClick={() => updateSkill(focusIndex, { input: { ...active.input, fields: inputFields.filter((_, item) => item !== index) } })}>
                            {t.schema.remove}
                          </button>
                        </div>
                      ))
                    : null}
                  <label className="block text-sm">
                    {t.publish.sample}
                    <Textarea
                      className="mt-1.5 min-h-20"
                      value={active.sample}
                      maxLength={200}
                      placeholder={t.publish.samplePlaceholder}
                      onChange={(event) => updateSkill(focusIndex, { sample: event.target.value })}
                    />
                  </label>
                  {!advanced && active.input.mode === "fields" && inputFields.length > 0 ? (
                    <button
                      type="button"
                      className="text-sm text-action"
                      onClick={() =>
                        updateSkill(focusIndex, {
                          input: { ...active.input, fields: [...inputFields, { name: "", type: "string", required: false }] },
                        })
                      }
                    >
                      {t.publish.askOptional}
                    </button>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-sm">{t.publish.deliver}</p>
                    <div className="flex flex-wrap gap-2">
                      {deliveryChoices.map(([kind, label]) => (
                        <button key={kind} type="button" aria-pressed={delivery === kind} className={capsule(delivery === kind)} onClick={() => setDelivery(kind)}>
                          {label}
                        </button>
                      ))}
                      {delivery === "custom" ? (
                        <span className="rounded-full bg-ink px-3 py-1 text-sm text-[#fbf7ee]">{t.publish.deliverCustom}</span>
                      ) : null}
                    </div>
                  </div>
                  <button type="button" className="text-sm text-action" onClick={() => setAdvanced((current) => !current)}>
                    {advanced ? t.publish.advancedHide : t.publish.advanced}
                  </button>
                  {advanced ? (
                    <SchemaEditor input={active.input} output={active.output} onChange={(next) => updateSkill(focusIndex, next)} />
                  ) : null}
                </>
              )}
            </section>
          ) : null}
        </div>
        <SkillPreview
          personName={nameValue}
          skill={
            active
              ? { ...active, play: activePlay(active.template || active.name, delivery) }
              : null
          }
          resetKey={active ? workerSessionKey(focusIndex, active.template || playMode(active.name)) : "none"}
        />
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      ) : null}
      <Button type="submit" className="mt-4 h-11 px-5" disabled={pending}>
        {pending ? t.publish.writing : action === "save" ? t.publish.save : armed ? t.publish.confirmPublish : t.publish.publish}
      </Button>
    </form>
  )
}
