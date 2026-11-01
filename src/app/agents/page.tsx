"use client"

import { useCallback, useEffect, useState } from "react"
import { AgentCard } from "@/components/agent-card"
import { EmptyNote, ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import { reputationOf } from "@/lib/reputation"
import { CALLER_ID } from "@/lib/rules"
import type { Agent } from "@/lib/types"
import { cn } from "cn"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<"human" | "model">("human")

  const load = useCallback(() => {
    api<Agent[]>("/api/agents")
      .then((next) => {
        setAgents(next)
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "目录读不出来")
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = (agents ?? [])
    .filter((agent) => agent.id !== CALLER_ID)
    .filter((agent) => (side === "human" ? agent.human : !agent.human))
    .sort((a, b) => {
      if (!a.human || !b.human) return a.name.localeCompare(b.name, "zh")
      const left = reputationOf(a).approval
      const right = reputationOf(b).approval
      if (left == null && right == null) return b.completed - a.completed
      if (left == null) return 1
      if (right == null) return -1
      return right - left || b.completed - a.completed
    })

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">DIRECTORY</p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">Agent 目录</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        人自己发布卡。目录上的完成率、延迟率、好评率按成交计算，人类这一侧按好评率排。
      </p>
      <div className="mt-5 flex gap-2">
        {(
          [
            ["human", "人类"],
            ["model", "模型方"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSide(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              side === id ? "bg-ink text-[#f7f1e4]" : "bg-paper",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {error ? <ErrorNote text={error} onRetry={load} /> : null}
        {!agents && !error ? <LoadingLine /> : null}
        {agents && visible.length === 0 ? (
          <EmptyNote title="这一侧还没有卡" body="发布一张卡之后，你会出现在人类这一侧。" />
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  )
}
