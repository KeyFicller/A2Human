"use client"

import { Suspense } from "react"
import { AppLink } from "@/components/app-link"
import { AgentProvider, useAgent } from "@/components/agent-provider"
import { LocaleProvider, useLocale } from "@/components/locale-provider"
import { WorkNotice } from "@/components/work-notice"
import type { Locale } from "@/lib/messages"
import { useAppPath } from "@/lib/paths"
import { cn } from "cn"

function LocaleSwitch() {
  const { locale, setLocale, t } = useLocale()
  const item = (value: Locale, label: string) => (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-9 min-w-12 shrink-0 items-center justify-center rounded-full px-3 py-1.5",
        locale === value ? "bg-ink text-[#f7f1e4]" : "text-muted-foreground hover:bg-secondary hover:text-ink",
      )}
      aria-pressed={locale === value}
      onClick={() => setLocale(value)}
    >
      {label}
    </button>
  )
  return (
    <div className="flex shrink-0 gap-1 font-mono text-xs">
      {item("zh", t.locale.zh)}
      {item("en", t.locale.en)}
    </div>
  )
}

function Header() {
  const pathname = useAppPath()
  const { agent, ready, identity } = useAgent()
  const { t } = useLocale()
  const links = [
    // One browser holds one card. Once it exists, this page edits it, so the link says so.
    { href: "/publish", label: ready && agent ? t.nav.edit : t.nav.publish },
    { href: "/agents", label: t.nav.duty },
    { href: "/me", label: t.nav.mine },
  ]

  return (
    <header className="sticky top-0 z-20 border-b border-[#d9d0c0] bg-[#efe8d8]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <AppLink href="/" className="flex min-w-0 items-baseline gap-2">
            <span className="font-serif text-2xl tracking-tight text-stamp">A2Human</span>
            <span className="hidden font-mono text-[11px] tracking-[0.18em] text-muted-foreground sm:inline">{t.brand}</span>
          </AppLink>
          <div className="flex items-center gap-3">
            <div className="hidden text-right md:block">
              {ready && agent ? (
                <AppLink href="/me" className="text-sm">
                  <span className="font-serif text-lg">{agent.name}</span>
                  <span aria-hidden="true" className="mx-1.5 text-muted-foreground">
                    ·
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {agent.human ? (agent.available ? t.duty.on : t.duty.off) : t.duty.model}
                  </span>
                </AppLink>
              ) : identity === "guest" && ready ? (
                <AppLink href="/publish" className="text-sm text-action">
                  {t.duty.unpublished}
                </AppLink>
              ) : (
                <span className="text-sm text-muted-foreground">{t.duty.opening}</span>
              )}
            </div>
            <LocaleSwitch />
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <nav className="flex min-w-0 gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
              return (
                <AppLink
                  key={link.href}
                  href={link.href}
                  className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm", active ? "bg-ink text-[#f7f1e4]" : "text-ink hover:bg-secondary")}
                >
                  {link.label}
                </AppLink>
              )
            })}
          </nav>
          {ready && agent ? (
            <AppLink href="/me" className="shrink-0 font-mono text-xs text-ink md:hidden">
              {agent.name}
              {agent.human ? ` · ${agent.available ? t.duty.on : t.duty.off}` : ""}
            </AppLink>
          ) : identity === "guest" && ready ? null : (
            <span className="shrink-0 font-mono text-xs text-muted-foreground md:hidden">{t.duty.opening}</span>
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
