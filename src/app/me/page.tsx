"use client"

import { useCallback, useEffect, useState } from "react"
import { useAgent } from "@/components/agent-provider"
import { AppLink } from "@/components/app-link"
import { CopyField } from "@/components/copy-field"
import { useText } from "@/components/locale-provider"
import { SchemaSummary } from "@/components/schema-summary"
import { Button, buttonVariants } from "@/components/ui/button"
import { ErrorNote, LoadingLine } from "@/components/status"
import { SentTasks } from "@/components/sent-tasks"
import { TaskRow } from "@/components/task-row"
import { useApiOrigin } from "@/lib/api-origin"
import { PUBLISHED_KEY, api } from "@/lib/client"
import { RecordFigures } from "@/components/record-figures"
import { formatWhen } from "@/lib/format"
import { handedOff, needsWorker, sentBy } from "@/lib/task-view"
import { cachedTasks, rememberTasks } from "@/lib/inbox-cache"
import { localizeError } from "@/lib/messages"
import { skillLabel } from "@/lib/skill-catalog"
import type { Task } from "@/lib/types"
import { cn } from "cn"

export default function MePage() {
  const { agent, ready, identity, error, refresh, adopt, senderIds } = useAgent()
  const { locale, t, error: showError } = useText()
  const [tasks, setTasks] = useState<Task[] | null>(() => cachedTasks(agent?.id))
  const [taskError, setTaskError] = useState<string | null>(null)
  const [dutyError, setDutyError] = useState<string | null>(null)
  const [dutyPending, setDutyPending] = useState(false)
  const [askingOff, setAskingOff] = useState(false)
  const [updated, setUpdated] = useState<number | null>(null)
  const [published, setPublished] = useState(false)
  const origin = useApiOrigin()

  const load = useCallback(() => {
    if (!agent) return
    api<Task[]>("/api/tasks")
      .then((next) => {
        setTasks(next)
        rememberTasks(agent.id, next)
        setUpdated(Date.now())
        setTaskError(null)
      })
      .catch((caught: unknown) => {
        setTaskError(showError(caught, t.me.tasksError))
      })
  }, [agent, showError, t.me.tasksError])

  useEffect(() => {
    const cached = cachedTasks(agent?.id)
    if (cached) setTasks(cached)
  }, [agent?.id])

  useEffect(() => {
    if (sessionStorage.getItem(PUBLISHED_KEY) !== "1") return
    sessionStorage.removeItem(PUBLISHED_KEY)
    setPublished(true)
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  if (!ready || identity === "unknown") return <LoadingLine text={t.me.loading} />
  if (error) return <ErrorNote text={localizeError(error, locale)} />
  if (!agent) {
    return (
      <div className="sheet max-w-xl p-6">
        <h1 className="font-serif text-4xl">{t.me.noneTitle}</h1>
        <p className="mt-3 leading-7">{t.me.noneBody}</p>
        <AppLink href="/publish" className={cn(buttonVariants(), "mt-5 inline-flex h-11 px-5")}>
          {t.home.publish}
        </AppLink>
        {senderIds.length ? (
          <div className="mt-8">
            <SentTasks ids={senderIds} title={t.me.sent} />
          </div>
        ) : null}
      </div>
    )
  }

  const assigned = (tasks ?? [])
    .filter((task) => task.claimantId === agent.id)
    .sort((left, right) => Number(needsWorker(right)) - Number(needsWorker(left)) || right.updatedAt.localeCompare(left.updatedAt))
  const openCount = assigned.filter((task) => needsWorker(task)).length
  const delivered = assigned.filter((task) => task.status === "completed" || handedOff(task))
  const scores = delivered.flatMap((task) => (typeof task.workScore === "number" ? [task.workScore] : []))
  const averageScore = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : tasks ? null : agent.averageScore
  const skillTitles = Object.fromEntries(agent.skills.map((skill) => [skill.name, skillLabel(skill, locale)]))
  const sent = sentBy(tasks ?? [], senderIds)
  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""

  function switchDuty(available: boolean) {
    if (!agent) return
    setDutyPending(true)
    api<NonNullable<typeof agent>>(`/api/agents/${agent.id}`, { available })
      .then((next) => {
        // Show the new state at once; the card read and the task list catch up behind it.
        adopt({ ...agent, ...next })
        setDutyError(null)
        setAskingOff(false)
        load()
        void refresh()
      })
      .catch((caught: unknown) => {
        setDutyError(showError(caught, t.me.dutyError))
      })
      .finally(() => setDutyPending(false))
  }
  const endpoint = origin ? `${origin}/api/a2a/${agent.id}` : ""

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="sheet order-2 min-w-0 p-6 lg:order-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-serif text-4xl break-words">{agent.name}</h1>
          <p className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-stamp">{agent.available ? t.duty.working : t.duty.clockedOff}</p>
        </div>
        <RecordFigures
          completed={tasks ? delivered.length : agent.completed}
          averageScore={averageScore}
          averageDuration={agent.averageDuration}
        />
        {published ? <p className="mt-4 leading-7 text-moss">{t.me.published}</p> : null}
        <p className="mt-4 leading-7">{agent.available ? t.me.onBody : t.me.offBody}</p>
        {askingOff ? (
          <div className="mt-4 rounded-xl border border-dashed border-stamp px-4 py-3" role="alertdialog" aria-label={t.duty.clockOutAsk}>
            <p className="text-sm leading-6">{t.duty.clockOutAsk}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" disabled={dutyPending} onClick={() => switchDuty(false)}>
                {t.duty.clockOutYes}
              </Button>
              <Button type="button" variant="outline" disabled={dutyPending} onClick={() => setAskingOff(false)}>
                {t.duty.clockOutNo}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            className="mt-4"
            disabled={dutyPending}
            onClick={() => (agent.available ? setAskingOff(true) : switchDuty(true))}
          >
            {agent.available ? t.duty.clockOut : t.duty.clockIn}
          </Button>
        )}
        {dutyError ? <p className="mt-3 text-sm text-stamp">{dutyError}</p> : null}
        <p className="mt-4 break-words leading-7">{agent.bio}</p>
        <ul className="mt-6 space-y-3">
          {agent.skills.map((skill) => (
            <li key={skill.name}>
              <p className="font-serif text-xl break-words">{skillLabel(skill, locale)}</p>
              {skillLabel(skill, locale) !== skill.name ? <p className="font-mono text-xs text-muted-foreground">{t.me.toolId(skill.name)}</p> : null}
              <p className="text-sm leading-6 break-words text-muted-foreground">{skill.description}</p>
              <SchemaSummary skill={skill} />
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <AppLink href="/publish" className="text-action">
            {t.me.edit}
          </AppLink>
          <AppLink href={`/agents/${agent.id}`} className="text-action">
            {t.me.publicCard}
          </AppLink>
        </div>
        <div className="mt-6 border-t border-[#d9d0c0] pt-4">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{t.profile.forModels}</p>
          <CopyField hint={t.me.discoveryHint} label={t.copy.discovery} value={directory} />
          <CopyField label={t.copy.mine} value={endpoint} />
          <CopyField hint={t.me.mcpHint} label={t.copy.mcp} value={origin ? `${origin}/api/mcp` : ""} />
        </div>
      </section>
      <section className="order-1 min-w-0 lg:order-2">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-2xl">{t.me.tasks}</h2>
          <div className="flex items-center gap-3">
            {openCount > 0 ? <p className="font-mono text-xs text-muted-foreground">{t.me.openTasks(openCount)}</p> : null}
            <button type="button" className="text-sm text-action" onClick={load}>
              {t.me.refresh}
            </button>
          </div>
        </div>
        {updated ? <p className="mt-1 font-mono text-xs text-muted-foreground">{t.me.updated(formatWhen(new Date(updated).toISOString(), locale))}</p> : null}
        {taskError ? <ErrorNote text={taskError} /> : null}
        {!tasks && !taskError ? <LoadingLine text={t.me.loading} /> : null}
        <div className="mt-3 grid gap-3">
          {assigned.length === 0 && tasks ? <p className="text-sm text-muted-foreground">{t.me.empty}</p> : null}
          {assigned.map((task) => (
            <TaskRow key={task.id} task={task} skillTitles={skillTitles} />
          ))}
        </div>
        <div className="mt-8">
          <h2 className="font-serif text-2xl">{t.me.sent}</h2>
          <div className="mt-3 grid gap-3">
            {sent.length === 0 && tasks ? <p className="text-sm text-muted-foreground">{t.me.sentEmpty}</p> : null}
            {sent.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
