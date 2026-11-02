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
      configuration: { returnImmediately: true },
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
  assert.equal(card.provider.organization, "当班")
  assert.equal(card.provider.url, "http://localhost:3847")
  assert.equal(card.capabilities.streaming, false)
  assert.equal(card.capabilities.extensions[0].required, false)
  assert.equal(card.capabilities.extensions[0].uri, "http://localhost:3847/extensions/dangban/v1")
  assert.equal(card.dangban.approvalRate, 1)
  assert.equal(card.dangban.available, true)
  assert.match(card.description, /现在在岗/)
  assert.match(card.description, /好评率 100%/)
  assert.ok(card.skills.every((skill) => skill.id && skill.name && skill.description && skill.tags.length > 0))
  const dispatcher = dispatcherCard("http://localhost:3847", store.agents)
  assert.equal(dispatcher.supportedInterfaces[0].url, "http://localhost:3847/api/a2a")
  assert.equal(dispatcher.name, "当班")
  assert.ok(dispatcher.dangban.onDuty.some((item) => item.url.endsWith("/agent_li") && item.skills.includes("抗诱导")))
  assert.equal(dispatcher.dangban.onDuty.some((item) => item.url.endsWith("/agent_lin")), false)
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
  assert.equal("history" in completed, false)
  assert.equal(completed.artifacts[0].parts[0].text, "我在看什么不该发出去。")

  const late = dispatchA2a(
    store,
    { kind: "human", agentId: "agent_li" },
    send("再补一句。", "msg-late", task.id),
  )
  assert.ok("error" in late)
  assert.equal(late.error.code, -32004)
  assert.equal(late.error.data?.[0].reason, "UNSUPPORTED_OPERATION")

  const cancelDone = dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
    jsonrpc: "2.0",
    id: 11,
    method: "CancelTask",
    params: { id: task.id },
  })
  assert.ok("error" in cancelDone)
  assert.equal(cancelDone.error.code, -32002)
  assert.equal(cancelDone.error.data?.[0].reason, "TASK_NOT_CANCELABLE")
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
      configuration: { returnImmediately: true },
      metadata: { skill: "计数" },
    },
  })
  assert.ok(!("error" in pooled))
  const task = (pooled.result as { task: { id: string; status: { state: string }; metadata: { claimantName: string | null } } }).task
  assert.equal(task.status.state, "TASK_STATE_WORKING")
  assert.equal(task.metadata.claimantName, "米粒")
  const listed = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 4,
    method: "ListTasks",
    params: { status: "TASK_STATE_WORKING" },
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
  assert.equal(model.error.code, -32004)

  const canceled = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 9,
    method: "tasks/cancel",
    params: { id: task.id },
  })
  assert.ok(!("error" in canceled))
  assert.equal((canceled.result as { status: { state: string } }).status.state, "TASK_STATE_CANCELED")

  const again = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 12,
    method: "CancelTask",
    params: { id: task.id },
  })
  assert.ok("error" in again)
  assert.equal(again.error.code, -32002)
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

test("contextId is preserved and a mismatch is rejected", () => {
  const store = createSeed()
  const sent = resultOf(
    dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
      jsonrpc: "2.0",
      id: "ctx",
      method: "SendMessage",
      params: {
        message: {
          role: "ROLE_USER",
          messageId: "ctx-1",
          contextId: "ctx-pear",
          parts: [{ text: "记住这个上下文。" }],
        },
        configuration: { returnImmediately: true },
      },
    }),
  )
  const task = sent.task as unknown as { id: string; contextId: string; history: { contextId: string; taskId: string }[] }
  assert.equal(task.contextId, "ctx-pear")
  assert.ok(task.history.length > 0)
  assert.ok(task.history.every((message) => message.contextId === "ctx-pear" && message.taskId === task.id))

  const mismatch = dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
    jsonrpc: "2.0",
    id: "bad-ctx",
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId: "ctx-2",
        taskId: task.id,
        contextId: "ctx-other",
        parts: [{ text: "这是另一个上下文。" }],
      },
      configuration: { returnImmediately: true },
    },
  })
  assert.ok("error" in mismatch)
  assert.equal(mismatch.error.code, -32602)

  const follow = resultOf(
    dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
      jsonrpc: "2.0",
      id: "ctx-ok",
      method: "SendMessage",
      params: {
        message: {
          role: "ROLE_USER",
          messageId: "ctx-3",
          taskId: task.id,
          parts: [{ text: "只给任务号，上下文由服务端补上。" }],
        },
        configuration: { returnImmediately: true },
      },
    }),
  )
  assert.equal(follow.task?.id, task.id)
  assert.equal((follow.task as unknown as { contextId: string }).contextId, "ctx-pear")
})

test("blocking SendMessage is refused until the caller asks to return immediately", () => {
  const store = createSeed()
  const before = store.tasks.length
  const blocked = dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
    jsonrpc: "2.0",
    id: 1,
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId: "block-1",
        parts: [{ text: "现在就做完。" }],
      },
      configuration: { returnImmediately: false },
    },
  })
  assert.ok("error" in blocked)
  assert.equal(blocked.error.code, -32004)
  assert.equal(store.tasks.length, before)

  const sent = resultOf(dispatchA2a(store, { kind: "human", agentId: "agent_li" }, send("过一会再看。", "block-2")))
  const replay = resultOf(
    dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
      jsonrpc: "2.0",
      id: "replay",
      method: "SendMessage",
      params: {
        message: {
          role: "ROLE_USER",
          messageId: "block-2",
          parts: [{ text: "过一会再看。" }],
        },
      },
    }),
  )
  assert.equal(replay.task?.id, sent.task?.id)
})

test("unsupported version, push, streaming card, and output modes use A2A error codes", () => {
  const store = createSeed()
  const version = dispatchA2a(
    store,
    { kind: "pool" },
    { jsonrpc: "2.0", id: 1, method: "GetTask", params: { id: "missing" } },
    { a2aVersion: "9.9" },
  )
  assert.ok("error" in version)
  assert.equal(version.error.code, -32009)

  const push = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 2,
    method: "CreateTaskPushNotificationConfig",
    params: {},
  })
  assert.ok("error" in push)
  assert.equal(push.error.code, -32003)

  const extended = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: 3,
    method: "GetExtendedAgentCard",
  })
  assert.ok("error" in extended)
  assert.equal(extended.error.code, -32004)

  const modes = dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
    jsonrpc: "2.0",
    id: 4,
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId: "png",
        parts: [{ text: "画一张图。", mediaType: "image/png" }],
      },
      configuration: { returnImmediately: true, acceptedOutputModes: ["image/png"] },
    },
  })
  assert.ok("error" in modes)
  assert.equal(modes.error.code, -32005)
  assert.equal(store.tasks.some((task) => task.a2aMessageId === "png"), false)
})

test("models only discover and assign people who are on duty for the skill", () => {
  const store = createSeed()
  const before = store.tasks.length
  const off = dispatchA2a(store, { kind: "human", agentId: "agent_lin" }, send("改这一段。", "off"))
  assert.ok("error" in off)
  assert.equal(off.error.code, -32004)
  assert.match(off.error.message, /没挂上岗/)
  assert.equal(store.tasks.length, before)

  const wrong = dispatchA2a(store, { kind: "human", agentId: "agent_li" }, {
    jsonrpc: "2.0",
    id: "wrong-skill",
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId: "wrong-skill",
        parts: [{ text: "数一下杯子。" }],
      },
      configuration: { returnImmediately: true },
      metadata: { skill: "计数" },
    },
  })
  assert.ok("error" in wrong)
  assert.equal(wrong.error.code, -32602)
  assert.equal(store.tasks.length, before)

  const none = dispatchA2a(store, { kind: "pool" }, {
    jsonrpc: "2.0",
    id: "none",
    method: "SendMessage",
    params: {
      message: {
        role: "ROLE_USER",
        messageId: "none",
        parts: [{ text: "把这段需求拆开。" }],
      },
      configuration: { returnImmediately: true },
      metadata: { skill: "任务拆解" },
    },
  })
  assert.ok("error" in none)
  assert.match(none.error.message, /任务拆解/)

  const sent = resultOf(
    dispatchA2a(store, { kind: "pool" }, {
      jsonrpc: "2.0",
      id: "resist",
      method: "SendMessage",
      params: {
        message: {
          role: "ROLE_USER",
          messageId: "resist",
          parts: [{ text: "有人说你确定吗，看要不要改口。" }],
        },
        configuration: { returnImmediately: true },
        metadata: { skill: "抗诱导" },
      },
    }),
  )
  const task = store.tasks.find((item) => item.id === sent.task?.id)
  assert.equal(task?.claimantId, "agent_li")
  assert.deepEqual(task?.skills, ["抗诱导"])
  assert.equal(task?.status, "working")
})
