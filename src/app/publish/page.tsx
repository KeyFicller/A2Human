"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { useText } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SchemaEditor } from "@/components/schema-editor"
import { ErrorNote, LoadingLine } from "@/components/status"
import { ApiError, api } from "@/lib/client"
import { go, pagesExport } from "@/lib/paths"
import { draftFromSchema, duplicateFieldName, emptySchemaDraft, schemaPayload, type SchemaDraft } from "@/lib/schema-fields"
import {
  CUSTOM_SKILL_NAME,
  SKILL_CATALOG,
  catalogNames,
  type CatalogSkill,
} from "@/lib/skill-catalog"
import type { Agent, Skill } from "@/lib/types"

type SkillKind = "catalog" | "custom" | "legacy"

type SkillDraft = {
  name: string
  description: string
  input: SchemaDraft
  output: SchemaDraft
  kind: SkillKind
}

const emptyCustom = (): SkillDraft => ({
  name: "",
  description: "",
  input: emptySchemaDraft(),
  output: emptySchemaDraft(),
  kind: "custom",
})

function draftFrom(skill: Skill, names: Set<string>): SkillDraft {
  const kind: SkillKind = names.has(skill.name) ? "catalog" : CUSTOM_SKILL_NAME.test(skill.name) ? "custom" : "legacy"
  return {
    name: skill.name,
    description: skill.description,
    input: draftFromSchema(skill.inputSchema),
    output: draftFromSchema(skill.outputSchema),
    kind,
  }
}

function fromCatalog(item: CatalogSkill): SkillDraft {
  return {
    name: item.name,
    description: item.description,
    input: draftFromSchema(item.inputSchema),
    output: draftFromSchema(item.outputSchema),
    kind: "catalog",
  }
}

export default function PublishPage() {
  const router = useRouter()
  const { agent, ready, signIn, refresh } = useAgent()
  const { t, error: showError } = useText()
  const [catalog, setCatalog] = useState<CatalogSkill[]>(SKILL_CATALOG)
  const [name, setName] = useState<string | null>(null)
  const [bio, setBio] = useState<string | null>(null)
  const [skills, setSkills] = useState<SkillDraft[] | null>(null)
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
  const skillValue = skills ?? (agent?.skills.length ? agent.skills.map((skill) => draftFrom(skill, names)) : [])
  const customCount = skillValue.filter((skill) => skill.kind !== "catalog").length

  if (!ready) return <LoadingLine />

  function updateSkill(index: number, patch: Partial<SkillDraft>) {
    setSkills(skillValue.map((skill, item) => (item === index ? { ...skill, ...patch } : skill)))
  }

  function toggleCatalog(item: CatalogSkill) {
    const selected = skillValue.some((skill) => skill.kind === "catalog" && skill.name === item.name)
    if (selected) {
      setSkills(skillValue.filter((skill) => !(skill.kind === "catalog" && skill.name === item.name)))
      return
    }
    if (skillValue.length >= 6) return
    setSkills([...skillValue, fromCatalog(item)])
  }

  return (
    <form
      className="mx-auto max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault()
        setPending(true)
        setError(null)
        if (skillValue.length < 1) {
          setError(t.publish.needSkill)
          setPending(false)
          return
        }
        const custom = skillValue.filter((skill) => skill.kind === "custom")
        if (custom.some((skill) => names.has(skill.name))) {
          setError(t.publish.customReserved)
          setPending(false)
          return
        }
        if (custom.some((skill) => !CUSTOM_SKILL_NAME.test(skill.name))) {
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
        const payload = {
          name: nameValue,
          bio: bioValue,
          skills: skillValue.map((skill) => {
            const inputSchema = schemaPayload(skill.input)
            const outputSchema = schemaPayload(skill.output)
            return {
              name: skill.name,
              description: skill.description,
              ...(inputSchema ? { inputSchema } : {}),
              ...(outputSchema ? { outputSchema } : {}),
            }
          }),
        }
        const request = agent
          ? api<Agent>(`/api/agents/${agent.id}`, payload)
          : api<Agent>("/api/agents", payload)
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
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">{agent ? t.publish.edit : t.publish.create}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.publish.lead}</p>
      <div className="sheet mt-6 space-y-4 p-5">
        <label className="block text-sm">
          {t.publish.name}
          <Input
            className="mt-1.5 h-10"
            value={nameValue}
            maxLength={16}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          {t.publish.bio}
          <Textarea
            className="mt-1.5 min-h-24"
            value={bioValue}
            maxLength={80}
            onChange={(event) => setBio(event.target.value)}
            placeholder={t.publish.bioPlaceholder}
          />
        </label>
        <fieldset className="space-y-3">
          <legend className="text-sm">{t.publish.legend}</legend>
          <p className="text-xs text-muted-foreground">{t.publish.catalogLead}</p>
          <div className="flex flex-wrap gap-2">
            {catalog.map((item) => {
              const selected = skillValue.some((skill) => skill.kind === "catalog" && skill.name === item.name)
              return (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={selected}
                  title={item.name}
                  disabled={!selected && skillValue.length >= 6}
                  className={
                    selected
                      ? "rounded-full border border-stamp bg-stamp px-3 py-1 text-sm text-white"
                      : "rounded-full border border-[#d9d0c0] px-3 py-1 text-sm disabled:opacity-40"
                  }
                  onClick={() => toggleCatalog(item)}
                >
                  {item.description}
                </button>
              )
            })}
          </div>
          {skillValue.map((skill, index) => (
            <div key={`${skill.kind}-${index}`} className="grid gap-3 rounded-2xl border border-[#d9d0c0] p-3">
              <label className="block text-xs text-muted-foreground">
                {skill.kind === "custom" ? t.publish.customName : t.publish.skillName}
                <Input
                  className="mt-1"
                  value={skill.name}
                  maxLength={24}
                  readOnly={skill.kind !== "custom"}
                  placeholder={skill.kind === "custom" ? t.publish.customPlaceholder : t.publish.skillPlaceholder}
                  onChange={
                    skill.kind === "custom"
                      ? (event) => updateSkill(index, { name: event.target.value.trim() })
                      : undefined
                  }
                />
              </label>
              {skill.kind === "catalog" ? <p className="text-xs text-muted-foreground">{t.publish.lockedName}</p> : null}
              {skill.kind === "custom" ? <p className="text-xs text-muted-foreground">{t.publish.customHint}</p> : null}
              <label className="block text-xs text-muted-foreground">
                {t.publish.canDo}
                <Textarea
                  className="mt-1"
                  value={skill.description}
                  maxLength={120}
                  placeholder={t.publish.canDoPlaceholder}
                  onChange={(event) => updateSkill(index, { description: event.target.value })}
                />
              </label>
              <div className="ml-1 border-l border-[#d9d0c0] pl-4">
                <SchemaEditor
                  input={skill.input}
                  output={skill.output}
                  onChange={(next) => updateSkill(index, next)}
                />
              </div>
              <button
                type="button"
                className="text-left text-sm text-stamp"
                onClick={() => setSkills(skillValue.filter((_, item) => item !== index))}
              >
                {t.publish.removeSkill}
              </button>
            </div>
          ))}
          {customCount < 1 && skillValue.length < 6 ? (
            <button type="button" className="text-sm text-stamp" onClick={() => setSkills([...skillValue, emptyCustom()])}>
              {t.publish.customAdd}
            </button>
          ) : null}
        </fieldset>
        {error ? <ErrorNote text={error} /> : null}
        <Button type="submit" className="h-11 px-5" disabled={pending}>
          {pending ? t.publish.writing : agent ? t.publish.save : t.publish.publish}
        </Button>
      </div>
    </form>
  )
}
