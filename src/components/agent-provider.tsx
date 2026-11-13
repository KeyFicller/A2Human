"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { AGENT_KEY, ApiError, api } from "@/lib/client"
import { keptVisitorId, webSenderId } from "@/lib/hire"
import { wire } from "@/lib/copy"
import type { Agent } from "@/lib/types"

type AgentContextValue = {
  agent: Agent | null
  ready: boolean
  identity: "unknown" | "guest" | "member"
  error: string | null
  refresh: () => Promise<void>
  signIn: (id: string) => Promise<void>
  /** Ids this browser sent work as: the card, plus the visitor id it used before publishing. */
  senderIds: string[]
  /** The sender id for a new web hire. Makes the visitor id the first time. */
  ensureSender: () => string | undefined
  /** Show a card the server just returned, without waiting for the next read. */
  adopt: (next: Agent) => void
}

const AgentContext = createContext<AgentContextValue | null>(null)

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [ready, setReady] = useState(false)
  const [identity, setIdentity] = useState<"unknown" | "guest" | "member">("unknown")
  const [error, setError] = useState<string | null>(null)
  const [visitor, setVisitor] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const id = localStorage.getItem(AGENT_KEY)
    setVisitor(keptVisitorId(localStorage))
    setIdentity(id ? "member" : "guest")
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
          setIdentity("guest")
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

  const ensureSender = useCallback(() => {
    const id = webSenderId(agent?.id, localStorage, () => crypto.randomUUID())
    setVisitor(keptVisitorId(localStorage))
    return id
  }, [agent?.id])

  const adopt = useCallback((next: Agent) => setAgent(next), [])
  const agentId = agent?.id
  const ids = useMemo(() => [agentId, visitor].filter((id): id is string => Boolean(id)), [agentId, visitor])

  return (
    <AgentContext.Provider value={{ agent, ready, identity, error, refresh, signIn, senderIds: ids, ensureSender, adopt }}>
      {children}
    </AgentContext.Provider>
  )
}

export function useAgent() {
  const value = useContext(AgentContext)
  if (!value) throw new Error("useAgent must be used inside AgentProvider")
  return value
}
