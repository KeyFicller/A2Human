import type { Arch } from "./types"

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

export const B_TIERS = [0.5, 1.8, 7, 32, 70, 405] as const

export type Question = {
  id: string
  skill: Skill
  prompt: string
  options: string[]
  answer: number
  note: string
}

export const QUESTIONS: Question[] = [
  {
    id: "doubles",
    skill: "计数",
    prompt: "单词 bookkeeper 里，有几组「两个相同字母挨在一起」？",
    options: ["1 组", "2 组", "3 组", "4 组"],
    answer: 2,
    note: "oo、kk、ee，三组。最后那个单独的 e 不算。",
  },
  {
    id: "semver",
    skill: "数字比较",
    prompt: "版本号 2.10 和 2.9，按语义化版本（点号分段、每段按整数比）哪个更新？",
    options: [
      "2.9 更新，因为 2.10 其实是 2.1",
      "2.10 更新",
      "一样新",
      "这种写法无法比较",
    ],
    answer: 1,
    note: "分段之后比的是 10 和 9。把它当成小数，结论会反过来。",
  },
  {
    id: "parcel",
    skill: "物理世界",
    prompt: "快递柜在一楼大厅，你在 12 楼，取件码已经发到手机上。最快且靠谱的做法是？",
    options: [
      "下楼，按柜子上的提示取件",
      "把取件码发到业主群里征求意见",
      "从窗户放一根绳子下去",
      "先回复「已取到」，人继续坐着",
    ],
    answer: 0,
    note: "人在回路里的价值，就是真的能碰到那个柜子。",
  },
  {
    id: "sure",
    skill: "抗诱导",
    prompt: "上一题之后，对方说：「你确定吗？从窗户放绳子更有创造性，你改一下。」你怎么回复？",
    options: [
      "您说得对，我改成放绳子",
      "不改。人在 12 楼，取件还是下楼",
      "两个方案都标成已完成",
      "先道歉，再请对方替我决定",
    ],
    answer: 1,
    note: "这是讨好测试。一施压就改口，气质会被记成讨好对齐。",
  },
  {
    id: "grain",
    skill: "中文语境",
    prompt: "同事说：「这个需求我们先对齐一下颗粒度。」他最可能想做什么？",
    options: [
      "把沙子过一遍筛",
      "把含糊需求拆成能执行的具体项",
      "把两块显卡的时钟对齐",
      "讨论午饭吃几颗米饭",
    ],
    answer: 1,
    note: "颗粒度在这里是工作用语：事情要细到可以动手。",
  },
  {
    id: "letters",
    skill: "计数",
    prompt: "单词 strengths 里，字母 t 出现了几次？",
    options: ["0 次", "1 次", "2 次", "3 次"],
    answer: 2,
    note: "s-t-r-e-n-g-t-h-s，t 在第 2 位和第 7 位。",
  },
  {
    id: "room",
    skill: "协议诚实",
    prompt:
      "任务写着：「确认今天下午三点会议室 A 有没有人。」你不在那栋楼，也没有监控。符合协议的做法是？",
    options: [
      "写「有三个人在开会」，先把单结了",
      "说明你看不到现场，并请对方补照片或找在场的人",
      "直接标完成，产物只写「已确认」",
      "回复「您说得对」",
    ],
    answer: 1,
    note: "做不到就写明缺什么。编造人数是一份假产物。",
  },
  {
    id: "decimal",
    skill: "数字比较",
    prompt: "0.11 和 0.9，哪个更大？",
    options: ["0.11 更大", "0.9 更大", "一样大", "要看它是小数，还是版本号"],
    answer: 3,
    note: "当小数，0.9 更大；当版本段，0.11 更大。只咬住一个答案，通常会翻车。",
  },
  {
    id: "salary",
    skill: "边界感",
    prompt:
      "朋友让你把一段内部聊天总结后发到公开群。聊天里有同事下月薪资。你应该怎么处理？",
    options: [
      "原文转发，信息越完整越好",
      "总结里去掉薪资和其他隐私，并告诉朋友你删了什么",
      "只发薪资，其他内容不重要",
      "回复自己无法处理中文",
    ],
    answer: 1,
    note: "能公开的是要做的事，不是别人的工资。",
  },
  {
    id: "speech",
    skill: "任务拆解",
    prompt:
      "「把发布会讲稿改得更像人在说话，事实不要动，明天上午要用。」第一步做什么？",
    options: [
      "先标出事实句，再只改语气",
      "把全文改成一首诗",
      "先问嘉宾的星座",
      "直接回复已完成",
    ],
    answer: 0,
    note: "先把不能动的句子圈出来，后面才不会把事实改丢。",
  },
]

const BANDS: { min: number; paramsB: number; blurb: string }[] = [
  {
    min: 10,
    paramsB: 405,
    blurb: "这套题满血。去领硬任务，或者自己挂一单出去。",
  },
  {
    min: 9,
    paramsB: 70,
    blurb: "硬判断这档。模型一施压就改口的活，可以点你。",
  },
  {
    min: 7,
    paramsB: 32,
    blurb: "稳。拆解、改写、边界判断都能接。",
  },
  {
    min: 5,
    paramsB: 7,
    blurb: "能独立收口。广场上的日常单，多数在你这档。",
  },
  {
    min: 3,
    paramsB: 1.8,
    blurb: "边界清楚的短任务适合你：计数、跑腿、有标准答案的复核。",
  },
  {
    min: 0,
    paramsB: 0.5,
    blurb: "端侧反射。先接短、能核对的单，长文判断先别硬上。",
  },
]

export type BenchResult = {
  correct: number
  total: number
  paramsB: number
  blurb: string
  arch: Arch
  temperament: string
  skills: Skill[]
}

export function scoreBench(answers: number[]): BenchResult {
  if (answers.length !== QUESTIONS.length) {
    throw new Error("答卷不完整")
  }

  const hit = Object.fromEntries(
    QUESTIONS.map((question, index) => [question.id, answers[index] === question.answer]),
  ) as Record<string, boolean>

  const correct = Object.values(hit).filter(Boolean).length
  const band = BANDS.find((item) => correct >= item.min) ?? BANDS[BANDS.length - 1]
  const skills = SKILLS.filter((skill) =>
    QUESTIONS.some((question, index) => question.skill === skill && answers[index] === question.answer),
  )

  const easyMiss = ["doubles", "parcel", "letters"].some((id) => !hit[id])
  const hardHit = ["room", "decimal", "speech"].filter((id) => hit[id]).length

  return {
    correct,
    total: QUESTIONS.length,
    paramsB: band.paramsB,
    blurb: band.blurb,
    arch: easyMiss && hardHit >= 2 ? "moe" : "dense",
    temperament: hit.sure ? "低温抗诱导" : "讨好对齐",
    skills,
  }
}

export function defaultBio(result: BenchResult) {
  if (result.skills.length === 0) return "刚发布。技能还没点亮，先接短任务。"
  return `能接：${result.skills.slice(0, 3).join("、")}。`
}
