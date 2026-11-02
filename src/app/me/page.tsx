"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useAgent } from "@/components/agent-provider"
import { CopyField } from "@/components/copy-field"
import { SchemaSummary } from "@/components/schema-summary"
import { Button, buttonVariants } from "@/components/ui/button"
import { ErrorNote, LoadingLine } from "@/components/status"
import { TaskRow } from "@/components/task-row"
import { api } from "@/lib/client"
import { recordLine } from "@/lib/format"
import type { Task } from "@/lib/types"
import { cn } from "cn"

export default function MePage() {
  const { agent, ready, error, refresh } = useAgent()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [dutyError, setDutyError] = useState<string | null>(null)
  const [dutyPending, setDutyPending] = useState(false)
  const [origin, setOrigin] = useState("")

  const load = useCallback(() => {
    if (!agent) return
    api<Task[]>("/api/tasks")
      .then((next) => {
        setTasks(next)
        setTaskError(null)
      })
      .catch((caught: unknown) => {
        setTaskError(caught instanceof Error ? caught.message : "任务列表读不出来")
      })
  }, [agent])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin))
  }, [])

  if (!ready) return <LoadingLine />
  if (error) return <ErrorNote text={error} />
  if (!agent) {
    return (
      <div className="sheet max-w-xl p-6">
        <h1 className="font-serif text-4xl">还没有你的卡</h1>
        <p className="mt-3 leading-7">这台浏览器还没有记住你的卡。换一台机器，需要重新发布。</p>
        <Link href="/publish" className={cn(buttonVariants(), "mt-5 inline-flex h-11 px-5")}>
          发布我的卡
        </Link>
      </div>
    )
  }

  const assigned = (tasks ?? []).filter((task) => task.claimantId === agent.id)
  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""
  const endpoint = origin ? `${origin}/api/a2a/${agent.id}` : ""

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="sheet p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">
          {agent.available ? "上工中" : "没上工"}
        </p>
        <h1 className="mt-4 font-serif text-4xl">{agent.name}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{recordLine(agent.completed, agent.averageScore, agent.averageDuration)}</p>
        <p className="mt-4 leading-7">
          {agent.available
            ? "模型可以在发现名单里看到你，并把任务派到你的地址。"
            : "还没上工。上工之后，模型才发现得到你。"}
        </p>
        <Button
          type="button"
          className="mt-4"
          disabled={dutyPending}
          onClick={() => {
            setDutyPending(true)
            api<typeof agent>(`/api/agents/${agent.id}`, { available: !agent.available })
              .then(() => refresh())
              .then(() => setDutyError(null))
              .catch((caught: unknown) => {
                setDutyError(caught instanceof Error ? caught.message : "在岗状态没改成")
              })
              .finally(() => setDutyPending(false))
          }}
        >
          {agent.available ? "收工" : "上工"}
        </Button>
        {dutyError ? <p className="mt-3 text-sm text-stamp">{dutyError}</p> : null}
        <p className="mt-4 leading-7">{agent.bio}</p>
        <ul className="mt-6 space-y-3">
          {agent.skills.map((skill) => (
            <li key={skill.name}>
              <p className="font-serif text-xl">{skill.name}</p>
              <p className="text-sm leading-6 text-muted-foreground">{skill.description}</p>
              <SchemaSummary skill={skill} />
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/publish" className="text-stamp">
            改我的卡
          </Link>
          <Link href={`/agents/${agent.id}`} className="text-stamp">
            看公开卡
          </Link>
        </div>
        <div className="mt-6 border-t border-[#d9d0c0] pt-4">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">给模型</p>
          <CopyField
            hint="LangGraph 读发现入口，一次接上所有在岗的人。你自己的地址只接收派给你的任务。"
            label="复制发现入口"
            value={directory}
          />
          <CopyField label="复制我的地址" value={endpoint} />
          <CopyField
            hint="只会 MCP 的客户端用这个备用入口。会 A2A 的仍读发现入口，再把任务派到你自己的地址。"
            label="复制 MCP 备用入口"
            value={origin ? `${origin}/api/mcp` : ""}
          />
        </div>
      </section>
      <section>
        <h2 className="font-serif text-2xl">派来的任务</h2>
        {taskError ? <ErrorNote text={taskError} /> : null}
        {!tasks && !taskError ? <LoadingLine text="正在整理你的任务…" /> : null}
        <div className="mt-3 grid gap-3">
          {assigned.length === 0 && tasks ? (
            <p className="text-sm text-muted-foreground">还没有。上工之后，模型会把对得上的任务派到这里。</p>
          ) : null}
          {assigned.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      </section>
    </div>
  )
}
