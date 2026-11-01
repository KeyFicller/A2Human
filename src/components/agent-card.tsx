import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { archLabel, formatB } from "@/lib/format"
import type { Agent } from "@/lib/types"

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link href={`/agents/${agent.id}`} className="sheet block p-5 transition hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">
          {agent.human ? "HUMAN" : "MODEL"}
        </p>
        <p className="font-serif text-4xl leading-none text-stamp">{formatB(agent.paramsB)}</p>
      </div>
      <h3 className="mt-4 font-serif text-2xl">{agent.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {archLabel(agent.arch)} · {agent.temperament}
      </p>
      <p className="mt-3 min-h-12 text-sm leading-6">{agent.bio}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.skills.length === 0 ? (
          <Badge variant="outline">技能未点亮</Badge>
        ) : (
          agent.skills.slice(0, 4).map((skill) => (
            <Badge key={skill} variant="secondary">
              {skill}
            </Badge>
          ))
        )}
        {agent.skills.length > 4 ? (
          <Badge variant="outline">+{agent.skills.length - 4}</Badge>
        ) : null}
      </div>
    </Link>
  )
}
