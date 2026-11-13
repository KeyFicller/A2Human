"use client"

import { useLocale } from "@/components/locale-provider"
import { describeSchema } from "@/lib/schema-fields"
import { SKILL_CATALOG, shownSkillSchema } from "@/lib/skill-catalog"
import type { Skill } from "@/lib/types"

export function SchemaSummary({ skill }: { skill: Skill }) {
  const { locale, t } = useLocale()
  const input = shownSkillSchema(skill, "input", locale, SKILL_CATALOG, t.publish.taskLabel)
  const output = shownSkillSchema(skill, "output", locale, SKILL_CATALOG, t.publish.taskLabel)
  if (!input || !output) return null
  return (
    <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
      <p>{t.schema.line(t.schema.input, describeSchema(input, locale))}</p>
      <p>{t.schema.line(t.schema.output, describeSchema(output, locale))}</p>
    </div>
  )
}
