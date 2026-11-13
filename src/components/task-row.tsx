"use client"

import { AppLink } from "@/components/app-link"
import { useLocale } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { statusLabel } from "@/lib/format"
import { skillLabel } from "@/lib/skill-catalog"
import { scoreDeadline, scoreWasSkipped, taskHeadline } from "@/lib/task-view"
import type { Task } from "@/lib/types"
import { useNow } from "@/lib/use-now"
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

/**
 * One task card. `sent` rows are work this browser sent: they name who it went to,
 * and when `scoreMine` is set and the hand-in is waiting, they count down the score window.
 */
export function TaskRow({
  task,
  skillTitles,
  sent = false,
  scoreMine = false,
}: {
  task: Task
  skillTitles?: Record<string, string>
  sent?: boolean
  scoreMine?: boolean
}) {
  const { locale, t } = useLocale()
  const waiting = task.status === "input-required" && Boolean(task.artifact || task.artifactImage || task.artifactAudio)
  const deadline = scoreMine && waiting ? scoreDeadline(task) : null
  const now = useNow(deadline != null)
  const left = deadline != null ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0
  const urgent = deadline != null && left > 0
  const headline = taskHeadline(task.title, task.brief)
  const showBrief = headline !== task.brief.split(/\s+/).join(" ").trim()
  return (
    <AppLink
      href={`/tasks/${task.id}`}
      className={cn("sheet block px-4 py-4 transition hover:-translate-y-0.5 md:px-5", urgent ? "ring-2 ring-stamp" : "")}
    >
      <p
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] tracking-[0.12em]",
          urgent ? "bg-stamp text-[#fbf7ee]" : cn("bg-[#f3e6c8]", tone[task.status]),
        )}
      >
        {urgent ? t.task.scoreDueLeft(left) : waiting ? t.task.awaitingScore : statusLabel(task.status, locale)}
      </p>
      <h3 className="mt-2 font-serif text-2xl leading-snug break-words">{headline}</h3>
      {showBrief ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{task.brief}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {task.skills.map((skill) => (
          <Badge key={skill} variant="secondary">
            {skillTitles?.[skill] || skillLabel({ name: skill }, locale)}
          </Badge>
        ))}
        {typeof task.workScore === "number" ? <span className="text-xs text-muted-foreground">{t.task.gotScore(task.workScore)}</span> : null}
        {scoreWasSkipped(task) ? <span className="text-xs text-muted-foreground">{t.task.scoreSkipped}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {sent && task.claimantName ? t.task.sentTo(task.claimantName) : t.task.from(task.posterName)}
        </span>
      </div>
    </AppLink>
  )
}
