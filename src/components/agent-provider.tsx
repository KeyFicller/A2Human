"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { AGENT_KEY, ApiError, api } from "@/lib/client"
import { wire } from "@/lib/copy"
import type { Agent } from "@/lib/types"

type AgentContextValue = {
  agent: Agent | null
  ready: boolean
  error: string | null
  refresh: () => Promise<void>
  signIn: (id: string) => Promise<void>
}

const AgentContext = createContext<AgentContextValue | null>(null)

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const id = localStorage.getItem(AGENT_KEY)
    if (!id) {
      return Promise.resolve().then(() => {
        setAgent(null)
        setError(null)
        setReady(true)
      })
    }
    return api<Agent>(`/api/agents/${id}`)
      .then((next) => {
        setAgent(next)
        setError(null)
      })
      .catch((caught: unknown) => {
        const missing = caught instanceof ApiError && [wire("agent.missing"), wire("task.missing")].some((item) => caught.message.includes(item))
        if (missing) {
          localStorage.removeItem(AGENT_KEY)
          setAgent(null)
          setError(null)
        } else {
          setError(caught instanceof Error ? caught.message : wire("identity.failed"))
        }
      })
      .finally(() => {
        setReady(true)
      })
  }, [])

  const signIn = useCallback(
    (id: string) => {
      localStorage.setItem(AGENT_KEY, id)
      return refresh()
    },
    [refresh],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <AgentContext.Provider value={{ agent, ready, error, refresh, signIn }}>
      {children}
    </AgentContext.Provider>
  )
}

export function useAgent() {
  const value = useContext(AgentContext)
  if (!value) throw new Error("useAgent must be used inside AgentProvider")
  return value
}
