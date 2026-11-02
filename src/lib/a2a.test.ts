import assert from "node:assert/strict"
import test from "node:test"
import { dispatchA2a } from "./a2a"
import { dispatcherCard, toAgentCard } from "./card"
import { decideTask, publishAgent, setAvailability, submitArtifact } from "./rules"
import { createSeed } from "./seed"

const counting = { name: "计数", description: "数清画面或文字里的东西，只交回数字。" }
const physical = { name: "物理世界", description: "只回答自己真实看到的现场。" }

function world() {
  const store = createSeed()
  const on = publishAgent(store, { name: "米粒", bio: "会数。", skills: [counting] })
  const off = publishAgent(store, { name: "阿梨", bio: "还没上工。", skills: [physical] })
  setAvailability(store, on.id, true)
  return { store, on, off }
}

function send(text: string, messageId: string, extra?: { taskId?: string; skill?: string; immediate?: boolean }) {
  return {
    jsonrpc: "2.0",
    id: messageId,
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId,
        taskId: extra?.taskId,
        parts: [{ text }],
      },
      configuration: extra?.immediate === false ? {} : { returnImmediately: true },
      metadata: { caller: "某个大模型", ...(extra?.skill ? { skill: extra.skill } : {}) },
    },
  }
}

function resultOf(response: ReturnType<typeof dispatchA2a>) {
  assert.ok(!("error" in response), JSON.stringify(response))
  return response.result as {
    task?: {
      id: string
      contextId?: string
      status: { state: string }
      artifacts?: { parts: { text: string }[] }[]
      metadata?: { claimantName?: string | null }
    }
  }
}

test("human card advertises the skills the person wrote", () => {
  const { on, off, store } = world()
  const card = toAgentCard(on, "http://localhost:3847")
  assert.equal(card.supportedInterfaces[0].protocolBinding, "JSONRPC")
  assert.equal(card.supportedInterfaces[0].protocolVersion, "1.0")
  assert.equal(card.supportedInterfaces[0].url, `http://localhost:3847/api/a2a/${on.id}`)
  assert.equal(card.capabilities.streaming, false)
  assert.equal(card.a2human.available, true)
  assert.equal(card.skills[0].name, "计数")
  assert.equal(card.skills[0].description, counting.description)
  assert.equal("inputModes" in card.skills[0], false)
  assert.equal("inputSchema" in card.skills[0], false)
  assert.match(card.description, /现在在岗/)
  const hidden = toAgentCard(off, "http://localhost:3847")
  assert.equal(hidden.a2human.available, false)

  const dispatcher = dispatcherCard("http://localhost:3847", store.agents)
  assert.equal(dispatcher.supportedInterfaces[0].url, "http://localhost:3847/api/a2a")
  assert.equal(dispatcher.a2human.onDuty.length, 1)
  assert.equal(dispatcher.a2human.onDuty[0].url, `http://localhost:3847/api/a2a/${on.id}`)
  assert.equal(dispatcher.a2human.onDuty[0].skills[0].name, "计数")
})

test("a skill schema stays beside the official modes, not inside AgentSkill", () => {
  const inputSchema = { type: "object", required: ["scene"], properties: { scene: { type: "string" } } }
  const outputSchema = { type: "object", required: ["count"], properties: { count: { type: "integer" } } }
  const store = createSeed()
  const on = publishAgent(store, {
    name: "米粒",
    bio: "会数。",
    skills: [{ ...counting, inputSchema, outputSchema }],
  })
  setAvailability(store, on.id, true)
  const card = toAgentCard(on, "http://localhost:3847")
  assert.deepEqual(card.skills[0].inputModes, ["application/json"])
  assert.deepEqual(card.skills[0].outputModes, ["application/json"])
  assert.equal("inputSchema" in card.skills[0], false)
  const params = card.capabilities.extensions[0].params as {
    skillSchemas: Record<string, { inputSchema: unknown; outputSchema: unknown }>
  }
  assert.deepEqual(params.skillSchemas["计数"], { inputSchema, outputSchema })
  const dispatcher = dispatcherCard("http://localhost:3847", store.agents)
  assert.deepEqual(dispatcher.a2human.onDuty[0].skills[0].inputSchema, inputSchema)
  assert.deepEqual(dispatcher.a2human.onDuty[0].skills[0].outputSchema, outputSchema)
})

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

test("an image part stays on the task and comes back as raw", () => {
  const inputSchema = {
    type: "object",
    properties: { 照片: { type: "string", contentMediaType: "image/*" } },
    required: ["照片"],
  }
  const outputSchema = {
    type: "object",
    properties: { 结果: { type: "string", contentMediaType: "image/*" } },
    required: ["结果"],
  }
  const store = createSeed()
  const on = publishAgent(store, {
    name: "米粒",
    bio: "会看图。",
    skills: [{ name: "看图", description: "看一张图，交回另一张。", inputSchema, outputSchema }],
  })
  setAvailability(store, on.id, true)
  const card = toAgentCard(on, "http://localhost:3847")
  assert.deepEqual(card.skills[0].inputModes, ["image/png", "image/jpeg", "image/webp", "image/gif"])
  assert.deepEqual(card.skills[0].outputModes, ["image/png", "image/jpeg", "image/webp", "image/gif"])
  const sent = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "img-1",
    method: "SendMessage",
    params: {
      configuration: { returnImmediately: true, acceptedOutputModes: ["image/png"] },
      metadata: { skill: "看图" },
      message: {
        role: "ROLE_USER",
        messageId: "img-1",
        parts: [{ mediaType: "image/png", filename: "dot.png", raw: png }],
      },
    },
  })
  const task = resultOf(sent).task
  assert.ok(task)
  const stored = store.tasks.find((item) => item.id === task.id)
  assert.equal(stored?.images?.[0].raw, png)
  assert.equal(stored?.brief.includes(png), false)
  submitArtifact(store, task.id, on.id, "", { mediaType: "image/png", raw: png, filename: "out.png" })
  const got = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "get-img",
    method: "GetTask",
    params: { id: task.id },
  })
  assert.ok(!("error" in got))
  const loaded = got.result as { artifacts?: { parts: { raw?: string; mediaType?: string; filename?: string }[] }[] }
  assert.equal(loaded.artifacts?.[0].parts[0].mediaType, "image/png")
  assert.equal(loaded.artifacts?.[0].parts[0].raw, png)
  assert.equal(loaded.artifacts?.[0].parts[0].filename, "out.png")
})

test("SendMessage assigns the chosen person and GetTask returns the artifact", () => {
  const { store, on } = world()
  const sent = dispatchA2a(store, { kind: "human", agentId: on.id }, send("数一下这张纸上的圆。", "msg-1", { skill: "计数" }))
  const task = resultOf(sent).task
  assert.ok(task)
  assert.equal(task.status.state, "TASK_STATE_WORKING")
  assert.equal(task.metadata?.claimantName, "米粒")
  submitArtifact(store, task.id, on.id, "7")
  const got = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "get-1",
    method: "GetTask",
    params: { id: task.id },
  })
  assert.ok(!("error" in got))
  const loaded = got.result as {
    status: { state: string; message?: { parts: { text: string }[] } }
    artifacts?: { parts: { text: string }[] }[]
  }
  assert.equal(loaded.status.state, "TASK_STATE_INPUT_REQUIRED")
  assert.deepEqual(JSON.parse(loaded.status.message?.parts[0].text ?? ""), {
    request: "score",
    taskId: task.id,
    person: "米粒",
    artifact: "7",
  })
  assert.equal(loaded.artifacts?.[0].parts[0].text, "7")
  const finished = dispatchA2a(store, { kind: "human", agentId: on.id }, send('{"score":5}', "score-7", { taskId: task.id }))
  assert.equal(resultOf(finished).task?.status.state, "TASK_STATE_COMPLETED")
})

test("a task can be refused, ask for input, fail, or be canceled", () => {
  const { store, on } = world()
  const opened = dispatchA2a(store, { kind: "human", agentId: on.id }, send("数一下。", "state-1", { skill: "计数" }))
  const task = resultOf(opened).task
  assert.ok(task)

  decideTask(store, task.id, on.id, "input", "画面里是几个圆？")
  const asked = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "get-input",
    method: "GetTask",
    params: { id: task.id },
  })
  assert.ok(!("error" in asked))
  const asking = asked.result as { status: { state: string; message?: { parts: { text: string }[] } } }
  assert.equal(asking.status.state, "TASK_STATE_INPUT_REQUIRED")
  assert.equal(asking.status.message?.parts[0].text, "画面里是几个圆？")

  const resumed = dispatchA2a(store, { kind: "human", agentId: on.id }, send("三个圆。", "state-2", { taskId: task.id }))
  assert.equal(resultOf(resumed).task?.status.state, "TASK_STATE_WORKING")

  decideTask(store, task.id, on.id, "fail", "数不清。")
  const failed = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "get-fail",
    method: "GetTask",
    params: { id: task.id },
  })
  assert.ok(!("error" in failed))
  const failure = failed.result as { status: { state: string; message?: { parts: { text: string }[] } } }
  assert.equal(failure.status.state, "TASK_STATE_FAILED")
  assert.equal(failure.status.message?.parts[0].text, "数不清。")

  const refused = dispatchA2a(store, { kind: "human", agentId: on.id }, send("再数一次。", "state-3", { skill: "计数" }))
  const second = resultOf(refused).task
  assert.ok(second)
  decideTask(store, second.id, on.id, "reject", "这单不接。")
  const rejected = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "get-reject",
    method: "GetTask",
    params: { id: second.id },
  })
  assert.ok(!("error" in rejected))
  assert.equal((rejected.result as { status: { state: string } }).status.state, "TASK_STATE_REJECTED")

  const blocked = dispatchA2a(store, { kind: "human", agentId: on.id }, send("补一句。", "state-4", { taskId: second.id }))
  assert.ok("error" in blocked)
  assert.equal(blocked.error.code, -32004)

  const third = resultOf(dispatchA2a(store, { kind: "human", agentId: on.id }, send("最后一单。", "state-5", { skill: "计数" }))).task
  assert.ok(third)
  const canceled = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "cancel-1",
    method: "CancelTask",
    params: { id: third.id },
  })
  assert.ok(!("error" in canceled))
  const cancelBody = canceled.result as { status?: { state: string }; task?: { status: { state: string } } }
  assert.equal(cancelBody.status?.state ?? cancelBody.task?.status.state, "TASK_STATE_CANCELED")
  const again = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "cancel-2",
    method: "CancelTask",
    params: { id: third.id },
  })
  assert.ok("error" in again)
  assert.equal(again.error.code, -32002)
})

test("delivery asks the dispatcher to score, and the score completes the task", () => {
  const { store, on } = world()
  const opened = dispatchA2a(store, { kind: "human", agentId: on.id }, send("数一下。", "score-1", { skill: "计数" }))
  const task = resultOf(opened).task
  assert.ok(task)
  const early = dispatchA2a(store, { kind: "human", agentId: on.id }, send('{"score":4}', "score-early", { taskId: task.id }))
  assert.equal(resultOf(early).task?.status.state, "TASK_STATE_WORKING")
  assert.equal(store.tasks.find((item) => item.id === task.id)?.workScore, undefined)
  submitArtifact(store, task.id, on.id, "3")
  assert.throws(() => decideTask(store, task.id, on.id, "input", "再补一句。"), /已经交了/)
  const asked = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "get-score",
    method: "GetTask",
    params: { id: task.id },
  })
  assert.ok(!("error" in asked))
  const body = asked.result as {
    status: { state: string; message?: { parts: { text: string }[] } }
    artifacts?: { parts: { text: string }[] }[]
  }
  assert.equal(body.status.state, "TASK_STATE_INPUT_REQUIRED")
  assert.deepEqual(JSON.parse(body.status.message?.parts[0].text ?? ""), {
    request: "score",
    taskId: task.id,
    person: "米粒",
    artifact: "3",
  })
  assert.equal(body.artifacts?.[0].parts[0].text, "3")
  const rejected = dispatchA2a(store, { kind: "human", agentId: on.id }, send('{"score":6}', "score-bad", { taskId: task.id }))
  assert.ok("error" in rejected)
  assert.match(rejected.error.message, /1 到 5/)
  assert.equal(store.tasks.find((item) => item.id === task.id)?.status, "input-required")
  const scored = dispatchA2a(store, { kind: "human", agentId: on.id }, send('{"score":4}', "score-ok", { taskId: task.id }))
  assert.equal(resultOf(scored).task?.status.state, "TASK_STATE_COMPLETED")
  const saved = store.tasks.find((item) => item.id === task.id)
  assert.equal(saved?.workScore, 4)
  const again = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "get-score-kept",
    method: "GetTask",
    params: { id: task.id },
  })
  assert.ok(!("error" in again))
  const kept = again.result as {
    status: { state: string }
    metadata?: { score?: number; scoredBy?: string; person?: string }
    artifacts?: { parts: { text: string }[] }[]
  }
  assert.equal(kept.status.state, "TASK_STATE_COMPLETED")
  assert.equal(kept.metadata?.score, 4)
  assert.equal(kept.metadata?.scoredBy, "某个大模型")
  assert.equal(kept.metadata?.person, "米粒")
  assert.equal(kept.artifacts?.[0].parts[0].text, "3")
})

test("application/json input is kept for the person and returned as data", () => {
  const inputSchema = { type: "object", required: ["scene"], properties: { scene: { type: "string" } } }
  const outputSchema = { type: "object", required: ["count"], properties: { count: { type: "integer" } } }
  const store = createSeed()
  const on = publishAgent(store, {
    name: "米粒",
    bio: "会数。",
    skills: [{ ...counting, inputSchema, outputSchema }],
  })
  setAvailability(store, on.id, true)
  const sent = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "msg-json",
    method: "SendMessage",
    params: {
      configuration: { returnImmediately: true, acceptedOutputModes: ["application/json"] },
      metadata: { skill: "计数" },
      message: {
        role: "ROLE_USER",
        messageId: "msg-json",
        parts: [{ mediaType: "application/json", data: { scene: "三个圆" } }],
      },
    },
  })
  const task = resultOf(sent).task
  assert.ok(task)
  assert.equal(store.tasks.find((item) => item.id === task.id)?.brief, '{"scene":"三个圆"}')
  submitArtifact(store, task.id, on.id, '{"count":3}')
  const got = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "get-json",
    method: "GetTask",
    params: { id: task.id },
  })
  assert.ok(!("error" in got))
  const loaded = got.result as { artifacts?: { parts: { data?: { count: number }; mediaType?: string }[] }[] }
  assert.equal(loaded.artifacts?.[0].parts[0].mediaType, "application/json")
  assert.deepEqual(loaded.artifacts?.[0].parts[0].data, { count: 3 })
})

test("the directory does not assign, and an off-duty person rejects the call", () => {
  const { store, off } = world()
  const pooled = dispatchA2a(store, { kind: "pool" }, send("数一下。", "pool-1", { skill: "计数" }))
  assert.ok("error" in pooled)
  assert.equal(pooled.error.code, -32004)
  assert.match(pooled.error.message, /onDuty/)

  const direct = dispatchA2a(store, { kind: "human", agentId: off.id }, send("灯开着吗？", "off-1"))
  assert.ok("error" in direct)
  assert.match(direct.error.message, /没上工/)
})

test("blocking SendMessage is refused until the caller asks to return immediately", () => {
  const { store, on } = world()
  const blocked = dispatchA2a(
    store,
    { kind: "human", agentId: on.id },
    send("数一下。", "block-1", { immediate: false }),
  )
  assert.ok("error" in blocked)
  assert.equal(blocked.error.code, -32004)
})

test("contextId is preserved and a mismatch is rejected", () => {
  const { store, on } = world()
  const sent = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    ...send("数一下。", "ctx-1"),
    params: {
      ...send("数一下。", "ctx-1").params,
      message: { ...send("数一下。", "ctx-1").params.message, contextId: "ctx-keep" },
    },
  })
  const task = resultOf(sent).task
  assert.equal(task?.contextId, "ctx-keep")
  const mismatch = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "ctx-2",
    method: "SendMessage",
    params: {
      configuration: { returnImmediately: true },
      message: {
        role: "ROLE_USER",
        messageId: "ctx-2",
        taskId: task?.id,
        contextId: "other",
        parts: [{ text: "再补一句。" }],
      },
    },
  })
  assert.ok("error" in mismatch)
  assert.equal(mismatch.error.code, -32602)
})

test("unsupported version, push, and streaming use A2A error codes", () => {
  const { store, on } = world()
  const version = dispatchA2a(store, { kind: "human", agentId: on.id }, send("数一下。", "ver-1"), { a2aVersion: "9" })
  assert.ok("error" in version)
  assert.equal(version.error.code, -32009)
  const stream = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "stream-1",
    method: "SendStreamingMessage",
    params: {},
  })
  assert.ok("error" in stream)
  assert.equal(stream.error.code, -32004)
  const push = dispatchA2a(store, { kind: "human", agentId: on.id }, {
    jsonrpc: "2.0",
    id: "push-1",
    method: "tasks/pushNotificationConfig/set",
    params: {},
  })
  assert.ok("error" in push)
  assert.equal(push.error.code, -32003)
})
