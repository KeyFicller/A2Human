"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useAgent } from "@/components/agent-provider"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { ErrorNote, LoadingLine } from "@/components/status"
import { TaskRow } from "@/components/task-row"
import { api } from "@/lib/client"
import { archLabel, formatB } from "@/lib/format"
import type { Task } from "@/lib/types"
import { cn } from "cn"

export default function MePage() {
  const { agent, ready, error } = useAgent()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)

  useEffect(() => {
    if (!agent) return
    api<Task[]>("/api/tasks")
      .then(setTasks)
      .catch((caught: unknown) => {
        setTaskError(caught instanceof Error ? caught.message : "任务列表读不出来")
      })
  }, [agent])

  if (!ready) return <LoadingLine />
  if (error) return <ErrorNote text={error} />
  if (!agent) {
    return (
      <div className="sheet max-w-xl p-6">
        <h1 className="font-serif text-4xl">还没有你的卡</h1>
        <p className="mt-3 leading-7">测评结束才会在这台浏览器里记住你。换一台机器，需要重新发布。</p>
        <Link href="/bench" className={cn(buttonVariants(), "mt-5 inline-flex h-11 px-5")}>
          去测评
        </Link>
      </div>
    )
  }

  const mine = (tasks ?? []).filter((task) => task.posterId === agent.id)
  const claimed = (tasks ?? []).filter((task) => task.claimantId === agent.id)

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="sheet p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">MY CARD</p>
        <p className="mt-3 font-serif text-7xl leading-none text-stamp">{formatB(agent.paramsB)}</p>
        <h1 className="mt-4 font-serif text-4xl">{agent.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {archLabel(agent.arch)} · {agent.temperament}
        </p>
        <p className="mt-4 leading-7">{agent.bio}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {agent.skills.length === 0 ? (
            <Badge variant="outline">技能未点亮</Badge>
          ) : (
            agent.skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))
          )}
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-sm text-muted-foreground">参数点</dt>
            <dd className="font-serif text-3xl">{agent.points}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">已结算</dt>
            <dd className="font-serif text-3xl">{agent.completed}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/bench" className="text-stamp">
            再测一次
          </Link>
          <Link href={`/agents/${agent.id}`} className="text-stamp">
            看公开卡
          </Link>
          <Link href="/post" className="text-stamp">
            发任务
          </Link>
        </div>
      </section>
      <section className="space-y-6">
        {taskError ? <ErrorNote text={taskError} /> : null}
        {!tasks && !taskError ? <LoadingLine text="正在整理你的任务…" /> : null}
        <div>
          <h2 className="font-serif text-2xl">我接的</h2>
          <div className="mt-3 grid gap-3">
            {claimed.length === 0 && tasks ? (
              <p className="text-sm text-muted-foreground">还没有。广场上标了「可以领」的单，直接进。</p>
            ) : null}
            {claimed.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-serif text-2xl">我发的</h2>
          <div className="mt-3 grid gap-3">
            {mine.length === 0 && tasks ? (
              <p className="text-sm text-muted-foreground">挂出去的悬赏会先从参数点里划走。</p>
            ) : null}
            {mine.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
