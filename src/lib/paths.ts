"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

export const pagesExport = process.env.NEXT_PUBLIC_PAGES === "1"
const BASE = "/A2Human"
const STORAGE_KEY = "a2h-path"

const ALIASES: Record<string, string> = {
  "/bench": "/publish",
  "/post": "/me",
  "/board": "/me",
}

export function canonicalPath(pathname: string): string {
  let path = pathname
  if (pagesExport && (path === BASE || path.startsWith(`${BASE}/`))) path = path.slice(BASE.length) || "/"
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  try {
    path = decodeURIComponent(path)
  } catch {
    // Keep the raw path when a segment is not valid encoding.
  }
  if (ALIASES[path]) return ALIASES[path]
  if (path.startsWith("/board/")) return `/tasks/${path.slice("/board/".length)}`
  return path || "/"
}

export function appHref(href: string): string {
  const hashAt = href.indexOf("#")
  const hash = hashAt >= 0 ? href.slice(hashAt) : ""
  const beforeHash = hashAt >= 0 ? href.slice(0, hashAt) : href
  const queryAt = beforeHash.indexOf("?")
  const query = queryAt >= 0 ? beforeHash.slice(queryAt) : ""
  const pathname = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash
  const parts = pathname.split("/").filter(Boolean).map((part) => encodeURIComponent(part))
  const slashed = parts.length === 0 ? "/" : `/${parts.join("/")}/`
  return `${BASE}${slashed}${query}${hash}`
}

export function storedPagesPath(): string | null {
  if (!pagesExport || typeof window === "undefined") return null
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function go(href: string) {
  window.location.assign(appHref(href))
}

export function useAppPath(): string {
  const nextPath = canonicalPath(usePathname() || "/")
  const [path, setPath] = useState(nextPath)
  useEffect(() => {
    if (!pagesExport) {
      setPath(nextPath)
      return
    }
    setPath(storedPagesPath() || canonicalPath(window.location.pathname))
  }, [nextPath])
  return path
}
