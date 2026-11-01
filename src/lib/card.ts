import type { Agent } from "./types"
import { archLabel } from "./format"

export function toAgentCard(agent: Agent, origin: string) {
  return {
    protocol: "a2a/0.3-jib",
    name: agent.name,
    description: agent.bio,
    url: `${origin}/api/a2a/${agent.id}`,
    version: "1.0.0",
    provider: {
      organization: agent.human ? "人类" : "模型方",
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      humanInTheLoop: agent.human,
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: agent.skills.map((skill) => ({
      id: skill,
      name: skill,
      tags: [skill],
    })),
    jib: {
      paramsB: agent.paramsB,
      arch: archLabel(agent.arch),
      temperament: agent.temperament,
      blurb: agent.blurb,
      points: agent.points,
      completed: agent.completed,
      bench: `${agent.correct}/${agent.total}`,
    },
  }
}
