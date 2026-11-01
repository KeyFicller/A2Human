"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorNote, LoadingLine } from "@/components/status"
import { TaskRow } from "@/components/task-row"
import { api } from "@/lib/client"
import { Reputation } from "@/components/reputation"
import type { Agent, Task } from "@/lib/types"

export default function AgentProfilePage() {
  const params = useParams<{ id: string }>()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [card, setCard] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [origin, setOrigin] = useState("")

  const load = useCallback(() => {
    Promise.all([
      api<Agent>(`/api/agents/${params.id}`),
      api<Task[]>("/api/tasks"),
      api<unknown>(`/api/a2a/${params.id}`),
    ])
      .then(([nextAgent, nextTasks, nextCard]) => {
        setAgent(nextAgent)
        setTasks(nextTasks.filter((task) => task.posterId === nextAgent.id || task.claimantId === nextAgent.id))
        setCard(nextCard)
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "这张卡读不出来")
      })
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const next = window.location.origin
    Promise.resolve().then(() => setOrigin(next))
  }, [])

  if (error && !agent) return <ErrorNote text={error} onRetry={load} />
  if (!agent) return <LoadingLine />

  const json = JSON.stringify(card, null, 2)
  const endpoint = `${origin}/api/a2a/${agent.id}`
  const curl = `curl -s ${endpoint} \\
  -H 'content-type: application/json' \\
  -d '${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId: "msg-1",
        parts: [{ text: "用一句话介绍你自己。" }],
      },
    },
  })}'`

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="sheet p-6">
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground">
          {agent.human ? "HUMAN" : "MODEL"}
        </p>
        <h1 className="mt-4 font-serif text-4xl">{agent.name}</h1>
        <p className="mt-4 leading-7">{agent.bio}</p>
        <div className="mt-6">
          <Reputation agent={agent} />
        </div>
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
        <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">参数点</dt>
            <dd className="font-serif text-2xl">{agent.points}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">已结算</dt>
            <dd className="font-serif text-2xl">{agent.completed}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">评价</dt>
            <dd className="font-serif text-2xl">{agent.reviews}</dd>
          </div>
        </dl>
      </section>
      <section>
        {agent.human ? (
          <div className="mb-6">
            <h2 className="font-serif text-2xl">让模型指挥这个人</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              广场入口是 {origin ? `${origin}/.well-known/agent-card.json` : "加载中"}。下面这条会把活直接派到这个人身上，状态进入 TASK_STATE_WORKING。人交完产物后，用 GetTask 读取。
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="truncate font-mono text-xs text-muted-foreground">{endpoint}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(curl).then(() => setCopiedCurl(true))
                }}
              >
                {copiedCurl ? "已复制" : "复制调用"}
              </Button>
            </div>
            <pre className="mt-3 overflow-auto bg-ink p-4 font-mono text-xs leading-5 text-[#f4ecdc]">{curl}</pre>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-2xl">A2A Agent Card</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(json).then(() => {
                setCopied(true)
              })
            }}
          >
            {copied ? "已复制" : "复制 JSON"}
          </Button>
        </div>
        <pre className="mt-3 max-h-[28rem] overflow-auto bg-ink p-4 font-mono text-xs leading-5 text-[#f4ecdc]">
          {json}
        </pre>
        <div className="mt-6 grid gap-3">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有挂出或接过的任务。</p>
          ) : (
            tasks.map((task) => <TaskRow key={task.id} task={task} />)
          )}
        </div>
      </section>
    </div>
  )
}
