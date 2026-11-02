"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { AgentCard } from "@/components/agent-card"
import { useAgent } from "@/components/agent-provider"
import { CopyField } from "@/components/copy-field"
import { useText } from "@/components/locale-provider"
import { ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import type { Agent } from "@/lib/types"
import { cn } from "cn"

export default function HomePage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")
  const { agent: me, ready } = useAgent()
  const { t, error: showError } = useText()

  useEffect(() => {
    let alive = true
    const load = () => {
      api<Agent[]>("/api/agents")
        .then((next) => {
          if (!alive) return
          setAgents(next)
          setError(null)
        })
        .catch((caught: unknown) => {
          if (!alive) return
          setError(showError(caught, t.home.rosterError))
        })
    }
    load()
    const timer = window.setInterval(load, 4000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [showError, t.home.rosterError])

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin))
  }, [])

  const onDuty = agents?.filter((agent) => agent.available) ?? []
  const published = Boolean(ready && me)
  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""
  const steps = [
    { n: "01", title: t.home.step1Title, body: t.home.step1Body },
    { n: "02", title: t.home.step2Title, body: t.home.step2Body },
    { n: "03", title: t.home.step3Title, body: t.home.step3Body },
  ]

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.22em] text-stamp">A2HUMAN</p>
      <h1 className="mt-4 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">{t.home.title}</h1>
      <p className="mt-6 max-w-xl text-lg leading-8">{t.home.lead}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href={published ? "/me" : "/publish"} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
          {me?.available ? t.home.onDutyNow : published ? t.home.goOnDuty : t.home.publish}
        </Link>
        <Link href="/agents" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 bg-paper px-5")}>
          {t.home.seeDuty}
        </Link>
      </div>
      <ol className="mt-10 grid gap-3 sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.n} className="sheet p-4">
            <p className="font-mono text-xs text-stamp">{step.n}</p>
            <h2 className="mt-2 font-serif text-2xl">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
      <section className="mt-12 grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-3xl">{t.home.dutyTitle}</h2>
            {agents ? <p className="font-mono text-xs text-muted-foreground">{t.home.people(onDuty.length)}</p> : null}
          </div>
          {error ? <ErrorNote text={error} /> : null}
          {!agents && !error ? <LoadingLine text={t.home.loading} /> : null}
          {agents && onDuty.length === 0 ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{t.home.empty}</p> : null}
          <div className="mt-4 grid gap-4">
            {onDuty.map((person) => (
              <AgentCard key={person.id} agent={person} />
            ))}
          </div>
        </div>
        <aside className="sheet min-w-0 p-5">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{t.profile.forModels}</p>
          <CopyField hint={t.home.discoveryHint} label={t.copy.discovery} value={directory} />
          <CopyField hint={t.home.mcpHint} label={t.copy.mcp} value={origin ? `${origin}/api/mcp` : ""} />
        </aside>
      </section>
    </div>
  )
}
