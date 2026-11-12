import catalog from "@/locales/skill-catalog.json"
import type { JsonSchema } from "./types"

export type CatalogSkill = {
  name: string
  title: string
  description: string
  sample: string
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
}

export function skillLabel(skill: { name: string; title?: string }) {
  const title = skill.title?.trim()
  return title || skill.name
}

/** Same file the API validates against (`GET /api/skill-catalog`). */
export const SKILL_CATALOG = catalog as CatalogSkill[]

export const CUSTOM_SKILL_NAME = /^[a-z][a-z0-9_]{0,23}$/

export function catalogNames(skills: CatalogSkill[] = SKILL_CATALOG) {
  return new Set(skills.map((skill) => skill.name))
}

export function isCatalogName(name: string, skills: CatalogSkill[] = SKILL_CATALOG) {
  return catalogNames(skills).has(name)
}
