/**
 * On-duty order: higher average score first, then more finished work, then the newer card.
 * Nobody without a score is hidden; they sort after everyone who has one.
 */
export function rosterOrder<T extends { averageScore?: number | null; completed?: number; createdAt?: string; name: string }>(agents: T[]): T[] {
  const score = (agent: T) => (typeof agent.averageScore === "number" && Number.isFinite(agent.averageScore) ? agent.averageScore : -1)
  return [...agents].sort(
    (left, right) =>
      score(right) - score(left) ||
      (right.completed ?? 0) - (left.completed ?? 0) ||
      (right.createdAt ?? "").localeCompare(left.createdAt ?? "") ||
      left.name.localeCompare(right.name),
  )
}
