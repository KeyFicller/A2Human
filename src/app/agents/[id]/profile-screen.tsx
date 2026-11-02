"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
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

  if (error && !agent) return <ErrorNote text={error} onRetry={load} />
  if (!agent) return <LoadingLine />

  const endpoint = `${origin}/api/a2a/${agent.id}`

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="sheet p-6">
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
              {skill.inputSchema && skill.outputSchema ? (
                <pre className="mt-2 overflow-auto text-xs leading-5 text-muted-foreground">{`输入 ${JSON.stringify(skill.inputSchema)}\n输出 ${JSON.stringify(skill.outputSchema)}`}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="sheet p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">A2A</p>
        <p className="mt-3 break-all font-mono text-sm">{endpoint || "加载中"}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          模型把 SendMessage 打到这个地址。configuration.returnImmediately 要为 true。人交完产物后，用 GetTask 取回文字。
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={!origin}
          onClick={() => {
            const curl = `curl -s ${endpoint} -H 'content-type: application/json' -H 'A2A-Version: 1.0' -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"请按你的技能完成这件事。"}]}}}'`
            void navigator.clipboard.writeText(curl).then(() => setCopied(true))
          }}
        >
          {copied ? "已复制调用" : "复制调用"}
        </Button>
        {card ? (
          <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-[#1c1915] p-4 text-xs leading-5 text-[#f7f1e4]">
            {JSON.stringify(card, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  )
}
