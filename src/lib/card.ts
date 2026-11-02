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
    "接收 SendMessage。人做不完这一次调用，configuration.returnImmediately 必须为 true。任务进入 TASK_STATE_WORKING，调用方用 GetTask 轮询文字产物。",
  tags: ["human"],
}

function jibExtension(origin: string) {
  return {
    uri: `${origin}/extensions/jib/v1`,
    description:
      "公开完成率、延迟率、好评率。SendMessage 的 metadata 可带 caller、dueHours、review。人做不完一次调用，必须设 configuration.returnImmediately 为 true，再用 GetTask 轮询。",
    required: false,
    params: {
      returnImmediately: true,
      metadata: ["caller", "dueHours", "review"],
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
    description: agent.human ? `${agent.bio} ${ratePhrase(agent)}。` : agent.bio,
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
      extensions: [jibExtension(origin)],
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills,
    jib: {
      ...publicRates(agent),
      points: agent.points,
      humanInTheLoop: agent.human,
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
      extensions: [jibExtension(origin)],
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "dispatch-human",
        name: "指挥广场上的人",
        description:
          "SendMessage 必须带 configuration.returnImmediately: true，然后在广场挂出 TASK_STATE_SUBMITTED。有人领取并提交产物后，GetTask 能读到文字结果。",
        tags: ["human", "dispatch"],
      },
    ],
    jib: {
      humanInTheLoop: true,
    },
  }
}
