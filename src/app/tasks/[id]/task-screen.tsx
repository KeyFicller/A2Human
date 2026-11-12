"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useParams } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { useText } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote, LoadingLine } from "@/components/status"
import { ApiError, api } from "@/lib/client"
import { formatWhen, kindLabel, statusLabel } from "@/lib/format"
import { needsWorker, readableArtifact, scoreWasSkipped } from "@/lib/task-view"
import { SchemaSummary } from "@/components/schema-summary"
import { OutputForm } from "@/components/output-form"
import { describeSchema, schemaRequiresImage } from "@/lib/schema-fields"
import { activePlay, deliveryOf, playHintKey, promisesTimedDraw, usesTimedBoard, type PlayMode } from "@/lib/publish-skills"
import { skillLabel } from "@/lib/skill-catalog"
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

const SCORE_WAIT_MS = 60_000

function progressHint(play: PlayMode | null, text: { progressDraw: string; progressPaper: string; progressRoll: string; progressWetware: string; progressBook: string; progressHuman: string; progressCustom: string }) {
  if (play === "timed_draw") return text.progressDraw
  if (play === "paper") return text.progressPaper
  if (play === "roll") return text.progressRoll
  if (play === "wetware") return text.progressWetware
  if (play === "book") return text.progressBook
  if (play === "human_check") return text.progressHuman
  return text.progressCustom
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

export default function TaskScreen({ id }: { id?: string }) {
  const params = useParams<{ id?: string }>()
  const taskId = id || params.id || ""
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
  const [progress, setProgress] = useState("")
  const [score, setScore] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const progressTask = useRef("")

  const load = useCallback(() => {
    if (!taskId) return
    api<Detail>(`/api/tasks/${taskId}`)
      .then((next) => {
        setDetail(next)
        setError(null)
        if (next.task.status === "completed") setHanded(false)
        if (progressTask.current !== next.task.id) {
          progressTask.current = next.task.id
          setProgress(next.task.progress || "")
        }
      })
      .catch((caught: unknown) => {
        setError(showError(caught, t.task.loadError))
      })
  }, [taskId, showError, t.task.loadError])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  const scoreAsked = (() => {
    if (!detail) return Number.NaN
    const latest = [...detail.messages].reverse().find((item) => item.kind === "task.scoreRequest")
    if (detail.task.status === "input-required" && latest) return Date.parse(latest.createdAt)
    return Number.NaN
  })()

  useEffect(() => {
    if (!Number.isFinite(scoreAsked)) {
      setSecondsLeft(null)
      return
    }
    let expired = false
    const tick = () => {
      const left = Math.max(0, Math.ceil((scoreAsked + SCORE_WAIT_MS - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0 && !expired) {
        expired = true
        load()
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [scoreAsked, load])

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
  const deliveryKind = skill?.outputSchema ? deliveryOf(skill.outputSchema) : "custom"
  const play = skill && deliveryKind !== "custom" ? activePlay(skill.name, deliveryKind, skill.play) : null
  const board = Boolean(
    skill &&
      deliveryKind === "image" &&
      (usesTimedBoard(skill.name, "image", skill.play) || (!skill.play && promisesTimedDraw(`${skill.title || ""}\n${skill.description}`))),
  )
  const stance = [...messages].reverse().find((item) =>
    item.kind === "task.input" || item.kind === "task.scoreRequest" || item.kind === "task.reject" || item.kind === "task.fail" || item.kind === "task.cancel",
  )
  const waitingForScore = task.status === "input-required" && stance?.kind === "task.scoreRequest"
  const answering = (task.status === "working" || task.status === "input-required") && !waitingForScore
  const decisions = ([
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

  function saveProgress(event: FormEvent) {
    event.preventDefault()
    if (!agent) return
    setPending(true)
    setNotice(null)
    api<Task>(`/api/tasks/${task.id}`, { action: "progress", agentId: agent.id, text: progress })
      .then((next) => {
        setProgress(next.progress || "")
        setNotice(t.task.progressSaved)
        load()
      })
      .catch((caught: unknown) => {
        setNotice(caught instanceof ApiError ? showError(caught, t.task.progressError) : t.task.progressError)
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
        <p className="inline-flex rounded-full bg-[#f3e6c8] px-2 py-0.5 font-mono text-[11px] tracking-[0.14em] text-stamp">
          {waitingForScore ? t.task.awaitingScore : statusLabel(task.status, locale)}
        </p>
        {stance && !waitingForScore && task.status !== "working" && task.status !== "completed" ? (
          <p className="mt-3 leading-7">{stance.text}</p>
        ) : null}
        <h1 className="mt-3 font-serif text-4xl break-words">{task.title}</h1>
        {skill ? (
          <div className="mt-4">
            <p className="font-serif text-xl">{skillLabel(skill)}</p>
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
        {task.progress && !(mine && task.status === "working") ? <p className="mt-4 break-words leading-7">{task.progress}</p> : null}
        {mine && task.status === "working" ? (
          <form className="mt-4 space-y-3" onSubmit={saveProgress}>
            <label className="block text-sm">
              {t.task.progress}
              <Input
                className="mt-1.5 w-full min-w-0"
                value={progress}
                maxLength={80}
                onChange={(event) => setProgress(event.target.value)}
                placeholder={progressHint(play, t.task)}
              />
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? t.task.submitting : t.task.progressSave}
            </Button>
          </form>
        ) : null}
        <p className="mt-4 text-sm text-muted-foreground">{t.task.from(task.posterName)}</p>
        {typeof task.workScore === "number" ? <p className="mt-2 text-sm">{t.task.scoredBy(task.posterName, task.workScore)}</p> : null}
        {scoreWasSkipped(task) ? <p className="mt-2 text-sm">{t.task.scoreSkipped}</p> : null}
        {waitingForScore && secondsLeft != null ? <p className="mt-3 text-sm text-stamp">{t.task.scoreLeft(secondsLeft)}</p> : null}
        {agent && !mine && waitingForScore ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!agent || score == null) return
              setPending(true)
              setNotice(null)
              api<Task>(`/api/tasks/${task.id}`, { action: "score", agentId: agent.id, score })
                .then(() => {
                  setNotice(t.task.scoreDone)
                  load()
                })
                .catch((caught: unknown) => setNotice(caught instanceof ApiError ? showError(caught, t.task.statusError) : t.task.statusError))
                .finally(() => setPending(false))
            }}
          >
            <p className="text-sm">{t.task.scoreNow}</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <Button key={value} type="button" variant={score === value ? "default" : "outline"} onClick={() => setScore(value)}>
                  {value}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={pending || score == null}>
                {pending ? t.task.submitting : t.task.scoreNow}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  if (!agent) return
                  setPending(true)
                  api<Task>(`/api/tasks/${task.id}`, { action: "skip", agentId: agent.id })
                    .then(() => load())
                    .catch((caught: unknown) => setNotice(caught instanceof ApiError ? showError(caught, t.task.statusError) : t.task.statusError))
                    .finally(() => setPending(false))
                }}
              >
                {t.task.scoreSkip}
              </Button>
            </div>
          </form>
        ) : null}
        {task.artifact || task.artifactImage ? (
          <div className="mt-6 rounded-2xl bg-[#f7f1e4] p-4">
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">{t.task.artifact}</p>
            {task.artifact ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{readableArtifact(task.artifact)}</p> : null}
            {task.artifactImage ? (
              <Picture image={task.artifactImage} alt={task.artifactImage.filename || t.task.returnedAlt} className="mt-3 max-h-80 rounded-2xl object-contain" />
            ) : null}
          </div>
        ) : null}
        {mine && answering && skill?.outputSchema ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">{t.task.handBack(describeSchema(skill.outputSchema, locale))}</p>
            <OutputForm
              key={`${task.id}:${skill.name}`}
              schema={skill.outputSchema}
              pending={pending}
              hint={play ? t.output[playHintKey(play)] : undefined}
              board={board}
              onError={(message) => setNotice(message || null)}
              onSubmit={handIn}
            />
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
        {mine && needsWorker(task) ? (
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
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{readableArtifact(message.text)}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
