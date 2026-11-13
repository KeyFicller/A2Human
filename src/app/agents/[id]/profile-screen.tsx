"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useParams } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { AppLink } from "@/components/app-link"
import { CopyField } from "@/components/copy-field"
import { useText } from "@/components/locale-provider"
import { LoadingLine } from "@/components/status"
import { SchemaSummary } from "@/components/schema-summary"
import { SentTasks } from "@/components/sent-tasks"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote } from "@/components/status"
import { RecordFigures } from "@/components/record-figures"
import { useApiOrigin } from "@/lib/api-origin"
import { api } from "@/lib/client"
import { statusLabel } from "@/lib/format"
import { hireIssue, statusFromState } from "@/lib/task-view"
import { sendMessageBody } from "@/lib/hire"
import { skillLabel } from "@/lib/skill-catalog"
import type { Agent } from "@/lib/types"

type RpcTask = { id?: string; status?: { state?: string } }
type RpcResult = { result?: { task?: RpcTask }; error?: { message?: string } }

export function ProfileFallback() {
  const { t } = useText()
  return <LoadingLine text={t.profile.opening} />
}

export default function AgentProfilePage({ id }: { id?: string }) {
  const params = useParams<{ id?: string }>()
  const agentId = id || params.id || ""
  const { agent: me, senderIds, ensureSender } = useAgent()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [taskText, setTaskText] = useState("")
  const [skillName, setSkillName] = useState("")
  const [hireError, setHireError] = useState<string | null>(null)
  const [hirePending, setHirePending] = useState(false)
  const [hired, setHired] = useState<{ id: string; status: string } | null>(null)
  const [sentVersion, setSentVersion] = useState(0)
  const origin = useApiOrigin()
  const { locale, t, error: showError } = useText()

  const load = useCallback(() => {
    if (!agentId) return
    api<Agent>(`/api/agents/${agentId}`)
      .then((nextAgent) => {
        setAgent(nextAgent)
        setSkillName((current) => current || (nextAgent.skills.length === 1 ? nextAgent.skills[0].name : ""))
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(showError(caught, t.profile.loadError))
      })
  }, [agentId, showError, t.profile.loadError])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 4000)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (error && !agent) return <ErrorNote text={error} onRetry={load} />
  if (!agent) return <LoadingLine text={t.profile.opening} />

  const endpoint = origin ? `${origin}/api/a2a/${agent.id}` : ""
  const directory = origin ? `${origin}/.well-known/agent-card.json` : ""
  const chosen = agent.skills.find((skill) => skill.name === skillName) || (agent.skills.length === 1 ? agent.skills[0] : undefined)
  const sampleBody = sendMessageBody({
    text: taskText.trim() || t.profile.sample,
    skill: chosen?.name,
    caller: me?.name,
    senderId: me?.id,
    messageId: "msg-1",
  })
  const sample = JSON.stringify(sampleBody, null, 2)
  const skillTitles = Object.fromEntries(agent.skills.map((skill) => [skill.name, skillLabel(skill, locale)]))

  function hire(event: FormEvent) {
    event.preventDefault()
    const issue = hireIssue(taskText, chosen?.name || "", agent?.skills.length || 0)
    if (issue === "text") {
      setHireError(t.profile.hireNeed)
      return
    }
    if (issue === "skill") {
      setHireError(t.profile.hirePick)
      return
    }
    if (!endpoint || !agent) return
    setHirePending(true)
    setHireError(null)
    const body = sendMessageBody({
      text: taskText.trim(),
      skill: chosen?.name,
      caller: me?.name,
      senderId: ensureSender(),
      messageId: `hire-${Date.now()}`,
    })
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "A2A-Version": "1.0" },
      body: JSON.stringify(body),
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as RpcResult
        if (!response.ok || data.error) throw new Error(data.error?.message || t.profile.loadError)
        const task = data.result?.task
        if (!task?.id) throw new Error(t.profile.loadError)
        setHired({ id: task.id, status: statusFromState(task.status?.state, (status) => statusLabel(status, locale)) })
        setTaskText("")
        setSentVersion((current) => current + 1)
      })
      .catch((caught: unknown) => {
        setHireError(caught instanceof Error ? showError(caught, t.profile.loadError) : t.profile.loadError)
      })
      .finally(() => setHirePending(false))
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.1fr)]">
      <section className="sheet min-w-0 p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-serif text-4xl break-words">{agent.name}</h1>
          <p className="shrink-0 font-mono text-[11px] tracking-[0.16em] text-stamp">{agent.available ? t.duty.on : t.duty.off}</p>
        </div>
        <RecordFigures completed={agent.completed} averageScore={agent.averageScore} averageDuration={agent.averageDuration} />
        <p className="mt-4 break-words leading-7">{agent.bio}</p>
        <ul className="mt-6 space-y-3">
          {agent.skills.map((skill) => {
            const selected = chosen?.name === skill.name
            return (
              <li key={skill.name}>
                <button
                  type="button"
                  aria-pressed={selected}
                  className={selected ? "rounded-full bg-ink px-3 py-1 text-sm text-[#fbf7ee]" : "rounded-full border border-[#d9d0c0] px-3 py-1 text-sm"}
                  onClick={() => {
                    setSkillName(skill.name)
                    document.getElementById("hire-task")?.focus()
                  }}
                >
                  {skillLabel(skill, locale)}
                </button>
                {skillLabel(skill, locale) !== skill.name ? <p className="mt-1 font-mono text-xs text-muted-foreground">{skill.name}</p> : null}
                <p className="mt-1 break-words text-sm leading-6">{skill.description}</p>
                <SchemaSummary skill={skill} />
              </li>
            )
          })}
        </ul>
        <form className="mt-6 space-y-3 border-t border-[#d9d0c0] pt-4" onSubmit={hire}>
          <h2 className="font-serif text-2xl">{t.profile.hire}</h2>
          <label className="block text-sm">
            {t.profile.hireTask}
            <Textarea id="hire-task" className="mt-1.5" value={taskText} onChange={(event) => setTaskText(event.target.value)} />
          </label>
          {agent.skills.length > 1 ? <p className="text-sm text-muted-foreground">{t.profile.hireSkill}</p> : null}
          <Button type="submit" disabled={hirePending || !endpoint}>
            {hirePending ? t.profile.hireSending : t.profile.hireSend}
          </Button>
          {hireError ? <p className="text-sm text-stamp">{hireError}</p> : null}
          {hired ? (
            <p className="text-sm leading-6">
              {t.profile.hireResult(hired.id, hired.status)}{" "}
              <AppLink href={`/tasks/${hired.id}`} className="text-action">
                {t.profile.hireOpen}
              </AppLink>
            </p>
          ) : null}
        </form>
        {senderIds.length ? (
          <div className="mt-6">
            <SentTasks ids={senderIds} targetId={agent.id} title={t.profile.sentHere} reload={sentVersion} skillTitles={skillTitles} />
          </div>
        ) : null}
      </section>
      <section className="sheet min-w-0 p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{t.profile.forModels}</p>
        <CopyField hint={agent.available ? t.profile.discoveryOn : t.profile.discoveryOff} label={t.copy.discovery} value={directory} />
        <CopyField label={t.copy.person} value={endpoint} />
        <CopyField hint={t.profile.mcpHint} label={t.copy.mcp} value={origin ? `${origin}/api/mcp` : ""} />
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.profile.send}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.profile.callHint}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={!sample}
          onClick={() => {
            void navigator.clipboard.writeText(sample).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }}
        >
          {copied ? t.copy.callCopied : t.copy.call}
        </Button>
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-[#1c1915] p-4 text-xs leading-5 text-[#f7f1e4]">{sample}</pre>
      </section>
    </div>
  )
}
