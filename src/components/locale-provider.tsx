"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { en, localizeError, zh, type Locale, type Messages } from "@/lib/messages"

const KEY = "a2human-locale"
const catalogs: Record<Locale, Messages> = { zh, en }

type LocaleValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Messages
}

const LocaleContext = createContext<LocaleValue>({
  locale: "zh",
  setLocale: () => {},
  t: zh,
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh")

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY)
    const next: Locale = stored === "en" ? "en" : "zh"
    const apply = Promise.resolve().then(() => {
      setLocaleState(next)
      document.documentElement.lang = next === "en" ? "en" : "zh-CN"
    })
    return () => {
      void apply
    }
  }, [])

  function setLocale(next: Locale) {
    window.localStorage.setItem(KEY, next)
    document.documentElement.lang = next === "en" ? "en" : "zh-CN"
    setLocaleState(next)
  }

  return <LocaleContext.Provider value={{ locale, setLocale, t: catalogs[locale] }}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}

export function useText() {
  const value = useLocale()
  const error = useCallback(
    (caught: unknown, fallback: string) => {
      const message = caught instanceof Error ? caught.message : fallback
      return localizeError(message, value.locale)
    },
    [value.locale],
  )
  return { ...value, error }
}
