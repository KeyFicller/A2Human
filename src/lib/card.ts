import { wire } from "./copy"
import { contractModes } from "./schema-fields"
import { onDuty, workRecord } from "./rules"
import type { Agent, JsonSchema, Skill, Task } from "./types"

function skillEntry(skill: Skill) {
  return {
    id: skill.name,
    name: skill.name,
    description: skill.description,
    tags: ["human"],
    ...(skill.inputSchema && skill.outputSchema
      ? { inputModes: contractModes(skill.inputSchema), outputModes: contractModes(skill.outputSchema) }
      : {}),
  }
}

function skillSchemas(skills: Skill[]) {
  const schemas: Record<string, { inputSchema: JsonSchema; outputSchema: JsonSchema }> = {}
  for (const skill of skills) {
    if (!skill.inputSchema || !skill.outputSchema) continue
    schemas[skill.name] = { inputSchema: skill.inputSchema, outputSchema: skill.outputSchema }
  }
  return schemas
}

function a2humanExtension(
  origin: string,
  options?: {
    roster?: { name: string; skills: Skill[]; url: string }[]
    skills?: Skill[]
  },
) {
  const schemas = skillSchemas(options?.skills ?? [])
  const schemaNote = Object.keys(schemas).length ? wire("card.schemaNote") : ""
  return {
    uri: `${origin}/extensions/a2human/v1`,
    description: options?.roster
      ? wire("card.roster")
      : wire("card.person", { schemaNote }),
    required: false,
    params: {
      returnImmediately: true,
      ...(options?.roster ? { onDuty: options.roster } : {}),
      ...(Object.keys(schemas).length ? { skillSchemas: schemas } : {}),
    },
  }
}

export function toAgentCard(agent: Agent, origin: string, tasks: Task[] = []) {
  const endpoint = `${origin}/api/a2a/${agent.id}`
  const record = workRecord(tasks, agent.id)
  return {
    name: agent.name,
    description: agent.human
      ? `${agent.bio}${agent.available ? wire("card.dutyOn") : wire("card.dutyOff")}`
      : agent.bio,
    version: "1.0.0",
    supportedInterfaces: [
      {
        url: endpoint,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    provider: {
      organization: "A2Human",
      url: origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [a2humanExtension(origin, { skills: agent.skills })],
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: agent.skills.map(skillEntry),
    a2human: {
      humanInTheLoop: agent.human,
      available: agent.human ? agent.available : false,
      completed: record.completed,
      averageScore: record.averageScore,
      averageDuration: record.averageDuration,
    },
  }
}

export function dispatcherCard(origin: string, agents: Agent[], tasks: Task[] = []) {
  const roster = onDuty(agents).map((agent) => ({
    name: agent.name,
    skills: agent.skills,
    url: `${origin}/api/a2a/${agent.id}`,
    ...workRecord(tasks, agent.id),
  }))
  return {
    name: "A2Human",
    description: wire("card.dispatcher"),
    version: "1.0.0",
    supportedInterfaces: [
      {
        url: `${origin}/api/a2a`,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    provider: {
      organization: "A2Human",
      url: origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [a2humanExtension(origin, { roster })],
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "discover-humans",
        name: wire("card.discoverName"),
        description: wire("card.discoverDescription"),
        tags: ["human", "discover"],
      },
    ],
    a2human: {
      humanInTheLoop: true,
      onDuty: roster,
    },
  }
}
