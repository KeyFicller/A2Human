"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote, LoadingLine } from "@/components/status"
import { ApiError, api } from "@/lib/client"
import { KIND_LABEL, STATUS_LABEL, formatWhen, taskOpen } from "@/lib/format"
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

export default function TaskScreen() {
  const params = useParams<{ id: string }>()
  const { agent, ready } = useAgent()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [image, setImage] = useState<TaskImage | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [decision, setDecision] = useState<"reject" | "cancel" | "fail" | "input" | null>(null)
  const [reason, setReason] = useState("")

  const load = useCallback(() => {
    api<Detail>(`/api/tasks/${params.id}`)
      .then((next) => {
        setDetail(next)
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "这张任务读不出来")
      })
  }, [params.id])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  if (!ready || (!detail && !error)) return <LoadingLine text="正在打开这张任务…" />
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
  const answering = task.status === "working" || task.status === "input-required"
  const stance = [...messages].reverse().find((item) =>
    item.kind === "task.input" || item.kind === "task.reject" || item.kind === "task.fail" || item.kind === "task.cancel",
  )

  function handIn(nextText: string, nextImage: TaskImage | null) {
    if (!agent) return
    setPending(true)
    setNotice(null)
    api<Task>(`/api/tasks/${task.id}`, { action: "artifact", agentId: agent.id, text: nextText, image: nextImage })
      .then(() => {
        setText("")
        setImage(null)
        setNotice("已交。模型用 GetTask 可以取回。")
        load()
      })
      .catch((caught: unknown) => {
        setNotice(caught instanceof ApiError ? caught.message : "没有交上去")
      })
      .finally(() => setPending(false))
  }

  function sendDecision() {
    if (!agent || !decision) return
    setPending(true)
    setNotice(null)
    api<Task>(`/api/tasks/${task.id}`, { action: decision, agentId: agent.id, text: reason })
      .then(() => {
        setReason("")
        setDecision(null)
        setNotice("状态已改。模型用 GetTask 可以读到。")
        load()
      })
      .catch((caught: unknown) => {
        setNotice(caught instanceof ApiError ? caught.message : "状态没改成")
      })
      .finally(() => setPending(false))
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="sheet p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">{STATUS_LABEL[task.status]}</p>
        {stance && task.status !== "working" && task.status !== "completed" ? (
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
                alt={item.filename || "派来的图片"}
                className="max-h-80 rounded-2xl border border-[#d9d0c0] object-contain"
              />
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-sm text-muted-foreground">来自 {task.posterName}</p>
        {task.artifact || task.artifactImage ? (
          <div className="mt-6 rounded-2xl bg-[#f7f1e4] p-4">
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">产物</p>
            {task.artifact ? <p className="mt-2 whitespace-pre-wrap font-mono text-sm leading-7">{shownArtifact(task.artifact)}</p> : null}
            {task.artifactImage ? (
              <Picture image={task.artifactImage} alt={task.artifactImage.filename || "交回的图片"} className="mt-3 max-h-80 rounded-2xl object-contain" />
            ) : null}
          </div>
        ) : null}
        {mine && answering && skill?.outputSchema ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">按这个输出交回：{describeSchema(skill.outputSchema)}</p>
            <OutputForm
              schema={skill.outputSchema}
              pending={pending}
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
                setNotice("要交一张图片")
                return
              }
              handIn(text, image)
            }}
          >
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={needsImage ? "文字可以不写。这单要交一张图片。" : "把完成的内容写在这里。也可以附一张图。"}
            />
            <label className="block text-sm">
              图片
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
                    setNotice("图片要在 1MB 以内")
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => {
                    const result = typeof reader.result === "string" ? reader.result : ""
                    const matched = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(result)
                    if (!matched) {
                      setImage(null)
                      setNotice("只接受 png、jpeg、webp、gif")
                      return
                    }
                    setImage({ mediaType: matched[1] as TaskImage["mediaType"], raw: matched[2].replace(/\s/g, ""), filename: file.name })
                    setNotice(null)
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </label>
            {image?.raw ? <Picture image={image} alt={image.filename || "待提交的图片"} className="max-h-48 rounded-2xl object-contain" /> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "正在提交…" : "提交产物"}
            </Button>
          </form>
        ) : null}
        {mine && taskOpen(task.status) ? (
          <div className="mt-6 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["input", "要补充"],
                  ["reject", "拒绝"],
                  ["fail", "失败"],
                  ["cancel", "取消"],
                ] as const
              ).map(([action, label]) => (
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
                      ? "还缺什么。模型补上之后，这单回到进行中。"
                      : decision === "reject"
                        ? "为什么不接。"
                        : decision === "fail"
                          ? "卡在哪里。"
                          : "为什么取消。"
                  }
                />
                <Button type="button" disabled={pending} onClick={sendDecision}>
                  {pending ? "正在提交…" : "确认"}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {notice ? <p className="mt-3 text-sm">{notice}</p> : null}
      </section>
      <section className="space-y-3">
        {messages.map((message) => (
          <article key={message.id} className="sheet p-4">
            <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
              {KIND_LABEL[message.kind]} · {message.fromName} · {formatWhen(message.createdAt)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.text}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
