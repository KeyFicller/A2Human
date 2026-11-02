import catalog from "@/locales/skill-catalog.json"
import type { JsonSchema } from "./types"

export type CatalogSkill = {
  name: string
  description: string
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
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
