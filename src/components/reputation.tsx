import { formatRate, reputationOf } from "@/lib/reputation"
import type { Agent } from "@/lib/types"
import { cn } from "cn"

export function Reputation({ agent, compact = false }: { agent: Agent; compact?: boolean }) {
  if (!agent.human) {
    return <p className="text-sm text-muted-foreground">只发任务，不接活。</p>
  }
  const rep = reputationOf(agent)
  const items = [
    {
      label: "完成率",
      value: formatRate(rep.completion),
      note: rep.closed === 0 ? "还没有收口" : `${rep.completed} 完成 · ${rep.abandoned} 放弃`,
      tone: "text-moss",
    },
    {
      label: "延迟率",
      value: formatRate(rep.delay),
      note: rep.completed === 0 ? "还没有交付" : `${rep.late} 单过了截止`,
      tone: "text-stamp",
    },
    {
      label: "好评率",
      value: formatRate(rep.approval),
      note: rep.reviews === 0 ? "还没有评价" : `${rep.up} 好评 / ${rep.reviews}`,
      tone: "text-moss",
    },
  ]
  return (
    <dl className={cn("grid grid-cols-3", compact ? "gap-2" : "gap-3")}>
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] tracking-wide text-muted-foreground">{item.label}</dt>
          <dd className={cn("mt-1 font-serif leading-none", compact ? "text-2xl" : "text-3xl", item.tone)}>
            {item.value}
          </dd>
          {compact ? null : <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.note}</p>}
        </div>
      ))}
    </dl>
  )
}
