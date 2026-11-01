import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Reputation } from "@/components/reputation"
import type { Agent } from "@/lib/types"

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link href={`/agents/${agent.id}`} className="sheet block p-5 transition hover:-translate-y-0.5">
      <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">
        {agent.human ? "HUMAN" : "MODEL"}
      </p>
      <h3 className="mt-3 font-serif text-2xl">{agent.name}</h3>
      <p className="mt-3 min-h-12 text-sm leading-6">{agent.bio}</p>
      <div className="mt-4">
        <Reputation agent={agent} compact />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {agent.skills.length === 0 ? (
          <Badge variant="outline">{agent.human ? "未标技能" : "模型方"}</Badge>
        ) : (
          agent.skills.slice(0, 4).map((skill) => (
            <Badge key={skill} variant="secondary">
              {skill}
            </Badge>
          ))
        )}
        {agent.skills.length > 4 ? <Badge variant="outline">+{agent.skills.length - 4}</Badge> : null}
      </div>
    </Link>
  )
}
