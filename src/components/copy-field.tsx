"use client"

import { useEffect, useState } from "react"

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div className="mt-3">
      {hint ? <p className="text-sm leading-6 text-muted-foreground">{hint}</p> : null}
      <p className="mt-1 break-all font-mono text-xs">{value || "加载中"}</p>
      <button
        type="button"
        className="mt-2 text-sm text-stamp"
        disabled={!value}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }}
      >
        {copied ? "已复制" : label}
      </button>
    </div>
  )
}
