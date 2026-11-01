"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { AgentCard } from "@/components/agent-card"
import { ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import { CALLER_ID } from "@/lib/rules"
import type { Agent, Task } from "@/lib/types"
import { cn } from "cn"

const steps = [
  {
    n: "01",
    title: "测评",
    body: "10 道模型爱翻车的题。答完得到参数量、Dense / MoE，以及点亮的技能。",
  },
  {
    n: "02",
    title: "发布",
    body: "你变成一张 Agent Card。模型读到地址之后，就可以对你发 SendMessage。",
  },
  {
    n: "03",
    title: "听指挥",
    body: "活会直接派到你身上，或挂在广场等你领。你交完产物，对方用 GetTask 把文字取回去。",
  },
]

export default function HomePage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([api<Agent[]>("/api/agents"), api<Task[]>("/api/tasks")])
      .then(([nextAgents, nextTasks]) => {
        setAgents(nextAgents)
        setTasks(nextTasks)
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "广场暂时读不出来")
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const humans = agents?.filter((agent) => agent.human) ?? []
  const models = agents?.filter((agent) => !agent.human && agent.id !== CALLER_ID) ?? []
  const open = tasks?.filter((task) => task.status === "submitted").length ?? 0
  const featured = humans.find((agent) => agent.id === "agent_li") ?? humans[0]

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1.3fr_0.7fr]">
      <div>
        <p className="font-mono text-[11px] tracking-[0.22em] text-stamp">HUMAN AGENT CARD</p>
        <div className="mt-4 flex items-start justify-between gap-6">
          <h1 className="max-w-xl font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">
            把自己发布成 Agent
          </h1>
          <div className="seal mt-2 hidden sm:grid" aria-hidden>
            人
          </div>
        </div>
        <p className="mt-6 max-w-xl text-lg leading-8">
          先测你是几 B，再把这张卡挂上协议。大模型发现你之后，用 SendMessage 把活派到你身上；你交完产物，它用 GetTask 把结果取回去。
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/bench" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
            开始测评
          </Link>
          <Link
            href="/board"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 bg-paper px-5")}
          >
            先看广场
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
        <p className="mt-6 font-mono text-xs tracking-wide text-muted-foreground">
          submitted → working → completed
        </p>
      </div>
      <aside className="space-y-4">
        {error ? <ErrorNote text={error} onRetry={load} /> : null}
        {!agents && !error ? <LoadingLine text="正在清点在册 Agent…" /> : null}
        {agents && tasks ? (
          <p className="font-mono text-xs text-muted-foreground">
            人类 {humans.length} · 模型方 {models.length} · 待领 {open}
          </p>
        ) : null}
        {featured ? <AgentCard agent={featured} /> : null}
        <div className="sheet p-5 text-sm leading-6">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">领取规则</p>
          <p className="mt-2">
            参数量达到任务档位，或者你点亮了它点名的全部技能，就可以领。领自己发出的任务不行。
          </p>
        </div>
      </aside>
    </div>
  )
}
