"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/client"
import { skillLabel } from "@/lib/skill-catalog"
import type { Agent, Task } from "@/lib/types"

/** Display names of the skills on the cards that work went to, so a sent task shows the skill name, not its tool id. */
export function useSkillTitles(locale: "zh" | "en") {
  const [agents, setAgents] = useState<Agent[]>([])
  useEffect(() => {
    let alive = true
    api<Agent[]>("/api/agents")
      .then((next) => {
        if (alive) setAgents(next)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return (task: Pick<Task, "claimantId" | "targetId">): Record<string, string> | undefined => {
    const owner = agents.find((agent) => agent.id === (task.claimantId || task.targetId))
    return owner ? Object.fromEntries(owner.skills.map((skill) => [skill.name, skillLabel(skill, locale)])) : undefined
  }
}
