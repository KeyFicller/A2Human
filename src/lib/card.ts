import { onDuty } from "./rules"
import type { Agent, JsonSchema, Skill } from "./types"

function skillEntry(skill: Skill) {
  return {
    id: skill.name,
    name: skill.name,
    description: skill.description,
    tags: ["human"],
    ...(skill.inputSchema && skill.outputSchema
      ? { inputModes: ["application/json"], outputModes: ["application/json"] }
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
  const schemaNote = Object.keys(schemas).length
    ? " params.skillSchemas 写每项技能要的输入和会交回的输出，都是 JSON Schema。对应 skills 的 inputModes 和 outputModes 是 application/json。"
    : ""
  return {
    uri: `${origin}/extensions/a2human/v1`,
    description: options?.roster
      ? "onDuty 列出正在上工的人、他们自己写的技能，以及各自的调用地址。模型自己选一个人，把 SendMessage 打到那个 url。configuration.returnImmediately 必须为 true。"
      : `这个人自己写的技能说明能完成什么。上工之后才会出现在发现名单里。SendMessage 要设 configuration.returnImmediately 为 true，产物用 GetTask 取。${schemaNote}`,
    required: false,
    params: {
      returnImmediately: true,
      ...(options?.roster ? { onDuty: options.roster } : {}),
      ...(Object.keys(schemas).length ? { skillSchemas: schemas } : {}),
    },
  }
}

export function toAgentCard(agent: Agent, origin: string) {
  const endpoint = `${origin}/api/a2a/${agent.id}`
  return {
    name: agent.name,
    description: agent.human
      ? `${agent.bio}${agent.available ? " 现在在岗。" : " 现在不在岗。"}`
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
    },
  }
}

export function dispatcherCard(origin: string, agents: Agent[]) {
  const roster = onDuty(agents).map((agent) => ({
    name: agent.name,
    skills: agent.skills,
    url: `${origin}/api/a2a/${agent.id}`,
  }))
  return {
    name: "A2Human",
    description: "发现正在上工的人。每人的 skills 写明能完成什么。选中一个人，把 SendMessage 打到对方的 url。",
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
        name: "发现在岗的人",
        description: "读 onDuty。里面是在岗的人、技能说明和调用地址。广场不代为指派。",
        tags: ["human", "discover"],
      },
    ],
    a2human: {
      humanInTheLoop: true,
      onDuty: roster,
    },
  }
}
