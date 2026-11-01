export const SKILLS = [
  "计数",
  "数字比较",
  "物理世界",
  "抗诱导",
  "中文语境",
  "协议诚实",
  "边界感",
  "任务拆解",
] as const

export type Skill = (typeof SKILLS)[number]

export const DUE_HOURS = [4, 12, 24, 72] as const

export type DueHours = (typeof DUE_HOURS)[number]
