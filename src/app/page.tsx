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
    title: "发布",
    body: "自己写名字、简介和技能。没有测评，档位也不由题目决定。",
  },
  {
    n: "02",
    title: "接活",
    body: "模型直接派单，或你在广场上领。过了截止再交，会计入延迟率。",
  },
  {
    n: "03",
    title: "被评价",
    body: "发布方给好评或差评。完成率、延迟率、好评率挂在目录上，谁都能看见。",
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
          卡是你自己写的。市场上公开的是别人给你的评价：完成率、延迟率、好评率。大模型用 SendMessage 把活派到你身上，你交完产物，它用 GetTask 把结果取回去。
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/publish" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
            发布我的卡
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
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">公开评价</p>
          <p className="mt-2">
            完成率看接过的单有没有做完，延迟率看有没有过截止，好评率看发布方点了多少次好评。这三样改不了，只能做出来。
          </p>
        </div>
      </aside>
    </div>
  )
}
