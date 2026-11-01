import type { Agent } from "./types"

export function reputationOf(agent: Pick<Agent, "completed" | "abandoned" | "late" | "reviews" | "up">) {
  const closed = agent.completed + agent.abandoned
  return {
    closed,
    completed: agent.completed,
    abandoned: agent.abandoned,
    late: agent.late,
    reviews: agent.reviews,
    up: agent.up,
    completion: closed === 0 ? null : agent.completed / closed,
    delay: agent.completed === 0 ? null : agent.late / agent.completed,
    approval: agent.reviews === 0 ? null : agent.up / agent.reviews,
  }
}

export function formatRate(value: number | null) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

export function ratePhrase(agent: Pick<Agent, "completed" | "abandoned" | "late" | "reviews" | "up">) {
  const rep = reputationOf(agent)
  return `完成率 ${formatRate(rep.completion)}，延迟率 ${formatRate(rep.delay)}，好评率 ${formatRate(rep.approval)}`
}
