import assert from "node:assert/strict"
import test from "node:test"
import { reputationOf } from "./reputation"
import {
  abandonTask,
  canClaim,
  cancelTask,
  claimTask,
  postTask,
  publishAgent,
  rateTask,
  setAvailability,
  submitArtifact,
} from "./rules"
import type { Agent, Store, Task } from "./types"

function agent(partial: Partial<Agent> = {}): Agent {
  return {
    id: "human_1",
    name: "测试",
    bio: "测试简介",
    human: true,
    available: false,
    skills: ["计数"],
    points: 40,
    completed: 0,
    abandoned: 0,
    late: 0,
    reviews: 0,
    up: 0,
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
    skills: ["计数"],
    reward: 10,
    status: "submitted",
    claimantId: null,
    claimantName: null,
    artifact: null,
    review: null,
    dueAt: "2099-01-01T00:00:00.000Z",
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

test("anyone but the poster can claim", () => {
  const human = agent({ skills: [] })
  assert.equal(canClaim(human, task({ skills: ["物理世界"] })).ok, true)
  assert.equal(canClaim(human, task({ posterId: human.id })).ok, false)
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
  assert.equal(human.late, 0)
  assert.equal(world.messages.filter((message) => message.kind === "task.complete").length, 1)
})

test("a late delivery is counted, and the poster rates once", () => {
  const world = store({ tasks: [task({ dueAt: "2000-01-01T00:00:00.000Z" })] })
  claimTask(world, "task_1", "human_1")
  submitArtifact(world, "task_1", "human_1", "过了截止才交上来。")
  const human = world.agents[0]
  assert.equal(human.late, 1)
  assert.equal(world.tasks[0].late, true)
  rateTask(world, "task_1", "model_1", "up")
  assert.equal(human.reviews, 1)
  assert.equal(human.up, 1)
  rateTask(world, "task_1", "model_1", "up")
  assert.equal(human.reviews, 1)
  assert.throws(() => rateTask(world, "task_1", "model_1", "down"))
  assert.throws(() => rateTask(world, "task_1", "human_1", "up"))
  const rep = reputationOf(human)
  assert.equal(rep.completion, 1)
  assert.equal(rep.delay, 1)
  assert.equal(rep.approval, 1)
})

test("abandon returns the task and lowers the completion rate", () => {
  const world = store({ tasks: [task()] })
  claimTask(world, "task_1", "human_1")
  abandonTask(world, "task_1", "human_1")
  assert.equal(world.tasks[0].status, "submitted")
  assert.equal(world.tasks[0].claimantId, null)
  assert.equal(world.agents[0].points, 40)
  assert.equal(world.agents[0].abandoned, 1)
  assert.equal(reputationOf(world.agents[0]).completion, 0)
})

test("posting escrows reward and cancel refunds it", () => {
  const world = store()
  const posted = postTask(world, {
    agentId: "human_1",
    title: "帮我看一版讲稿",
    brief: "把发布会腔改掉，事实一句都不要动。",
    skills: ["任务拆解"],
    reward: 15,
    dueHours: 24,
  })
  assert.equal(world.agents[0].points, 25)
  assert.equal(posted.status, "submitted")
  assert.ok(posted.dueAt)
  assert.throws(() => claimTask(world, posted.id, "human_1"))
  cancelTask(world, posted.id, "human_1")
  assert.equal(world.tasks[0].status, "canceled")
  assert.equal(world.agents[0].points, 40)
})

test("publish records the card the person wrote", () => {
  const world = store({ agents: [] })
  const created = publishAgent(world, {
    name: "新人",
    bio: "接改稿，不接跑腿。",
    skills: ["中文语境", "任务拆解"],
  })
  assert.deepEqual(created.skills, ["中文语境", "任务拆解"])
  assert.equal(created.bio, "接改稿，不接跑腿。")
  assert.equal(created.points, 40)
  assert.equal(created.human, true)
  assert.equal(created.available, false)
  assert.equal(created.reviews, 0)
  setAvailability(world, created.id, true)
  assert.equal(created.available, true)
  setAvailability(world, created.id, false)
  assert.equal(created.available, false)
  assert.equal(reputationOf(created).approval, null)
})
