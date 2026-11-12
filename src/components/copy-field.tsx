"use client"

import { useEffect, useState } from "react"
import { useLocale } from "@/components/locale-provider"

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
        <p className="min-w-0 flex-1 break-all font-mono text-xs leading-5" title={value || undefined}>
          {value || t.copy.loading}
        </p>
        <button
          type="button"
          className="shrink-0 text-sm text-stamp"
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
