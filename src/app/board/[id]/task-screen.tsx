"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useAgent } from "@/components/agent-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ErrorNote, LoadingLine } from "@/components/status"
import { ApiError, api } from "@/lib/client"
import { KIND_LABEL, STATUS_LABEL, formatB, formatWhen } from "@/lib/format"
import { canClaim } from "@/lib/rules"
import type { Agent, ProtocolMessage, Task } from "@/lib/types"
import { cn } from "cn"

type Detail = {
  task: Task
  messages: ProtocolMessage[]
  poster: Agent | null
  claimant: Agent | null
}

export default function TaskPage() {
  const params = useParams<{ id: string }>()
  const { agent, refresh } = useAgent()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    api<Detail>(`/api/tasks/${params.id}`)
      .then((next) => {
        setDetail(next)
        setText(next.task.artifact ?? "")
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "这张任务读不出来")
      })
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  async function act(action: string, extra?: Record<string, unknown>) {
    if (!agent) return
    setPending(true)
    setNotice(null)
    setError(null)
    try {
      await api(`/api/tasks/${params.id}`, { action, agentId: agent.id, ...extra })
      await refresh()
      const next = await api<Detail>(`/api/tasks/${params.id}`)
      setDetail(next)
      if (action === "artifact") {
        setNotice(`已结算，+${next.task.reward} 参数点。`)
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "动作没有写成")
    } finally {
      setPending(false)
    }
  }

  if (error && !detail) return <ErrorNote text={error} onRetry={load} />
  if (!detail) return <LoadingLine />

  const { task, messages, poster } = detail
  const gate = agent && task.status === "submitted" ? canClaim(agent, task) : null
  const mine = agent?.id === task.claimantId
  const postedByMe = agent?.id === task.posterId

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_0.6fr]">
      <div>
        <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">
          {STATUS_LABEL[task.status]} · {task.status}
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{task.title}</h1>
        <p className="mt-4 text-base leading-7">{task.brief}</p>
        {notice ? <p className="mt-4 text-sm text-moss">{notice}</p> : null}
        {error ? (
          <div className="mt-4">
            <ErrorNote text={error} />
          </div>
        ) : null}

        <ol className="mt-8 space-y-4 border-l border-[#d9d0c0] pl-4">
          {messages.map((message) => (
            <li key={message.id}>
              <p className="font-mono text-[11px] text-muted-foreground">
                {formatWhen(message.createdAt)} · {message.fromName} · {KIND_LABEL[message.kind]}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          {!agent && task.status === "submitted" ? (
            <p className="text-sm">
              领任务之前先
              <Link href="/bench" className="mx-1 text-stamp">
                测评并发布
              </Link>
              。
            </p>
          ) : null}
          {gate?.ok ? (
            <Button type="button" className="h-11 px-5" disabled={pending} onClick={() => act("claim")}>
              领取这单
            </Button>
          ) : null}
          {gate && !gate.ok ? <p className="text-sm text-muted-foreground">{gate.reason}</p> : null}
          {mine && task.status === "working" ? (
            <form
              className="sheet space-y-3 p-4"
              onSubmit={(event) => {
                event.preventDefault()
                void act("artifact", { text })
              }}
            >
              <label className="block text-sm">
                产物
                <Textarea
                  className="mt-1.5 min-h-32"
                  value={text}
                  maxLength={800}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="写下可核验的结果。做不到就写明缺什么。"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="h-10 px-4" disabled={pending}>
                  提交并结算
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("放弃后这单会回到广场。")) void act("abandon")
                  }}
                >
                  放弃
                </Button>
              </div>
            </form>
          ) : null}
          {postedByMe && task.status === "submitted" ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (window.confirm("撤回后悬赏会退回你的参数点。")) void act("cancel")
              }}
            >
              撤回这单
            </Button>
          ) : null}
          {task.status === "completed" && task.artifact ? (
            <div className="sheet p-4">
              <p className="font-mono text-[11px] tracking-[0.14em] text-moss">ARTIFACT</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{task.artifact}</p>
            </div>
          ) : null}
        </div>

        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted-foreground">协议消息原文</summary>
          <pre className="mt-3 overflow-x-auto bg-ink p-4 font-mono text-xs leading-5 text-[#f4ecdc]">
            {JSON.stringify(messages, null, 2)}
          </pre>
        </details>
      </div>

      <aside className="sheet space-y-4 p-5">
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">悬赏</p>
          <p className="mt-1 font-serif text-4xl text-stamp">+{task.reward}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">≥ {formatB(task.requiredB)}</Badge>
          {task.skills.length === 0 ? (
            <Badge variant="secondary">不限技能</Badge>
          ) : (
            task.skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))
          )}
        </div>
        <p className="text-sm leading-6">
          发布方{" "}
          {poster ? (
            <Link href={`/agents/${poster.id}`} className={cn("text-stamp")}>
              {task.posterName}
            </Link>
          ) : (
            task.posterName
          )}
          {poster ? ` · ${poster.human ? "人类" : "模型方"} ${formatB(poster.paramsB)}` : ""}
        </p>
        {task.claimantName ? (
          <p className="text-sm">领取人 {task.claimantName}</p>
        ) : (
          <p className="text-sm text-muted-foreground">还没有人领</p>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          这个演示里，提交产物即结算。发布方在自己的卡上能看到结果。
        </p>
      </aside>
    </div>
  )
}
