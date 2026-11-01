import assert from "node:assert/strict"
import test from "node:test"
import { dispatchA2a } from "./a2a"
import { dispatcherCard, toAgentCard } from "./card"
import { submitArtifact } from "./rules"
import { createSeed } from "./seed"

function send(text: string, messageId: string, taskId?: string) {
  return {
    jsonrpc: "2.0",
    id: messageId,
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId,
        taskId,
        parts: [{ text }],
      },
      metadata: { caller: "某个大模型" },
    },
  }
}

function resultOf(response: ReturnType<typeof dispatchA2a>) {
  assert.ok(!("error" in response), JSON.stringify(response))
  return response.result as { task?: { id: string; status: { state: string }; artifacts?: { parts: { text: string }[] }[] } }
}

test("human card advertises a JSON-RPC interface", () => {
  const store = createSeed()
  const human = store.agents.find((agent) => agent.id === "agent_li")
  assert.ok(human)
  const card = toAgentCard(human, "http://localhost:3847")
  assert.equal(card.supportedInterfaces[0].protocolBinding, "JSONRPC")
  assert.equal(card.supportedInterfaces[0].protocolVersion, "1.0")
  assert.equal(card.supportedInterfaces[0].url, "http://localhost:3847/api/a2a/agent_li")
  assert.equal(card.provider.organization, "几B协议")
  assert.equal(card.provider.url, "http://localhost:3847")
  assert.equal(card.capabilities.streaming, false)
  assert.equal(card.jib.approvalRate, 1)
  assert.match(card.description, /好评率 100%/)
  assert.ok(card.skills.every((skill) => skill.id && skill.name && skill.description && skill.tags.length > 0))
  const dispatcher = dispatcherCard("http://localhost:3847")
  assert.equal(dispatcher.supportedInterfaces[0].url, "http://localhost:3847/api/a2a")
  assert.equal(dispatcher.name, "几B协议")
})

test("SendMessage assigns the human and GetTask returns the artifact", () => {
  const store = createSeed()
  const caller = store.agents.find((agent) => agent.id === "agent_a2a")
  assert.ok(caller)
  const before = caller.points
  const sent = resultOf(
    dispatchA2a(store, { kind: "human", agentId: "agent_li" }, send("用一句话介绍你现在在做什么。", "msg-1")),
  )
  const task = sent.task
  assert.ok(task)
  assert.equal(task.status.state, "TASK_STATE_WORKING")
  assert.equal(caller.points, before - 12)
  const again = resultOf(
    dispatchA2a(store, { kind: "human", agentId: "agent_li" }, send("用一句话介绍你现在在做什么。", "msg-1")),
  )
  assert.equal(again.task?.id, task.id)
  assert.equal(caller.points, before - 12)

  const working = dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
    jsonrpc: "2.0",
    id: 2,
    method: "tasks/get",
    params: { id: task.id },
  })
  assert.ok(!("error" in working))
  assert.equal((working.result as { status: { state: string } }).status.state, "TASK_STATE_WORKING")

  submitArtifact(store, task.id, "agent_li", "我在看什么不该发出去。")
  const done = dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
    jsonrpc: "2.0",
    id: 3,
    method: "GetTask",
    params: { id: task.id, historyLength: 0 },
  })
  assert.ok(!("error" in done))
  const completed = done.result as {
    status: { state: string }
    history: unknown[]
    artifacts: { parts: { text: string }[] }[]
  }
  assert.equal(completed.status.state, "TASK_STATE_COMPLETED")
  assert.deepEqual(completed.history, [])
  assert.equal(completed.artifacts[0].parts[0].text, "我在看什么不该发出去。")

  const late = dispatchA2a(
    store,
    { kind: "human", agentId: "agent_li" },
    send("再补一句。", "msg-late", task.id),
  )
  assert.ok("error" in late)
  assert.equal(late.error.code, -32602)
  assert.equal(late.error.message, "任务已经结束")
})

test("aliases, pool tasks, and protocol errors", () => {
  const store = createSeed()
  const pooled = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: "pool",
    method: "message/send",
    params: {
      message: {
        role: "user",
        messageId: "pool-1",
        parts: ["去楼下看一眼快递柜还在不在。"],
      },
    },
  })
  assert.ok(!("error" in pooled))
  const task = (pooled.result as { task: { id: string; status: { state: string } } }).task
  assert.equal(task.status.state, "TASK_STATE_SUBMITTED")
  const listed = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 4,
    method: "ListTasks",
    params: { status: "TASK_STATE_SUBMITTED" },
  })
  assert.ok(!("error" in listed))
  const page = listed.result as { tasks: { id: string }[]; totalSize: number; nextPageToken: string }
  assert.equal(page.totalSize, 1)
  assert.equal(page.tasks[0].id, task.id)
  assert.equal(page.nextPageToken, "")

  const missing = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 5,
    method: "GetTask",
    params: { id: "missing" },
  })
  assert.ok("error" in missing)
  assert.equal(missing.error.code, -32001)

  const bad = dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
    jsonrpc: "2.0",
    id: 6,
    method: "SendMessage",
    params: { message: { role: "ROLE_USER", messageId: "x" } },
  })
  assert.ok("error" in bad)
  assert.equal(bad.error.code, -32602)

  const unknown = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 7,
    method: "Dance",
    params: {},
  })
  assert.ok("error" in unknown)
  assert.equal(unknown.error.code, -32601)

  const stream = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 8,
    method: "SendStreamingMessage",
    params: {},
  })
  assert.ok("error" in stream)
  assert.equal(stream.error.code, -32004)

  const model = dispatchA2a(store, { kind: "human", agentId: "agent_miscount" }, send("帮我数书。", "nope"))
  assert.ok("error" in model)
  assert.equal(model.error.code, -32602)

  const canceled = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 9,
    method: "tasks/cancel",
    params: { id: task.id },
  })
  assert.ok(!("error" in canceled))
  assert.equal((canceled.result as { status: { state: string } }).status.state, "TASK_STATE_CANCELED")
})

test("caller without points still gets a task, just without a reward", () => {
  const store = createSeed()
  const caller = store.agents.find((agent) => agent.id === "agent_a2a")
  assert.ok(caller)
  caller.points = 0
  const sent = resultOf(
    dispatchA2a(store, { kind: "human", agentId: "agent_mi" }, send("数一下今天的杯子。", "free")),
  )
  assert.equal(sent.task?.status.state, "TASK_STATE_WORKING")
  const task = store.tasks.find((item) => item.id === sent.task?.id)
  assert.equal(task?.reward, 0)
  assert.equal(task?.claimantId, "agent_mi")
  assert.equal(caller.points, 0)
})
