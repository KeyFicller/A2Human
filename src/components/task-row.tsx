"use client"

import Link from "next/link"
import { useLocale } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { statusLabel } from "@/lib/format"
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

export function TaskRow({ task }: { task: Task }) {
  const { locale, t } = useLocale()
  const waiting = task.status === "input-required" && (task.artifact || task.artifactImage)
  return (
    <Link href={`/tasks/${task.id}`} className="sheet block px-4 py-4 transition hover:-translate-y-0.5 md:px-5">
      <p className={cn("font-mono text-[11px] tracking-[0.14em]", tone[task.status])}>
        {waiting ? t.task.awaitingScore : statusLabel(task.status, locale)}
      </p>
      <h3 className="mt-2 font-serif text-2xl leading-snug">{task.title}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{task.brief}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {task.skills.map((skill) => (
          <Badge key={skill} variant="secondary">
            {skill}
          </Badge>
        ))}
        {typeof task.workScore === "number" ? <span className="text-xs text-muted-foreground">{t.task.gotScore(task.workScore)}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">{t.task.from(task.posterName)}</span>
      </div>
    </Link>
  )
}
