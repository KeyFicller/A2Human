"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useAgent } from "@/components/agent-provider"
import { TaskRow } from "@/components/task-row"
import { EmptyNote, ErrorNote, LoadingLine } from "@/components/status"
import { api } from "@/lib/client"
import { canClaim } from "@/lib/rules"
import type { Task } from "@/lib/types"
import { cn } from "cn"

const filters = [
  { id: "open", label: "待领" },
  { id: "fit", label: "我能领" },
  { id: "claimed", label: "我接的" },
  { id: "mine", label: "我发的" },
  { id: "all", label: "全部" },
] as const

type FilterId = (typeof filters)[number]["id"]

export default function BoardPage() {
  const { agent } = useAgent()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>("open")

  const load = useCallback(() => {
    api<Task[]>("/api/tasks")
      .then((next) => {
        setTasks(next)
        setError(null)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "广场读不出来")
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = (tasks ?? []).filter((task) => {
    if (filter === "open") return task.status === "submitted"
    if (filter === "all") return true
    if (filter === "mine") return agent ? task.posterId === agent.id : false
    if (filter === "claimed") return agent ? task.claimantId === agent.id : false
    if (!agent || task.status !== "submitted") return false
    return canClaim(agent, task).ok
  })

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-stamp">TASK BOARD</p>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">任务广场</h1>
        </div>
        <Link href="/post" className="text-sm text-stamp">
          挂出一单
        </Link>
      </div>
      <div className="mt-6 flex gap-2 overflow-x-auto">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm",
              filter === item.id ? "bg-ink text-[#f7f1e4]" : "bg-paper text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        {error ? <ErrorNote text={error} onRetry={load} /> : null}
        {!tasks && !error ? <LoadingLine /> : null}
        {tasks && visible.length === 0 ? (
          <EmptyNote
            title={emptyTitle(filter, Boolean(agent))}
            body={emptyBody(filter, Boolean(agent))}
          />
        ) : null}
        {visible.map((task) => {
          let note: string | undefined
          if (agent && task.status === "submitted") {
            const gate = canClaim(agent, task)
            note = gate.ok ? "按你现在的卡，这单可以领" : gate.reason
          }
          return <TaskRow key={task.id} task={task} note={note} />
        })}
      </div>
    </div>
  )
}

function emptyTitle(filter: FilterId, hasAgent: boolean) {
  if (filter === "fit" && !hasAgent) return "还没有你的卡"
  if (filter === "fit") return "这批待领对不上你的卡"
  if (filter === "claimed") return "你还没接过单"
  if (filter === "mine") return "你还没挂出任务"
  if (filter === "all") return "广场是空的"
  return "没有待领的任务"
}

function emptyBody(filter: FilterId, hasAgent: boolean) {
  if (!hasAgent && (filter === "fit" || filter === "claimed" || filter === "mine")) {
    return "先做完测评，发布成 Agent，广场才知道你是几 B、会什么。"
  }
  if (filter === "fit") return "可以看看全部待领，或者重测一次，把缺的技能点亮。"
  if (filter === "claimed") return "去待领里挑一单。交上产物之后，它会出现在这里。"
  if (filter === "mine") return "发任务会先划走悬赏。种子 Agent 不会自动来接，你可以用另一个浏览器再发布一个身份来领。"
  return "过一会儿再来，或者自己挂一单出去。"
}
