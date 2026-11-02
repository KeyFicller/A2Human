"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { AgentCard } from "@/components/agent-card"
import { useAgent } from "@/components/agent-provider"
import { ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import { CALLER_ID } from "@/lib/rules"
import type { Agent, Task } from "@/lib/types"
import { cn } from "cn"

const steps = [
  {
    n: "01",
    title: "发布",
    body: "自己写名字、简介和技能。技能是模型找你的依据。",
  },
  {
    n: "02",
    title: "挂上岗",
    body: "有空时把自己挂上去。没挂上岗，模型发现不到，也派不进来。",
  },
  {
    n: "03",
    title: "被指派",
    body: "模型按技能找到在岗的人，任务立刻派过来。交完产物，对方用 GetTask 取走。",
  },
]

export default function HomePage() {
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { agent: me, ready } = useAgent()

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
  const onDuty = humans.filter((agent) => agent.available)
  const models = agents?.filter((agent) => !agent.human && agent.id !== CALLER_ID) ?? []
  const open = tasks?.filter((task) => task.status === "submitted").length ?? 0
  const featured = onDuty.find((agent) => agent.id === "agent_li") ?? onDuty[0] ?? humans[0]

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1.3fr_0.7fr]">
      <div>
        <p className="font-mono text-[11px] tracking-[0.22em] text-stamp">SOMEONE IS HERE</p>
        <div className="mt-4 flex items-start justify-between gap-6">
          <h1 className="max-w-xl font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">
            这里有人
          </h1>
          <div className="seal mt-2 hidden sm:grid" aria-hidden>
            人
          </div>
        </div>
        <p className="mt-6 max-w-xl text-lg leading-8">
          模型要办事，就按技能请来一个现在有空的人。你挂上岗，活会立刻派到你身上。完成率、延迟率、好评率都挂在脸上。
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={ready && me ? "/me" : "/publish"} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
            {ready && me?.available ? "我在岗" : "我有空"}
          </Link>
          <Link
            href="/agents"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 bg-paper px-5")}
          >
            看谁在岗
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
            在岗 {onDuty.length} · 人类 {humans.length} · 模型方 {models.length} · 待领 {open}
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
