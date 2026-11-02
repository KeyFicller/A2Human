"use client"

import { useLocale } from "@/components/locale-provider"
import { durationValue, scoreValue } from "@/lib/format"

export function RecordFigures({
  completed = 0,
  averageScore = null,
  averageDuration = null,
}: {
  completed?: number
  averageScore?: number | null
  averageDuration?: number | null
}) {
  const { locale, t } = useLocale()
  const items = [
    [t.record.completed, String(completed)],
    [t.record.score, scoreValue(averageScore) ?? t.record.empty],
    [t.record.time, averageDuration == null ? t.record.empty : durationValue(averageDuration, locale)],
  ] as const

  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-[#e4dccb] py-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground">{label}</dt>
          <dd className="mt-1 font-serif text-2xl leading-none">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
