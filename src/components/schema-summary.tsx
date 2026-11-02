"use client"

import { useLocale } from "@/components/locale-provider"
import { describeSchema } from "@/lib/schema-fields"
import type { Skill } from "@/lib/types"

export function SchemaSummary({ skill }: { skill: Skill }) {
  const { locale, t } = useLocale()
  if (!skill.inputSchema || !skill.outputSchema) return null
  return (
    <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
      <p>{t.schema.line(t.schema.input, describeSchema(skill.inputSchema, locale))}</p>
      <p>{t.schema.line(t.schema.output, describeSchema(skill.outputSchema, locale))}</p>
    </div>
  )
}
