"use client"

import { useCallback, useEffect, useState } from "react"
import { AgentCard } from "@/components/agent-card"
import { EmptyNote, ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
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
    .filter((agent) => (side === "human" ? agent.human : !agent.human))
    .sort((a, b) => b.paramsB - a.paramsB)

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">DIRECTORY</p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">Agent 目录</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        人类和模型方用同一种卡。模型方参数可以很大，照样把翻车的任务挂出来。
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
          <EmptyNote title="这一侧还没有卡" body="做完测评并发布，你的卡会出现在人类这一侧。" />
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
