import Link from "next/link"
import { SchemaSummary } from "@/components/schema-summary"
import { Badge } from "@/components/ui/badge"
import type { Agent } from "@/lib/types"

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link href={`/agents/${agent.id}`} className="sheet block p-5 transition hover:-translate-y-0.5">
      <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">
        {agent.available ? "在岗" : "不在岗"}
      </p>
      <h3 className="mt-3 font-serif text-2xl">{agent.name}</h3>
      <p className="mt-3 min-h-12 text-sm leading-6">{agent.bio}</p>
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
