"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { CopyField } from "@/components/copy-field"
import { SchemaSummary } from "@/components/schema-summary"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import type { Agent } from "@/lib/types"

export default function AgentProfilePage() {
  const params = useParams<{ id: string }>()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [card, setCard] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState("")

  const load = useCallback(() => {
    Promise.all([api<Agent>(`/api/agents/${params.id}`), api<unknown>(`/api/a2a/${params.id}`)])
      .then(([nextAgent, nextCard]) => {
        setAgent(nextAgent)
        setCard(nextCard)
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "这张卡读不出来")
      })
  }, [params.id])

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
            parts: [{ text: "请按你的技能完成这件事。" }],
          },
        },
      }).replaceAll("'", "'\\'")}'`
    : ""

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)]">
      <section className="sheet min-w-0 p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">
          {agent.available ? "在岗" : "不在岗"}
        </p>
        <h1 className="mt-4 font-serif text-4xl">{agent.name}</h1>
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
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">给模型</p>
        <CopyField
          hint={
            agent.available
              ? "发现入口接上所有在岗的人。下面这个地址只接收派给这个人的任务。"
              : "这个人还没上工，发现入口里没有。上工之后，模型才能从名单里选到。"
          }
          label="复制发现入口"
          value={directory}
        />
        <CopyField label="复制这个人的地址" value={endpoint} />
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          SendMessage 打到这个人的地址，configuration.returnImmediately 为 true。人交完产物后，用 GetTask 取回。
        </p>
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
          {copied ? "已复制调用" : "复制一条调用"}
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
