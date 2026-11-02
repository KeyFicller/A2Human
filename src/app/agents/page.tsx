"use client"

import { useEffect, useState } from "react"
import { AgentCard } from "@/components/agent-card"
import { CopyField } from "@/components/copy-field"
import { useText } from "@/components/locale-provider"
import { ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import type { Agent } from "@/lib/types"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")
  const { t, error: showError } = useText()

  useEffect(() => {
    let alive = true
    const load = () => {
      api<Agent[]>("/api/agents")
        .then((next) => {
          if (!alive) return
          setAgents(next.filter((agent) => agent.available))
          setError(null)
        })
        .catch((caught: unknown) => {
          if (!alive) return
          setError(showError(caught, t.agents.rosterError))
        })
    }
    load()
    const timer = window.setInterval(load, 4000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [showError, t.agents.rosterError])

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin))
  }, [])

  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">ON DUTY</p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">{t.agents.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t.agents.lead}</p>
      <CopyField hint={t.agents.discoveryHint} label={t.copy.discovery} value={directory} />
      <CopyField hint={t.agents.mcpHint} label={t.copy.mcp} value={origin ? `${origin}/api/mcp` : ""} />
      {error ? <ErrorNote text={error} /> : null}
      {!agents && !error ? <LoadingLine text={t.agents.loading} /> : null}
      {agents && agents.length === 0 ? <p className="mt-8 text-sm text-muted-foreground">{t.agents.empty}</p> : null}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {agents?.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  )
}
