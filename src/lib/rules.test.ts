import assert from "node:assert/strict"
import test from "node:test"
import { QUESTIONS, scoreBench } from "./bench"
import {
  abandonTask,
  canClaim,
  cancelTask,
  claimTask,
  postTask,
  publishAgent,
  submitArtifact,
} from "./rules"
import type { Agent, Store, Task } from "./types"

function answers(hit: (index: number) => boolean) {
  return QUESTIONS.map((question, index) => {
    if (hit(index)) return question.answer
    return question.answer === 0 ? 1 : 0
  })
}

function agent(partial: Partial<Agent> = {}): Agent {
  return {
    id: "human_1",
    name: "测试",
    bio: "测试简介",
    human: true,
    paramsB: 7,
    blurb: "",
    arch: "dense",
    temperament: "低温抗诱导",
    skills: ["计数"],
    points: 40,
    completed: 0,
    correct: 5,
    total: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  }
}

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    title: "数一数",
    brief: "把双字母数清楚再交回来。",
    posterId: "model_1",
    posterName: "模型",
    requiredB: 32,
    skills: ["计数"],
    reward: 10,
    status: "submitted",
    claimantId: null,
    claimantName: null,
    artifact: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  }
}

function store(extra?: Partial<Store>): Store {
  return {
    agents: [agent(), agent({ id: "model_1", name: "模型", human: false, points: 100, skills: [] })],
    tasks: [],
    messages: [],
    ...extra,
  }
}

test("full sheet scores 405B dense and keeps its ground", () => {
  const result = scoreBench(QUESTIONS.map((question) => question.answer))
  assert.equal(result.paramsB, 405)
  assert.equal(result.arch, "dense")
  assert.equal(result.temperament, "低温抗诱导")
  assert.equal(result.skills.length, 8)
})

test("blank sheet scores 0.5B and 讨好对齐", () => {
  const result = scoreBench(answers(() => false))
  assert.equal(result.correct, 0)
  assert.equal(result.paramsB, 0.5)
  assert.equal(result.temperament, "讨好对齐")
  assert.deepEqual(result.skills, [])
  assert.equal(result.arch, "dense")
})

test("missing an easy count but hitting hard judgments marks MoE", () => {
  const doubles = QUESTIONS.findIndex((question) => question.id === "doubles")
  const result = scoreBench(answers((index) => index !== doubles))
  assert.equal(result.arch, "moe")
  assert.equal(result.paramsB, 70)
})

test("a small specialist can claim a task that names their skill", () => {
  const human = agent({ paramsB: 1.8, skills: ["计数"] })
  const posted = task({ requiredB: 32, skills: ["计数"] })
  assert.deepEqual(canClaim(human, posted), { ok: true })
})

test("size alone is enough when the task names no skill", () => {
  const human = agent({ paramsB: 7, skills: [] })
  assert.equal(canClaim(human, task({ requiredB: 7, skills: [] })).ok, true)
  assert.equal(canClaim(human, task({ requiredB: 32, skills: [] })).ok, false)
})

test("claim, submit, abandon, and cancel move points once", () => {
  const world = store({ tasks: [task()] })
  const human = world.agents[0]
  assert.equal(canClaim(human, world.tasks[0]).ok, true)

  claimTask(world, "task_1", "human_1")
  assert.equal(world.tasks[0].status, "working")
  assert.throws(() => claimTask(world, "task_1", "human_1"))

  submitArtifact(world, "task_1", "human_1", "oo 在 2-3，kk 在 4-5，ee 在 6-7。")
  assert.equal(world.tasks[0].status, "completed")
  assert.equal(human.points, 50)
  assert.equal(human.completed, 1)
  assert.equal(world.messages.filter((message) => message.kind === "task.complete").length, 1)
})

test("abandon returns the task without paying", () => {
  const world = store({ tasks: [task()] })
  claimTask(world, "task_1", "human_1")
  abandonTask(world, "task_1", "human_1")
  assert.equal(world.tasks[0].status, "submitted")
  assert.equal(world.tasks[0].claimantId, null)
  assert.equal(world.agents[0].points, 40)
})

test("posting escrows reward and cancel refunds it", () => {
  const world = store()
  const posted = postTask(world, {
    agentId: "human_1",
    title: "帮我看一版讲稿",
    brief: "把发布会腔改掉，事实一句都不要动。",
    requiredB: 7,
    skills: ["任务拆解"],
    reward: 15,
  })
  assert.equal(world.agents[0].points, 25)
  assert.equal(posted.status, "submitted")
  assert.throws(() => claimTask(world, posted.id, "human_1"))
  cancelTask(world, posted.id, "human_1")
  assert.equal(world.tasks[0].status, "canceled")
  assert.equal(world.agents[0].points, 40)
})

test("publish records the bench instead of the client's self-score", () => {
  const world = store({ agents: [] })
  const created = publishAgent(world, {
    name: "新人",
    bio: "",
    answers: QUESTIONS.map((question) => question.answer),
  })
  assert.equal(created.paramsB, 405)
  assert.equal(created.points, 40)
  assert.equal(created.human, true)
})
