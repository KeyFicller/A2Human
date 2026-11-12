"use client"

import { useCallback, useEffect, useState } from "react"
import { useAgent } from "@/components/agent-provider"
import { AgentCard } from "@/components/agent-card"
import { CopyField } from "@/components/copy-field"
import { useText } from "@/components/locale-provider"
import { TaskRow } from "@/components/task-row"
import { ErrorNote, LoadingLine } from "@/components/status"
import { useApiOrigin } from "@/lib/api-origin"
import { api } from "@/lib/client"
import { formatWhen } from "@/lib/format"
import type { Agent, Task } from "@/lib/types"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<number | null>(null)
  const [sent, setSent] = useState<Task[]>([])
  const { agent: me } = useAgent()
  const origin = useApiOrigin()
  const { locale, t, error: showError } = useText()

  const load = useCallback(() => {
    api<Agent[]>("/api/agents")
      .then((next) => {
        setAgents(next.filter((agent) => agent.available))
        setUpdated(Date.now())
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(showError(caught, t.agents.rosterError))
      })
  }, [showError, t.agents.rosterError])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!me) {
      setSent([])
      return
    }
    let alive = true
    const pull = () => {
      api<Task[]>("/api/tasks")
        .then((tasks) => {
          if (alive) setSent(tasks.filter((task) => task.senderId === me.id))
        })
        .catch(() => {})
    }
    pull()
    const timer = window.setInterval(pull, 4000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [me])

  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">ON DUTY</p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">{t.agents.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t.agents.lead}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="text-stamp" onClick={load}>
          {t.agents.refresh}
        </button>
        {agents ? <span className="font-mono text-xs text-muted-foreground">{t.agents.onDutyCount(agents.length)}</span> : null}
        {updated ? <span className="font-mono text-xs text-muted-foreground">{t.agents.updated(formatWhen(new Date(updated).toISOString(), locale))}</span> : null}
      </div>
      <div className="mt-8 grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="min-w-0">
          {error ? <ErrorNote text={error} /> : null}
          {!agents && !error ? <LoadingLine text={t.agents.loading} /> : null}
          {agents && agents.length === 0 ? <p className="text-sm text-muted-foreground">{t.agents.empty}</p> : null}
          <div className="grid gap-4">
            {agents?.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>
        <aside className="sheet min-w-0 p-5">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{t.profile.forModels}</p>
          <CopyField hint={t.agents.discoveryHint} label={t.copy.discovery} value={directory} />
          <CopyField hint={t.agents.mcpHint} label={t.copy.mcp} value={origin ? `${origin}/api/mcp` : ""} />
        </aside>
      </div>
      {me ? <section className="mt-8">
        <h2 className="font-serif text-2xl">{t.me.sent}</h2>
        <div className="mt-3 grid gap-3">
          {sent.length === 0 ? <p className="text-sm text-muted-foreground">{t.me.sentEmpty}</p> : null}
          {sent.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      </section> : null}
    </div>
  )
}
