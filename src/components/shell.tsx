"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AgentProvider, useAgent } from "@/components/agent-provider"
import { LocaleProvider, useLocale } from "@/components/locale-provider"
import { WorkNotice } from "@/components/work-notice"
import type { Locale } from "@/lib/messages"
import { cn } from "cn"

function LocaleSwitch() {
  const { locale, setLocale } = useLocale()
  const item = (value: Locale, label: string) => (
    <button
      type="button"
      className={cn("shrink-0 rounded-full px-2.5 py-1.5", locale === value ? "bg-ink text-[#f7f1e4]" : "text-muted-foreground")}
      aria-pressed={locale === value}
      onClick={() => setLocale(value)}
    >
      {label}
    </button>
  )
  return (
    <div className="flex shrink-0 gap-1 font-mono text-[11px]">
      {item("zh", "中文")}
      {item("en", "English")}
    </div>
  )
}

function Header() {
  const pathname = usePathname()
  const { agent, ready } = useAgent()
  const { t } = useLocale()
  const links = [
    { href: "/publish", label: t.nav.publish },
    { href: "/agents", label: t.nav.duty },
    { href: "/me", label: t.nav.mine },
  ]

  return (
    <header className="sticky top-0 z-20 border-b border-[#d9d0c0] bg-[#efe8d8]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-baseline gap-2">
            <span className="font-serif text-2xl tracking-tight text-stamp">A2Human</span>
            <span className="hidden font-mono text-[11px] tracking-[0.18em] text-muted-foreground sm:inline">AGENT CARD</span>
          </Link>
          <div className="flex items-center gap-3">
            <LocaleSwitch />
            <div className="hidden text-right md:block">
              {ready && agent ? (
                <Link href="/me" className="text-sm">
                  <span className="font-serif text-lg">{agent.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {agent.human ? (agent.available ? t.duty.on : t.duty.off) : t.duty.model}
                  </span>
                </Link>
              ) : (
                <Link href="/publish" className="text-sm text-stamp">
                  {t.duty.unpublished}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <nav className="flex min-w-0 gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm", active ? "bg-ink text-[#f7f1e4]" : "text-ink hover:bg-secondary")}
                >
                  {link.label}
                </Link>
              )
            })}
          </nav>
          {ready && agent ? (
            <Link href="/me" className="shrink-0 font-mono text-xs text-ink md:hidden">
              {agent.name}
              {agent.human ? ` · ${agent.available ? t.duty.on : t.duty.off}` : ""}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function HeaderFallback() {
  return (
    <header className="sticky top-0 z-20 border-b border-[#d9d0c0] bg-[#efe8d8]/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
        <span className="font-serif text-2xl text-stamp">A2Human</span>
      </div>
    </header>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  const { t } = useLocale()
  return (
    <>
      <Suspense fallback={<HeaderFallback />}>
        <Header />
      </Suspense>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-8 md:py-12">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 text-xs leading-5 text-muted-foreground">{t.footer}</footer>
      <Suspense fallback={null}>
        <WorkNotice />
      </Suspense>
    </>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <AgentProvider>
        <Frame>{children}</Frame>
      </AgentProvider>
    </LocaleProvider>
  )
}
