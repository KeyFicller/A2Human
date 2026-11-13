"use client"

import { useEffect, useState } from "react"

/** The current time, ticking while `active` is true. */
export function useNow(active: boolean, everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, everyMs)
    return () => window.clearInterval(timer)
  }, [active, everyMs])
  return now
}
