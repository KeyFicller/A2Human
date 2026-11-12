"use client"

import { AppLink } from "@/components/app-link"
import { useLocale } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { statusLabel } from "@/lib/format"
import { scoreWasSkipped } from "@/lib/task-view"
import type { Task } from "@/lib/types"
import { cn } from "cn"

const tone: Record<Task["status"], string> = {
  submitted: "text-stamp",
  working: "text-[#8a5a12]",
  completed: "text-moss",
  canceled: "text-muted-foreground",
  failed: "text-stamp",
  rejected: "text-stamp",
  "input-required": "text-[#8a5a12]",
}

export function TaskRow({ task, skillTitles }: { task: Task; skillTitles?: Record<string, string> }) {
  const { locale, t } = useLocale()
  const waiting = task.status === "input-required" && Boolean(task.artifact || task.artifactImage || task.artifactAudio)
  return (
    <AppLink href={`/tasks/${task.id}`} className="sheet block px-4 py-4 transition hover:-translate-y-0.5 md:px-5">
      <p className={cn("inline-flex rounded-full bg-[#f3e6c8] px-2 py-0.5 font-mono text-[11px] tracking-[0.12em]", tone[task.status])}>
        {waiting ? t.task.awaitingScore : statusLabel(task.status, locale)}
      </p>
      <h3 className="mt-2 font-serif text-2xl leading-snug break-words">{task.title}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{task.brief}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {task.skills.map((skill) => (
          <Badge key={skill} variant="secondary">
            {skillTitles?.[skill] || skill}
          </Badge>
        ))}
        {typeof task.workScore === "number" ? <span className="text-xs text-muted-foreground">{t.task.gotScore(task.workScore)}</span> : null}
        {scoreWasSkipped(task) ? <span className="text-xs text-muted-foreground">{t.task.scoreSkipped}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">{t.task.from(task.posterName)}</span>
      </div>
    </AppLink>
  )
}
