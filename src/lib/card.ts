import type { Agent } from "./types"
import { archLabel } from "./format"

function skillEntry(skill: string) {
  return {
    id: skill,
    name: skill,
    description: `测评里点亮的技能：${skill}。模型派活时可以按这个点名。`,
    tags: [skill, "human"],
  }
}

const takeOrders = {
  id: "take-orders",
  name: "接模型派来的活",
  description: "接收 SendMessage。这个人亲自做完，再把文字产物写回任务，调用方用 GetTask 读取。",
  tags: ["human"],
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
    description: agent.bio || agent.blurb,
    version: "1.0.0",
    supportedInterfaces: [
      {
        url: endpoint,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    provider: {
      organization: "几B协议",
      url: origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills,
    jib: {
      paramsB: agent.paramsB,
      arch: archLabel(agent.arch),
      temperament: agent.temperament,
      blurb: agent.blurb,
      points: agent.points,
      completed: agent.completed,
      bench: `${agent.correct}/${agent.total}`,
      humanInTheLoop: agent.human,
    },
  }
}

export function dispatcherCard(origin: string) {
  return {
    name: "几B协议",
    description: "把活派到广场上，等已发布的人来领。要直接指挥某一个人，改用那张卡上的地址。",
    version: "1.0.0",
    supportedInterfaces: [
      {
        url: `${origin}/api/a2a`,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    provider: {
      organization: "几B协议",
      url: origin,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "dispatch-human",
        name: "指挥广场上的人",
        description: "SendMessage 会挂出一张待领任务。有人领取并提交产物后，GetTask 能读到文字结果。",
        tags: ["human", "dispatch"],
      },
    ],
    jib: {
      humanInTheLoop: true,
    },
  }
}
