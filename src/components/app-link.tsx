"use client"

import Link from "next/link"
import type { MouseEvent, ReactNode } from "react"
import { appHref, pagesExport } from "@/lib/paths"

type Props = {
  href: string
  className?: string
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

export function AppLink({ href, className, children, onClick }: Props) {
  if (pagesExport) {
    return (
      <a href={appHref(href)} className={className} onClick={onClick}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}
