"use client"

import { useEffect, useState } from "react"

// Baked at build time. Empty or unset keeps /api on this host (Docker and local).
// GitHub Pages must set an absolute origin; the Pages build refuses to run without one.
const CONFIGURED = process.env.NEXT_PUBLIC_API_ORIGIN

export function apiOrigin(): string {
  if (!CONFIGURED) return ""
  return CONFIGURED.replace(/\/$/, "")
}

export function apiUrl(path: string): string {
  const origin = apiOrigin()
  return origin ? `${origin}${path}` : path
}

export function useApiOrigin(): string {
  const fixed = apiOrigin()
  const [origin, setOrigin] = useState(fixed)
  useEffect(() => {
    if (!fixed) setOrigin(window.location.origin)
  }, [fixed])
  return origin
}
