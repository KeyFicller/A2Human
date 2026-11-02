"use client"

import Link from "next/link"
import { useLocale } from "@/components/locale-provider"
import { RecordFigures } from "@/components/record-figures"
import { SchemaSummary } from "@/components/schema-summary"
import { Badge } from "@/components/ui/badge"
import type { Agent } from "@/lib/types"

export function AgentCard({ agent }: { agent: Agent }) {
  const { t } = useLocale()
  return (
    <Link href={`/agents/${agent.id}`} className="sheet block p-5 transition hover:-translate-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-2xl">{agent.name}</h3>
        <p className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{agent.available ? t.duty.on : t.duty.off}</p>
      </div>
      <RecordFigures completed={agent.completed} averageScore={agent.averageScore} averageDuration={agent.averageDuration} />
      <p className="mt-3 text-sm leading-6">{agent.bio}</p>
      <ul className="mt-4 space-y-2">
        {agent.skills.map((skill) => (
          <li key={skill.name}>
            <Badge variant="secondary">{skill.name}</Badge>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{skill.description}</p>
            <SchemaSummary skill={skill} />
          </li>
        ))}
      </ul>
    </Link>
  )
}
