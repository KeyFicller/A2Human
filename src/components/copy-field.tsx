"use client"

import { useEffect, useState } from "react"
import { useLocale } from "@/components/locale-provider"

/** Break an address after "/" first; only split a host or id when one piece alone is wider than the pill. */
function Breakable({ value }: { value: string }) {
  const pieces = value.split(/(?<=\/)/)
  return (
    <>
      {pieces.map((piece, index) => (
        <span key={index}>
          {piece}
          {index < pieces.length - 1 ? <wbr /> : null}
        </span>
      ))}
    </>
  )
}

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div className="mt-4 max-w-full">
      {hint ? <p className="text-sm leading-6 text-muted-foreground">{hint}</p> : null}
      <div className="mt-2 flex max-w-full min-w-0 items-center gap-3 rounded-xl border border-[#d9d0c0] bg-[#f7f1e4] px-3 py-2">
        <p className="min-w-0 flex-1 font-mono text-xs leading-5 [overflow-wrap:anywhere]" title={value || undefined}>
          {value ? <Breakable value={value} /> : t.copy.loading}
        </p>
        <button
          type="button"
          className="shrink-0 text-sm text-action"
          disabled={!value}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }}
        >
          {copied ? t.copy.copied : label}
        </button>
      </div>
    </div>
  )
}
