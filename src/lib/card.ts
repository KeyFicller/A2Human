import { onDuty } from "./rules"
import { ratePhrase, reputationOf } from "./reputation"
import type { Agent } from "./types"

function skillEntry(skill: string) {
  return {
    id: skill,
    name: skill,
    description: `这个人自己标的技能：${skill}。`,
    tags: [skill, "human"],
  }
}

const takeOrders = {
  id: "take-orders",
  name: "接模型派来的活",
    description:
      "只在这个人挂上岗时接单。模型按技能从广场的在岗名单找到地址，再 SendMessage。configuration.returnImmediately 必须为 true，任务立刻进入 TASK_STATE_WORKING，产物用 GetTask 取。",
  tags: ["human"],
}

function dangbanExtension(origin: string, roster?: { name: string; skills: string[]; url: string }[]) {
  return {
    uri: `${origin}/extensions/dangban/v1`,
    description:
      "公开完成率、延迟率、好评率，以及谁正在岗。广场卡片的 onDuty 按技能列出可派的人。SendMessage 的 metadata 可带 skill、caller、dueHours、review。指派要设 configuration.returnImmediately 为 true。",
    required: false,
    params: {
      returnImmediately: true,
      metadata: ["skill", "caller", "dueHours", "review"],
      ...(roster ? { onDuty: roster } : {}),
    },
  }
}

export function toAgentCard(agent: Agent, origin: string) {
  const endpoint = `${origin}/api/a2a/${agent.id}`
  const skills = agent.human
    ? [takeOrders, ...agent.skills.map(skillEntry)]
    : [
        {
          id: "post-work",
          name: "把翻车的活挂出来",
          description: "模型方只在广场上发任务，不接受 SendMessage。",
          tags: ["model"],
        },
      ]
  return {
    name: agent.name,
    description: agent.human
      ? `${agent.bio} ${ratePhrase(agent)}。${agent.available ? "现在在岗。" : "现在不在岗。"}`
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
      organization: "当班",
      url: origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [dangbanExtension(origin)],
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills,
    dangban: {
      ...publicRates(agent),
      points: agent.points,
      humanInTheLoop: agent.human,
      available: agent.human ? agent.available : false,
    },
  }
}

function publicRates(agent: Agent) {
  if (!agent.human) return { completionRate: null, delayRate: null, approvalRate: null }
  const rep = reputationOf(agent)
  const round = (value: number | null) => (value == null ? null : Math.round(value * 100) / 100)
  return {
    completionRate: round(rep.completion),
    delayRate: round(rep.delay),
    approvalRate: round(rep.approval),
  }
}

export function dispatcherCard(origin: string, agents: Agent[]) {
  const roster = onDuty(agents).map((agent) => ({
    name: agent.name,
    skills: agent.skills,
    url: `${origin}/api/a2a/${agent.id}`,
    ...publicRates(agent),
  }))
  return {
    name: "当班",
    description: "发现在岗的人，并按技能立刻指派。同一技能有多人在岗时，按好评率、再按完成单数挑选。",
    version: "1.0.0",
    supportedInterfaces: [
      {
        url: `${origin}/api/a2a`,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    provider: {
      organization: "当班",
      url: origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [dangbanExtension(origin, roster)],
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "dispatch-human",
        name: "指挥广场上的人",
        description:
          "带 metadata.skill 和 configuration.returnImmediately: true。广场立刻把活派给在岗且会这项技能的人，状态是 TASK_STATE_WORKING。产物用 GetTask 取。",
        tags: ["human", "dispatch"],
      },
    ],
    dangban: {
      humanInTheLoop: true,
      onDuty: roster,
    },
  }
}
