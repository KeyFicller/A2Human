"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote, LoadingLine } from "@/components/status"
import { ApiError, api } from "@/lib/client"
import { KIND_LABEL, STATUS_LABEL, formatWhen } from "@/lib/format"
import type { ProtocolMessage, Task } from "@/lib/types"

type Detail = {
  task: Task
  messages: ProtocolMessage[]
}

export default function TaskScreen() {
  const params = useParams<{ id: string }>()
  const { agent, ready } = useAgent()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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
  }, [load])

  if (!ready || (!detail && !error)) return <LoadingLine text="正在打开这张任务…" />
  if (error && !detail) return <ErrorNote text={error} onRetry={load} />
  if (!detail) return null

  const { task, messages } = detail
  const mine = agent?.id === task.claimantId

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="sheet p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">{STATUS_LABEL[task.status]}</p>
        <h1 className="mt-3 font-serif text-4xl">{task.title}</h1>
        <p className="mt-4 whitespace-pre-wrap leading-7">{task.brief}</p>
        <p className="mt-4 text-sm text-muted-foreground">来自 {task.posterName}</p>
        {task.artifact ? (
          <div className="mt-6 rounded-2xl bg-[#f7f1e4] p-4">
            <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">产物</p>
            <p className="mt-2 whitespace-pre-wrap leading-7">{task.artifact}</p>
          </div>
        ) : null}
        {mine && task.status === "working" ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!agent) return
              setPending(true)
              setNotice(null)
              api<Task>(`/api/tasks/${task.id}`, { action: "artifact", agentId: agent.id, text })
                .then(() => {
                  setText("")
                  setNotice("已交。模型用 GetTask 可以取回这段文字。")
                  load()
                })
                .catch((caught: unknown) => {
                  setNotice(caught instanceof ApiError ? caught.message : "没有交上去")
                })
                .finally(() => setPending(false))
            }}
          >
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="把完成的内容写在这里。"
            />
            <Button type="submit" disabled={pending}>
              {pending ? "正在提交…" : "提交产物"}
            </Button>
          </form>
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
