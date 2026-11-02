"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { CopyField } from "@/components/copy-field"
import { useText } from "@/components/locale-provider"
import { LoadingLine } from "@/components/status"
import { SchemaSummary } from "@/components/schema-summary"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorNote } from "@/components/status"
import { api } from "@/lib/client"
import { recordLine } from "@/lib/format"
import type { Agent } from "@/lib/types"

export function ProfileFallback() {
  const { t } = useText()
  return <LoadingLine text={t.profile.opening} />
}

export default function AgentProfilePage() {
  const params = useParams<{ id: string }>()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [card, setCard] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState("")
  const { locale, t, error: showError } = useText()

  const load = useCallback(() => {
    Promise.all([api<Agent>(`/api/agents/${params.id}`), api<unknown>(`/api/a2a/${params.id}`)])
      .then(([nextAgent, nextCard]) => {
        setAgent(nextAgent)
        setCard(nextCard)
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(showError(caught, t.profile.loadError))
      })
  }, [params.id, showError, t.profile.loadError])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin))
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (error && !agent) return <ErrorNote text={error} onRetry={load} />
  if (!agent) return <LoadingLine />

  const endpoint = origin ? `${origin}/api/a2a/${agent.id}` : ""
  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""
  const onlySkill = agent.skills.length === 1 ? agent.skills[0].name : undefined
  const sample = endpoint
    ? `curl -s ${endpoint} -H 'content-type: application/json' -H 'A2A-Version: 1.0' -d '${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "SendMessage",
        params: {
          configuration: { returnImmediately: true },
          ...(onlySkill ? { metadata: { skill: onlySkill } } : {}),
          message: {
            role: "ROLE_USER",
            messageId: "msg-1",
            parts: [{ text: t.profile.sample }],
          },
        },
      }).replaceAll("'", "'\\'")}'`
    : ""

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)]">
      <section className="sheet min-w-0 p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">
          {agent.available ? t.duty.on : t.duty.off}
        </p>
        <h1 className="mt-4 font-serif text-4xl">{agent.name}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{recordLine(agent.completed, agent.averageScore, agent.averageDuration, locale)}</p>
        <p className="mt-4 leading-7">{agent.bio}</p>
        <ul className="mt-6 space-y-3">
          {agent.skills.map((skill) => (
            <li key={skill.name}>
              <Badge variant="secondary">{skill.name}</Badge>
              <p className="mt-1 text-sm leading-6">{skill.description}</p>
              <SchemaSummary skill={skill} />
            </li>
          ))}
        </ul>
      </section>
      <section className="sheet min-w-0 p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{t.profile.forModels}</p>
        <CopyField hint={agent.available ? t.profile.discoveryOn : t.profile.discoveryOff} label={t.copy.discovery} value={directory} />
        <CopyField label={t.copy.person} value={endpoint} />
        <CopyField hint={t.profile.mcpHint} label={t.copy.mcp} value={origin ? `${origin}/api/mcp` : ""} />
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.profile.send}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={!sample}
          onClick={() => {
            void navigator.clipboard.writeText(sample).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }}
        >
          {copied ? t.copy.callCopied : t.copy.call}
        </Button>
        {card ? (
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-[#1c1915] p-4 text-xs leading-5 text-[#f7f1e4]">
            {JSON.stringify(card, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  )
}
