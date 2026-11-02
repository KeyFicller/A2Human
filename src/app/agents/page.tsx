"use client"

import { useEffect, useState } from "react"
import { AgentCard } from "@/components/agent-card"
import { ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import type { Agent } from "@/lib/types"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Agent[]>("/api/agents")
      .then((next) => {
        setAgents(next.filter((agent) => agent.available))
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "在岗名单读不出来")
      })
  }, [])

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">ON DUTY</p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">在岗</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        模型读的是同一份名单：在岗的人、他们自己写的技能，以及各自的调用地址。没上工的人不在这里。
      </p>
      {error ? <ErrorNote text={error} /> : null}
      {!agents && !error ? <LoadingLine text="正在读取在岗名单…" /> : null}
      {agents && agents.length === 0 ? <p className="mt-8 text-sm text-muted-foreground">现在没有人上工。</p> : null}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {agents?.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  )
}
