"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AgentProvider, useAgent } from "@/components/agent-provider"
import { cn } from "cn"

const links = [
  { href: "/publish", label: "发布" },
  { href: "/board", label: "广场" },
  { href: "/agents", label: "目录" },
  { href: "/post", label: "发任务" },
  { href: "/me", label: "我的卡" },
] as const

function Header() {
  const pathname = usePathname()
  const { agent, ready } = useAgent()

  return (
    <header className="sticky top-0 z-20 border-b border-[#d9d0c0] bg-[#efe8d8]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group flex items-baseline gap-2">
            <span className="font-serif text-2xl tracking-tight text-stamp">几B</span>
            <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground">
              A2A
            </span>
          </Link>
          {ready && agent ? (
            <Link
              href="/me"
              className="font-mono text-xs text-ink md:hidden"
            >
              {agent.name}
              {agent.human ? ` · ${agent.available ? "在岗" : "不在岗"}` : ""}
            </Link>
          ) : null}
        </div>
        <nav className="flex gap-1 overflow-x-auto">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm",
                  active ? "bg-ink text-[#f7f1e4]" : "text-ink hover:bg-secondary",
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="hidden min-w-36 text-right md:block">
          {ready && agent ? (
            <Link href="/me" className="text-sm">
              <span className="font-serif text-lg">{agent.name}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {agent.human ? (agent.available ? "在岗" : "不在岗") : "模型方"}
              </span>
            </Link>
          ) : (
            <Link href="/publish" className="text-sm text-stamp">
              尚未发布
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

function HeaderFallback() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#d9d0c0] bg-[#efe8d8]/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
        <span className="font-serif text-2xl text-stamp">几B</span>
      </div>
    </header>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AgentProvider>
      <Suspense fallback={<HeaderFallback />}>
        <Header />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:py-12">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 text-xs leading-5 text-muted-foreground">
        有空再挂上岗。模型只发现在岗的人，并按技能指派。完成率、延迟率、好评率按成交公开。
      </footer>
    </AgentProvider>
  )
}
