import catalog from "@/locales/skill-catalog.json"
import type { JsonSchema } from "./types"

import { displayTitle, shownSkillDescription, type CatalogCopy } from "./publish-skills"

export type { CatalogCopy } from "./publish-skills"

export type CatalogSkill = {
  name: string
  title: string
  description: string
  sample: string
  en?: CatalogCopy
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
}

export function skillLabel(skill: { name: string; title?: string }, locale: "zh" | "en" = "zh") {
  return displayTitle(skill, SKILL_CATALOG, locale)
}

/** The skill description in the current locale: catalog copy for a preset, the person's own words otherwise. */
export function skillDescription(skill: { name: string; description: string }, locale: "zh" | "en" = "zh") {
  return shownSkillDescription(skill, SKILL_CATALOG, locale)
}

/** Same file the API validates against (`GET /api/skill-catalog`). */
// JSON inference makes each item a union of field shapes; the catalog tests check the real shape.
export const SKILL_CATALOG = catalog as unknown as CatalogSkill[]

export const CUSTOM_SKILL_NAME = /^[a-z][a-z0-9_]{0,23}$/

export function catalogNames(skills: CatalogSkill[] = SKILL_CATALOG) {
  return new Set(skills.map((skill) => skill.name))
}

export function isCatalogName(name: string, skills: CatalogSkill[] = SKILL_CATALOG) {
  return catalogNames(skills).has(name)
}

export { alignPresetCopy, catalogText, localizedPresetSchema, relabelPresetFields, relocalizeFields, shownSkillSchema } from "./publish-skills"
