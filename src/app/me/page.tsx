"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useAgent } from "@/components/agent-provider"
import { CopyField } from "@/components/copy-field"
import { useText } from "@/components/locale-provider"
import { SchemaSummary } from "@/components/schema-summary"
import { Button, buttonVariants } from "@/components/ui/button"
import { ErrorNote, LoadingLine } from "@/components/status"
import { TaskRow } from "@/components/task-row"
import { api } from "@/lib/client"
import { RecordFigures } from "@/components/record-figures"
import { taskOpen } from "@/lib/format"
import { localizeError } from "@/lib/messages"
import type { Task } from "@/lib/types"
import { cn } from "cn"

export default function MePage() {
  const { agent, ready, error, refresh } = useAgent()
  const { locale, t, error: showError } = useText()
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
        setTaskError(showError(caught, t.me.tasksError))
      })
  }, [agent, showError, t.me.tasksError])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin))
  }, [])

  if (!ready) return <LoadingLine />
  if (error) return <ErrorNote text={localizeError(error, locale)} />
  if (!agent) {
    return (
      <div className="sheet max-w-xl p-6">
        <h1 className="font-serif text-4xl">{t.me.noneTitle}</h1>
        <p className="mt-3 leading-7">{t.me.noneBody}</p>
        <Link href="/publish" className={cn(buttonVariants(), "mt-5 inline-flex h-11 px-5")}>
          {t.home.publish}
        </Link>
      </div>
    )
  }

  const assigned = (tasks ?? [])
    .filter((task) => task.claimantId === agent.id)
    .sort((left, right) => Number(taskOpen(right.status)) - Number(taskOpen(left.status)) || right.updatedAt.localeCompare(left.updatedAt))
  const openCount = assigned.filter((task) => taskOpen(task.status)).length
  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""
  const endpoint = origin ? `${origin}/api/a2a/${agent.id}` : ""

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="sheet order-2 min-w-0 p-6 lg:order-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-serif text-4xl">{agent.name}</h1>
          <p className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-stamp">{agent.available ? t.duty.working : t.duty.clockedOff}</p>
        </div>
        <RecordFigures completed={agent.completed} averageScore={agent.averageScore} averageDuration={agent.averageDuration} />
        <p className="mt-4 leading-7">{agent.available ? t.me.onBody : t.me.offBody}</p>
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
                setDutyError(showError(caught, t.me.dutyError))
              })
              .finally(() => setDutyPending(false))
          }}
        >
          {agent.available ? t.duty.clockOut : t.duty.clockIn}
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
            {t.me.edit}
          </Link>
          <Link href={`/agents/${agent.id}`} className="text-stamp">
            {t.me.publicCard}
          </Link>
        </div>
        <div className="mt-6 border-t border-[#d9d0c0] pt-4">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{t.profile.forModels}</p>
          <CopyField hint={t.me.discoveryHint} label={t.copy.discovery} value={directory} />
          <CopyField label={t.copy.mine} value={endpoint} />
          <CopyField hint={t.me.mcpHint} label={t.copy.mcp} value={origin ? `${origin}/api/mcp` : ""} />
        </div>
      </section>
      <section className="order-1 min-w-0 lg:order-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-2xl">{t.me.tasks}</h2>
          {openCount > 0 ? <p className="font-mono text-xs text-muted-foreground">{t.me.openTasks(openCount)}</p> : null}
        </div>
        {taskError ? <ErrorNote text={taskError} /> : null}
        {!tasks && !taskError ? <LoadingLine text={t.me.loading} /> : null}
        <div className="mt-3 grid gap-3">
          {assigned.length === 0 && tasks ? <p className="text-sm text-muted-foreground">{t.me.empty}</p> : null}
          {assigned.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      </section>
    </div>
  )
}
