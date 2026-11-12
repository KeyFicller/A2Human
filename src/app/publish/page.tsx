"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { useText } from "@/components/locale-provider"
import { SchemaEditor } from "@/components/schema-editor"
import { SkillPreview, deliveryKindOf, type PreviewSkill } from "@/components/skill-preview"
import { ErrorNote, LoadingLine } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, api } from "@/lib/client"
import { go, pagesExport } from "@/lib/paths"
import { canAddCustomSkill, customSkillAddLabel, defaultTaskInput, deliverySchema, fieldPill, skillPayload, toolIdFromTitle, type DeliveryKind } from "@/lib/publish-skills"
import { draftFromSchema, duplicateFieldName, fieldTypeLabel, schemaPayload, type SchemaDraft, type SchemaField } from "@/lib/schema-fields"
import { CUSTOM_SKILL_NAME, SKILL_CATALOG, catalogNames, type CatalogSkill } from "@/lib/skill-catalog"
import type { Agent, Skill } from "@/lib/types"

type SkillKind = "catalog" | "custom" | "legacy"

type SkillDraft = PreviewSkill & {
  input: SchemaDraft
  output: SchemaDraft
  kind: SkillKind
  nameTouched: boolean
  originalName: string
}

function kindFor(name: string, names: Set<string>, previous: SkillKind): SkillKind {
  if (names.has(name)) return "catalog"
  if (CUSTOM_SKILL_NAME.test(name)) return "custom"
  return previous === "legacy" ? "legacy" : "custom"
}

function emptyCustom(taken: string[], taskLabel: string): SkillDraft {
  const name = toolIdFromTitle("", taken)
  return {
    name,
    title: "",
    description: "",
    sample: "",
    input: { mode: "fields", fields: defaultTaskInput(taskLabel), json: "" },
    output: draftFromSchema(deliverySchema("text")),
    kind: "custom",
    nameTouched: false,
    originalName: name,
  }
}

function draftFrom(skill: Skill, names: Set<string>, catalog: CatalogSkill[]): SkillDraft {
  const kind = kindFor(skill.name, names, names.has(skill.name) ? "catalog" : CUSTOM_SKILL_NAME.test(skill.name) ? "custom" : "legacy")
  const preset = catalog.find((item) => item.name === skill.name)
  return {
    name: skill.name,
    title: skill.title?.trim() || preset?.title || skill.name,
    description: skill.description,
    sample: preset?.sample ?? "",
    input: draftFromSchema(skill.inputSchema),
    output: draftFromSchema(skill.outputSchema),
    kind,
    nameTouched: true,
    originalName: skill.name,
  }
}

function fromCatalog(item: CatalogSkill): SkillDraft {
  return {
    name: item.name,
    title: item.title,
    description: item.description,
    sample: item.sample,
    input: draftFromSchema(item.inputSchema),
    output: draftFromSchema(item.outputSchema),
    kind: "catalog",
    nameTouched: true,
    originalName: item.name,
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

  useEffect(() => {
    let cancel = false
    api<{ skills: CatalogSkill[] }>("/api/skill-catalog")
      .then((body) => {
        if (!cancel && Array.isArray(body.skills) && body.skills.length) setCatalog(body.skills)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [])

  const names = catalogNames(catalog)
  const nameValue = name ?? agent?.name ?? ""
  const bioValue = bio ?? agent?.bio ?? ""
  const skillValue = skills ?? (agent?.skills.length ? agent.skills.map((skill) => draftFrom(skill, names, catalog)) : [])
  const focusIndex = skillValue.length ? Math.min(focus, skillValue.length - 1) : 0
  const active = skillValue[focusIndex]
  const customCount = skillValue.filter((skill) => skill.kind !== "catalog").length

  if (!ready) return <LoadingLine />

  function updateSkill(index: number, patch: Partial<SkillDraft>) {
    setSkills(
      skillValue.map((skill, item) => {
        if (item !== index) return skill
        const next = { ...skill, ...patch }
        if (patch.name !== undefined) {
          next.nameTouched = true
          next.kind = kindFor(next.name, names, skill.kind)
        }
        if (patch.title !== undefined && !next.nameTouched) {
          const taken = skillValue.filter((_, other) => other !== index).map((other) => other.name)
          next.name = toolIdFromTitle(next.title, taken, catalog)
          next.kind = kindFor(next.name, names, "custom")
        }
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

  function toggleCatalog(item: CatalogSkill) {
    const found = skillValue.findIndex((skill) => skill.name === item.name)
    if (found >= 0) {
      removeSkill(found)
      return
    }
    if (!canAddCustomSkill(skillValue.length)) return
    setSkills([...skillValue, fromCatalog(item)])
    setFocus(skillValue.length)
    setAdvanced(false)
  }

  function addBlank() {
    if (!canAddCustomSkill(skillValue.length)) return
    setSkills([...skillValue, emptyCustom(skillValue.map((skill) => skill.name), t.publish.taskLabel)])
    setFocus(skillValue.length)
    setAdvanced(false)
  }

  function setDelivery(kind: DeliveryKind) {
    if (!active) return
    updateSkill(focusIndex, { output: draftFromSchema(deliverySchema(kind)) })
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
  const inputFields = active?.input.mode === "fields" ? active.input.fields : []
  const deliveryChoices: Array<[DeliveryKind, string]> = [
    ["text", t.publish.deliverText],
    ["image", t.publish.deliverImage],
    ["image_text", t.publish.deliverBoth],
  ]

  return (
    <form
      className="mx-auto max-w-6xl"
      onSubmit={(event) => {
        event.preventDefault()
        setPending(true)
        setError(null)
        if (skillValue.length < 1) {
          setError(t.publish.needSkill)
          setPending(false)
          return
        }
        if (skillValue.some((skill) => ![...skill.title.trim()].length || [...skill.title.trim()].length > 32)) {
          setError(t.publish.needTitle)
          setPending(false)
          return
        }
        if (skillValue.some((skill) => ![...skill.description.trim()].length || [...skill.description.trim()].length > 120)) {
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
        const payload = {
          name: nameValue,
          bio: bioValue,
          skills: skillValue.map((skill) =>
            skillPayload({
              name: skill.name,
              title: skill.title,
              description: skill.description.trim(),
              inputSchema: schemaPayload(skill.input),
              outputSchema: schemaPayload(skill.output),
            }),
          ),
        }
        const request = agent ? api<Agent>(`/api/agents/${agent.id}`, payload) : api<Agent>("/api/agents", payload)
        request
          .then(async (next) => {
            if (agent) await refresh()
            else await signIn(next.id)
            if (pagesExport) go("/me")
            else router.push("/me")
          })
          .catch((caught: unknown) => {
            setError(caught instanceof ApiError ? showError(caught, t.publish.saveError) : t.publish.saveError)
            setPending(false)
          })
      }}
    >
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">{t.brand}</p>
      <h1 className="mt-2 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">{t.publish.pageTitle}</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{t.publish.pageLead}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t.publish.name}
          <Input className="mt-1.5 h-10" value={nameValue} maxLength={16} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="text-sm">
          {t.publish.bio}
          <Input
            className="mt-1.5 h-10"
            value={bioValue}
            maxLength={80}
            placeholder={t.publish.bioPlaceholder}
            onChange={(event) => setBio(event.target.value)}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t.publish.personHint}</p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="sheet space-y-8 p-5">
          <section className="space-y-4">
            <h2 className="font-mono text-[11px] tracking-[0.16em] text-stamp">01 / {t.publish.who}</h2>
            <div className="flex flex-wrap gap-2">
              {catalog.map((item) => {
                const selected = skillValue.some((skill) => skill.name === item.name)
                return (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && skillValue.length >= 6}
                    className={capsule(selected)}
                    onClick={() => toggleCatalog(item)}
                  >
                    {item.title || item.name}
                  </button>
                )
              })}
              {canAddCustomSkill(skillValue.length) ? (
                <button type="button" className={capsule(false)} onClick={addBlank}>
                  {t.publish[customSkillAddLabel(customCount)]}
                </button>
              ) : null}
            </div>
            {skillValue.length > 1 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t.publish.installed}</p>
                <div className="flex flex-wrap gap-2">
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
                      {skill.title.trim() || skill.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {active ? (
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
                    maxLength={120}
                    onChange={(event) => updateSkill(focusIndex, { description: event.target.value })}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">{t.publish.callHint}</span>
                </label>
                <label className="block text-sm">
                  {t.publish.toolId}
                  <Input
                    className="mt-1.5 h-10 font-mono"
                    value={active.name}
                    maxLength={24}
                    spellCheck={false}
                    onChange={(event) => updateSkill(focusIndex, { name: event.target.value.trim() })}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">{t.publish.toolIdHint}</span>
                </label>
                <button type="button" className="text-sm text-stamp" onClick={() => removeSkill(focusIndex)}>
                  {t.publish.removeSkill}
                </button>
              </>
            ) : null}
          </section>

          {active ? (
            <section className="space-y-4">
              <h2 className="font-mono text-[11px] tracking-[0.16em] text-stamp">02 / {t.publish.before}</h2>
              {inputFields.length === 0 ? (
                <button
                  type="button"
                  className="text-sm text-stamp"
                  onClick={() => updateSkill(focusIndex, { input: { mode: "fields", fields: defaultTaskInput(t.publish.taskLabel), json: "" } })}
                >
                  {t.publish.useTask}
                </button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#d9d0c0] bg-[#f7f1e4] px-3 py-1 text-sm">
                    {fieldPill(inputFields[0], fieldTypeLabel(inputFields[0].type, locale), inputFields[0].required ? t.publish.pillRequired : t.publish.pillOptional)}
                  </span>
                </div>
              )}
              {!advanced && active.input.mode === "fields"
                ? inputFields.slice(1).map((field, offset) => {
                    const index = offset + 1
                    return (
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
                            {(["string", "integer", "number", "boolean", "image"] as const).map((type) => (
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
                        <button type="button" className="h-8 text-left text-sm text-stamp" onClick={() => updateSkill(focusIndex, { input: { ...active.input, fields: inputFields.filter((_, item) => item !== index) } })}>
                          {t.schema.remove}
                        </button>
                      </div>
                    )
                  })
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
                  className="text-sm text-stamp"
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
              <button type="button" className="text-sm text-stamp" onClick={() => setAdvanced((current) => !current)}>
                {advanced ? t.publish.advancedHide : t.publish.advanced}
              </button>
              {advanced ? (
                <SchemaEditor input={active.input} output={active.output} onChange={(next) => updateSkill(focusIndex, next)} />
              ) : null}
            </section>
          ) : null}
        </div>
        <SkillPreview skill={active ?? null} />
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorNote text={error} />
        </div>
      ) : null}
      <Button type="submit" className="mt-4 h-11 px-5" disabled={pending}>
        {pending ? t.publish.writing : agent ? t.publish.save : t.publish.publish}
      </Button>
    </form>
  )
}
