"use client"

import { AppLink } from "@/components/app-link"
import { useEffect, useRef, useState } from "react"
import { useAgent } from "@/components/agent-provider"
import { useLocale } from "@/components/locale-provider"
import { Button, buttonVariants } from "@/components/ui/button"
import { api } from "@/lib/client"
import { useAppPath } from "@/lib/paths"
import { taskOpen } from "@/lib/format"
import { awaitingMyScore, taskHeadline } from "@/lib/task-view"
import type { Task } from "@/lib/types"
import { cn } from "cn"

const POLL_MS = 4000
const MAX_NOTICES = 3

type Notice = {
  id: string
  /** New work for you, or work you sent that came back and needs your score. */
  kind: "work" | "score"
  title: string
  brief: string
  name: string
}

function toNotice(task: Task, kind: Notice["kind"]): Notice {
  return {
    id: task.id,
    kind,
    title: taskHeadline(task.title, task.brief),
    brief: task.brief,
    name: kind === "score" ? task.claimantName || "" : task.posterName,
  }
}

export function WorkNotice() {
  const { agent, ready, senderIds } = useAgent()
  const { t } = useLocale()
  const pathname = useAppPath()
  const [notices, setNotices] = useState<Notice[]>([])
  const seen = useRef<Set<string> | null>(null)
  const scoreSeen = useRef<Set<string> | null>(null)
  const senderKey = senderIds.join(",")
  const pathnameRef = useRef(pathname)
  const agentId = agent?.id ?? null

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    let stopped = false
    seen.current = null
    scoreSeen.current = null
    const clear = Promise.resolve().then(() => {
      if (!stopped) setNotices([])
    })
    const ids = senderKey ? senderKey.split(",") : []
    if (!ready || (!agentId && ids.length === 0)) {
      return () => {
        stopped = true
        void clear
      }
    }

    const load = () => {
      api<Task[]>("/api/tasks")
        .then((tasks) => {
          if (stopped) return
          // A hand-in waiting for this browser's score is worth a nudge even if it was already waiting on load.
          const due = awaitingMyScore(tasks, ids, Date.now()).filter((task) => pathnameRef.current !== `/tasks/${task.id}`)
          if (scoreSeen.current === null) scoreSeen.current = new Set()
          const freshDue = due.filter((task) => !scoreSeen.current?.has(task.id))
          for (const task of freshDue) scoreSeen.current.add(task.id)
          if (freshDue.length) {
            setNotices((current) => {
              const dueIds = new Set(freshDue.map((task) => task.id))
              return [...freshDue.map((task) => toNotice(task, "score")), ...current.filter((item) => !dueIds.has(item.id))].slice(0, MAX_NOTICES)
            })
          }
          const live = new Set(due.map((task) => task.id))
          setNotices((current) => {
            const next = current.filter((item) => item.kind !== "score" || live.has(item.id))
            return next.length === current.length ? current : next
          })
          if (!agentId) return
          const open = tasks.filter((task) => task.claimantId === agentId && taskOpen(task.status))
          if (seen.current === null) {
            seen.current = new Set(open.map((task) => task.id))
            return
          }
          const fresh = open
            .filter((task) => !seen.current?.has(task.id))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          for (const task of open) seen.current.add(task.id)
          const incoming = fresh.filter((task) => pathnameRef.current !== `/tasks/${task.id}`)
          if (incoming.length === 0) return
          setNotices((current) => {
            const ids = new Set(incoming.map((task) => task.id))
            return [...incoming.map((task) => toNotice(task, "work")), ...current.filter((item) => !ids.has(item.id))].slice(0, MAX_NOTICES)
          })
        })
        .catch(() => {
          // A failed read leaves the seed unset, so the next poll can still learn the backlog quietly.
        })
    }

    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
      void clear
    }
  }, [ready, agentId, senderKey])

  if (notices.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-30 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3"
      aria-live="polite"
    >
      {notices.map((notice) => (
        <article key={notice.id} role="status" className="sheet px-4 py-3">
          <p className="font-mono text-[11px] tracking-[0.16em] text-stamp">{notice.kind === "score" ? t.notice.scoreTitle : t.notice.title}</p>
          <h2 className="mt-1 font-serif text-xl leading-snug break-words">{notice.title}</h2>
          {notice.brief && notice.brief !== notice.title ? (
            <p className="mt-1 line-clamp-2 text-sm leading-6 break-words text-muted-foreground">{notice.brief}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">{notice.kind === "score" ? t.notice.handedBy(notice.name) : t.notice.from(notice.name)}</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}
            >
              {t.notice.dismiss}
            </Button>
            <AppLink
              href={`/tasks/${notice.id}`}
              className={cn(buttonVariants({ size: "sm" }))}
              onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}
            >
              {notice.kind === "score" ? t.notice.scoreOpen : t.notice.open}
            </AppLink>
          </div>
        </article>
      ))}
    </div>
  )
}
