"use client"

import { useCallback, useEffect, useState } from "react"
import { useText } from "@/components/locale-provider"
import { TaskRow } from "@/components/task-row"
import { api } from "@/lib/client"
import { scorerFor, sentBy } from "@/lib/task-view"
import type { Task } from "@/lib/types"
import { useSkillTitles } from "@/lib/use-skill-titles"

/** Tasks this browser sent, as its card or as the visitor it was before publishing. */
export function SentTasks({
  ids,
  title,
  targetId,
  reload = 0,
  skillTitles,
}: {
  ids: string[]
  title: string
  targetId?: string
  reload?: number
  skillTitles?: Record<string, string>
}) {
  const { locale, t } = useText()
  const titlesFor = useSkillTitles(locale)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const key = ids.join(",")

  const load = useCallback(() => {
    if (!key) return
    api<Task[]>("/api/tasks")
      .then((all) => setTasks(sentBy(all, key.split(",")).filter((task) => !targetId || task.targetId === targetId)))
      .catch(() => {})
  }, [key, targetId])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 4000)
    return () => window.clearInterval(timer)
  }, [load, reload])

  return (
    <section>
      <h2 className="font-serif text-2xl">{title}</h2>
      <div className="mt-3 grid gap-3">
        {tasks && tasks.length === 0 ? <p className="text-sm text-muted-foreground">{t.me.sentEmpty}</p> : null}
        {tasks?.map((task) => (
          <TaskRow key={task.id} task={task} skillTitles={skillTitles ?? titlesFor(task)} sent scoreMine={Boolean(scorerFor(task, ids))} />
        ))}
      </div>
    </section>
  )
}
