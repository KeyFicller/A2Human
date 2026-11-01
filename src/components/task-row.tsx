import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { STATUS_LABEL, formatB } from "@/lib/format"
import type { Task } from "@/lib/types"
import { cn } from "cn"

const tone: Record<Task["status"], string> = {
  submitted: "text-stamp",
  working: "text-[#8a5a12]",
  completed: "text-moss",
  canceled: "text-muted-foreground",
}

export function TaskRow({
  task,
  note,
}: {
  task: Task
  note?: string
}) {
  return (
    <Link href={`/board/${task.id}`} className="sheet block px-4 py-4 transition hover:-translate-y-0.5 md:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={cn("font-mono text-[11px] tracking-[0.14em]", tone[task.status])}>
          {STATUS_LABEL[task.status]} · {task.status}
        </p>
        <p className="font-mono text-sm">+{task.reward} 参数点</p>
      </div>
      <h3 className="mt-2 font-serif text-2xl leading-snug">{task.title}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{task.brief}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
        <span className="ml-auto text-xs text-muted-foreground">来自 {task.posterName}</span>
      </div>
      {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
    </Link>
  )
}
