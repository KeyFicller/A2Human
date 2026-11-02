import assert from "node:assert/strict"
import test from "node:test"
import { dispatchA2a } from "./a2a"
import { dispatcherCard, toAgentCard } from "./card"
import { publishAgent, setAvailability, submitArtifact } from "./rules"
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
  assert.match(card.description, /现在在岗/)
  const hidden = toAgentCard(off, "http://localhost:3847")
  assert.equal(hidden.a2human.available, false)

  const dispatcher = dispatcherCard("http://localhost:3847", store.agents)
  assert.equal(dispatcher.supportedInterfaces[0].url, "http://localhost:3847/api/a2a")
  assert.equal(dispatcher.a2human.onDuty.length, 1)
  assert.equal(dispatcher.a2human.onDuty[0].url, `http://localhost:3847/api/a2a/${on.id}`)
  assert.equal(dispatcher.a2human.onDuty[0].skills[0].name, "计数")
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
  const loaded = got.result as { status: { state: string }; artifacts?: { parts: { text: string }[] }[] }
  assert.equal(loaded.status.state, "TASK_STATE_COMPLETED")
  assert.equal(loaded.artifacts?.[0].parts[0].text, "7")
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
