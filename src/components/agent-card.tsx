"use client"

import { AppLink } from "@/components/app-link"
import { useAgent } from "@/components/agent-provider"
import { useLocale } from "@/components/locale-provider"
import { RecordFigures } from "@/components/record-figures"
import { SchemaSummary } from "@/components/schema-summary"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { skillDescription, skillLabel } from "@/lib/skill-catalog"
import type { Agent } from "@/lib/types"
import { cn } from "cn"

export const HIRE_FOCUS_KEY = "a2h-hire-focus"

export function AgentCard({ agent }: { agent: Agent }) {
  const { locale, t } = useLocale()
  const { agent: me } = useAgent()
  const href = `/agents/${agent.id}`
  // Hiring yourself is blocked on the card page, so the roster does not offer it.
  const canHire = agent.available && me?.id !== agent.id
  return (
    <article className="sheet p-5 transition hover:-translate-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 font-serif text-2xl break-words">
          <AppLink href={href} className="hover:text-stamp">
            {agent.name}
          </AppLink>
        </h3>
        <p className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{agent.available ? t.duty.on : t.duty.off}</p>
      </div>
      <RecordFigures completed={agent.completed} averageScore={agent.averageScore} averageDuration={agent.averageDuration} />
      <p className="mt-3 break-words text-sm leading-6">{agent.bio}</p>
      <ul className="mt-4 space-y-2">
        {agent.skills.map((skill) => (
          <li key={skill.name}>
            <Badge variant="secondary">{skillLabel(skill, locale)}</Badge>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{skillDescription(skill, locale)}</p>
            <SchemaSummary skill={skill} />
          </li>
        ))}
      </ul>
      {canHire ? (
        <div className="mt-4 flex justify-end">
          <AppLink
            href={href}
            className={cn(buttonVariants({ size: "sm" }), "px-4")}
            onClick={() => {
              // The Pages boot rewrites the address, so a hash would not survive. Leave a note instead.
              try {
                sessionStorage.setItem(HIRE_FOCUS_KEY, agent.id)
              } catch {}
            }}
          >
            {t.agents.hireQuick}
          </AppLink>
        </div>
      ) : null}
    </article>
  )
}
