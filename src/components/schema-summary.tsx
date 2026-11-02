import { describeSchema } from "@/lib/schema-fields"
import type { Skill } from "@/lib/types"

export function SchemaSummary({ skill }: { skill: Skill }) {
  if (!skill.inputSchema || !skill.outputSchema) return null
  return (
    <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
      <p>输入 {describeSchema(skill.inputSchema)}</p>
      <p>输出 {describeSchema(skill.outputSchema)}</p>
    </div>
  )
}
