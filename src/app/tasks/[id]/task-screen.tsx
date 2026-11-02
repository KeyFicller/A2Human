"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { useText } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote, LoadingLine } from "@/components/status"
import { ApiError, api } from "@/lib/client"
import { formatWhen, kindLabel, statusLabel, taskOpen } from "@/lib/format"
import { SchemaSummary } from "@/components/schema-summary"
import { OutputForm } from "@/components/output-form"
import { describeSchema, schemaRequiresImage } from "@/lib/schema-fields"
import type { Agent, ProtocolMessage, Task, TaskImage } from "@/lib/types"

type Detail = {
  task: Task
  messages: ProtocolMessage[]
  claimant?: Agent | null
}

function imageSrc(image: TaskImage) {
  if (image.url) return image.url
  if (image.raw) return `data:${image.mediaType};base64,${image.raw}`
  return ""
}

function shownArtifact(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function Picture({ image, alt, className }: { image: TaskImage; alt: string; className: string }) {
  return (
    // Data URLs and caller-supplied addresses are not next/image sources.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageSrc(image)} alt={alt} className={className} />
  )
}

export function TaskFallback() {
  const { t } = useText()
  return <LoadingLine text={t.task.opening} />
}

export default function TaskScreen() {
  const params = useParams<{ id: string }>()
  const { agent, ready } = useAgent()
  const { locale, t, error: showError } = useText()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [image, setImage] = useState<TaskImage | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [handed, setHanded] = useState(false)
  const [decision, setDecision] = useState<"reject" | "cancel" | "fail" | "input" | null>(null)
  const [reason, setReason] = useState("")

  const load = useCallback(() => {
    api<Detail>(`/api/tasks/${params.id}`)
      .then((next) => {
        setDetail(next)
        setError(null)
        if (next.task.status === "completed") setHanded(false)
      })
      .catch((caught: unknown) => {
        setError(showError(caught, t.task.loadError))
      })
  }, [params.id, showError, t.task.loadError])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  if (!ready || (!detail && !error)) return <LoadingLine text={t.task.opening} />
  if (error && !detail) return <ErrorNote text={error} onRetry={load} />
  if (!detail) return null

  const { task, messages, claimant } = detail
  const mine = agent?.id === task.claimantId
  const named = task.skills.length === 1 ? task.skills[0] : undefined
  const skill = named
    ? claimant?.skills.find((item) => item.name === named)
    : claimant?.skills.length === 1
      ? claimant.skills[0]
      : undefined
  const needsImage = schemaRequiresImage(skill?.outputSchema)
  const stance = [...messages].reverse().find((item) =>
    item.kind === "task.input" || item.kind === "task.scoreRequest" || item.kind === "task.reject" || item.kind === "task.fail" || item.kind === "task.cancel",
  )
  const waitingForScore = task.status === "input-required" && stance?.kind === "task.scoreRequest"
  const answering = (task.status === "working" || task.status === "input-required") && !waitingForScore
  const decisions = waitingForScore
    ? ([["cancel", t.task.cancel]] as const)
    : ([
        ["input", t.task.needInput],
        ["reject", t.task.reject],
        ["fail", t.task.fail],
        ["cancel", t.task.cancel],
      ] as const)

  function handIn(nextText: string, nextImage: TaskImage | null) {
    if (!agent) return
    setPending(true)
    setNotice(null)
    setHanded(false)
    api<Task>(`/api/tasks/${task.id}`, { action: "artifact", agentId: agent.id, text: nextText, image: nextImage })
      .then(() => {
        setText("")
        setImage(null)
        setHanded(true)
        load()
      })
      .catch((caught: unknown) => {
        setNotice(caught instanceof ApiError ? showError(caught, t.task.submitError) : t.task.submitError)
      })
      .finally(() => setPending(false))
  }

  function sendDecision() {
    if (!agent || !decision) return
    setPending(true)
    setNotice(null)
    setHanded(false)
    api<Task>(`/api/tasks/${task.id}`, { action: decision, agentId: agent.id, text: reason })
      .then(() => {
        setReason("")
        setDecision(null)
        setNotice(t.task.statusUpdated)
        load()
      })
      .catch((caught: unknown) => {
        setNotice(caught instanceof ApiError ? showError(caught, t.task.statusError) : t.task.statusError)
      })
      .finally(() => setPending(false))
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="sheet p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">
          {waitingForScore ? t.task.awaitingScore : statusLabel(task.status, locale)}
        </p>
        {stance && !waitingForScore && task.status !== "working" && task.status !== "completed" ? (
          <p className="mt-3 leading-7">{stance.text}</p>
        ) : null}
        <h1 className="mt-3 font-serif text-4xl">{task.title}</h1>
        {skill ? (
          <div className="mt-4">
            <p className="font-serif text-xl">{skill.name}</p>
            <p className="text-sm leading-6 text-muted-foreground">{skill.description}</p>
            <SchemaSummary skill={skill} />
          </div>
        ) : null}
        <p className="mt-4 whitespace-pre-wrap leading-7">{task.brief}</p>
        {task.images?.length ? (
          <div className="mt-4 grid gap-3">
            {task.images.map((item, index) => (
              <Picture
                key={`${item.filename ?? "image"}-${index}`}
                image={item}
                alt={item.filename || t.task.incomingAlt}
                className="max-h-80 rounded-2xl border border-[#d9d0c0] object-contain"
              />
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-sm text-muted-foreground">{t.task.from(task.posterName)}</p>
        {typeof task.workScore === "number" ? <p className="mt-2 text-sm">{t.task.scoredBy(task.posterName, task.workScore)}</p> : null}
        {task.artifact || task.artifactImage ? (
          <div className="mt-6 rounded-2xl bg-[#f7f1e4] p-4">
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{t.task.artifact}</p>
            {task.artifact ? <p className="mt-2 whitespace-pre-wrap font-mono text-sm leading-7">{shownArtifact(task.artifact)}</p> : null}
            {task.artifactImage ? (
              <Picture image={task.artifactImage} alt={task.artifactImage.filename || t.task.returnedAlt} className="mt-3 max-h-80 rounded-2xl object-contain" />
            ) : null}
          </div>
        ) : null}
        {mine && answering && skill?.outputSchema ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">{t.task.handBack(describeSchema(skill.outputSchema, locale))}</p>
            <OutputForm schema={skill.outputSchema} pending={pending} onError={(message) => setNotice(message || null)} onSubmit={handIn} />
          </div>
        ) : null}
        {mine && answering && !skill?.outputSchema ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (needsImage && !image) {
                setNotice(t.task.needImage)
                return
              }
              handIn(text, image)
            }}
          >
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={needsImage ? t.task.textOptional : t.task.writeHere}
            />
            <label className="block text-sm">
              {t.task.image}
              <input
                className="mt-1.5 block text-sm"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) {
                    setImage(null)
                    return
                  }
                  if (file.size > 1_000_000) {
                    setImage(null)
                    setNotice(t.task.imageTooBig)
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => {
                    const result = typeof reader.result === "string" ? reader.result : ""
                    const matched = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(result)
                    if (!matched) {
                      setImage(null)
                      setNotice(t.task.imageType)
                      return
                    }
                    setImage({ mediaType: matched[1] as TaskImage["mediaType"], raw: matched[2].replace(/\s/g, ""), filename: file.name })
                    setNotice(null)
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </label>
            {image?.raw ? <Picture image={image} alt={image.filename || t.task.pendingAlt} className="max-h-48 rounded-2xl object-contain" /> : null}
            <Button type="submit" disabled={pending}>
              {pending ? t.task.submitting : t.task.submit}
            </Button>
          </form>
        ) : null}
        {mine && taskOpen(task.status) ? (
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap gap-2">
              {decisions.map(([action, label]) => (
                <Button key={action} type="button" variant={decision === action ? "default" : "outline"} onClick={() => setDecision(action)}>
                  {label}
                </Button>
              ))}
            </div>
            {decision ? (
              <>
                <Textarea
                  value={reason}
                  maxLength={200}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    decision === "input"
                      ? t.task.inputPlaceholder
                      : decision === "reject"
                        ? t.task.rejectPlaceholder
                        : decision === "fail"
                          ? t.task.failPlaceholder
                          : t.task.cancelPlaceholder
                  }
                />
                <Button type="button" disabled={pending} onClick={sendDecision}>
                  {pending ? t.task.submitting : t.task.confirm}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {handed || notice ? <p className="mt-3 text-sm">{handed ? t.task.handedWaiting : notice}</p> : null}
      </section>
      <section className="space-y-3">
        {messages.filter((message) => message.kind !== "task.scoreRequest").map((message) => (
          <article key={message.id} className="sheet p-4">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
              {kindLabel(message.kind, locale)} · {message.fromName} · {formatWhen(message.createdAt, locale)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.text}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
