import assert from "node:assert/strict"
import test from "node:test"
import { handleMcp, listDutyTools, MCP_TASK_POLL_MS, MCP_TASK_TTL_MS, type McpHeaders, type McpIo } from "./mcp"
import { decideTask, publishAgent, setAvailability, submitArtifact } from "./rules"
import { createSeed } from "./seed"
import type { Store } from "./types"

const counting = {
  name: "计数",
  description: "数清画面或文字里的东西，只交回数字。",
  inputSchema: {
    type: "object",
    properties: {
      scene: { type: "string", description: "要数的画面" },
      photo: { type: "string", contentMediaType: "image/png" },
    },
    required: ["scene"],
  },
  outputSchema: {
    type: "object",
    properties: { count: { type: "integer" } },
    required: ["count"],
  },
}
const physical = { name: "物理世界", description: "只回答自己真实看到的现场。" }

function world() {
  const store = createSeed()
  const on = publishAgent(store, { name: "米粒", bio: "会数。", skills: [counting, physical] })
  const off = publishAgent(store, { name: "阿梨", bio: "还没上工。", skills: [physical] })
  setAvailability(store, on.id, true)
  return { store, on, off }
}

function memory(store: Store): McpIo {
  return {
    read: () => store,
    update: (fn) => fn(store),
    maxWaitMs: 0,
  }
}

test("mcp lists one tool per on-duty skill and keeps A2A as the path", () => {
  const { store, on } = world()
  const tools = listDutyTools(store)
  assert.equal(tools.length, 2)
  assert.ok(tools.every((tool) => /^a2h_[A-Za-z0-9_-]{1,60}$/.test(tool.name)))
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 2)
  const count = tools[0]
  assert.match(count.description, /米粒/)
  assert.match(count.description, /计数/)
  assert.match(count.description, /完成 0 单/)
  assert.match(count.description, /A2A/)
  const schema = count.inputSchema as {
    properties: Record<string, { type: string }>
    required?: string[]
  }
  assert.equal(schema.properties.scene.type, "string")
  assert.equal(schema.properties.photo.type, "string")
  assert.equal(schema.properties.task_id.type, "string")
  assert.equal(schema.properties.score.type, "integer")
  assert.equal(count.execution.taskSupport, "optional")
  assert.deepEqual(schema.required, ["scene"])
  const promptSchema = tools[1].inputSchema.properties as Record<string, { type: string }>
  assert.equal(promptSchema.prompt.type, "string")
  assert.equal(listDutyTools(store).some((tool) => tool.description.includes("阿梨")), false)
  assert.ok(on.available)
})

test("a tool call opens an A2A task and asks again while the person is still working", async () => {
  const { store } = world()
  const [tool] = listDutyTools(store)
  const response = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool.name, arguments: { scene: "三个圆" } },
    },
    memory(store),
  )
  assert.equal(response.status, 200)
  const text = (response.body as { result: { content: { text: string }[]; isError?: boolean } }).result.content[0].text
  assert.equal((response.body as { result: { isError?: boolean } }).result.isError, undefined)
  assert.match(text, /task_id/)
  assert.equal(store.tasks.length, 1)
  assert.equal(store.tasks[0].claimantName, "米粒")
  assert.equal(store.tasks[0].status, "working")
  assert.match(store.tasks[0].brief, /三个圆/)
})

test("delivery comes back as a score request, and the score returns the artifact", async () => {
  const { store } = world()
  const [tool] = listDutyTools(store)
  await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: { scene: "三个圆" } } },
    memory(store),
  )
  const task = store.tasks[0]
  submitArtifact(store, task.id, store.agents.find((agent) => agent.name === "米粒")!.id, '{"count":3}')
  const waiting = await handleMcp(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool.name, arguments: { task_id: task.id } } },
    memory(store),
  )
  const scoreText = (waiting.body as { result: { content: { text: string }[] } }).result.content[0].text
  assert.match(scoreText, /"request":"score"/)
  assert.match(scoreText, /三个圆|3/)
  const done = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: tool.name, arguments: { task_id: task.id, score: 4 } },
    },
    memory(store),
  )
  const artifact = (done.body as { result: { content: { text: string }[]; isError?: boolean } }).result
  assert.equal(artifact.isError, undefined)
  assert.equal(artifact.content[0].text, '{"count":3}')
  assert.equal(task.status, "completed")
  assert.equal(task.workScore, 4)
})

test("initialize offers the protocol the client asked for and tools/list is the fallback roster", async () => {
  const { store } = world()
  const opened = await handleMcp(
    {
      jsonrpc: "2.0",
      id: "init",
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cursor", version: "1" } },
    },
    memory(store),
  )
  const result = (opened.body as { result: { protocolVersion: string; capabilities: { tasks?: unknown }; instructions: string } }).result
  assert.equal(result.protocolVersion, "2025-06-18")
  assert.equal(result.capabilities.tasks, undefined)
  assert.match(result.instructions, /A2A/)
  assert.match(result.instructions, /MCP/)
  const listed = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, memory(store))
  const tools = (listed.body as { result: { tools: { name: string; execution?: { taskSupport?: string } }[] } }).result.tools
  assert.equal(tools.length, 3)
  const score = tools.find((tool) => tool.name === "a2h_score")
  assert.equal(score?.execution?.taskSupport, "forbidden")
  assert.equal(tools.filter((tool) => tool.name !== "a2h_score").length, 2)
  const quiet = await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, memory(store))
  assert.equal(quiet.status, 202)
  assert.equal(quiet.body, null)
})

type RpcBody = {
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

function bodyOf(response: { body: unknown }) {
  return response.body as RpcBody
}

function taskOf(response: { body: unknown }) {
  const result = bodyOf(response).result
  return (result?.task ?? result) as {
    taskId: string
    status: string
    statusMessage?: string
    ttl: number
    pollInterval: number
    createdAt: string
    lastUpdatedAt: string
  }
}

test("initialize negotiates the tasks protocol and declares task support for tools/call", async () => {
  const { store } = world()
  const opened = await handleMcp(
    {
      jsonrpc: "2.0",
      id: "init",
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "cursor", version: "1" } },
    },
    memory(store),
  )
  const result = bodyOf(opened).result as { protocolVersion: string; capabilities: { tasks: { list: object; cancel: object; requests: { tools: { call: object } } } } }
  assert.equal(result.protocolVersion, "2025-11-25")
  assert.deepEqual(result.capabilities.tasks, { list: {}, cancel: {}, requests: { tools: { call: {} } } })
  const unknown = await handleMcp(
    { jsonrpc: "2.0", id: "future", method: "initialize", params: { protocolVersion: "2099-01-01", capabilities: {} } },
    memory(store),
  )
  const fellBack = bodyOf(unknown).result as { protocolVersion: string; capabilities: { tasks?: unknown } }
  assert.equal(fellBack.protocolVersion, "2025-11-25")
  assert.ok(fellBack.capabilities.tasks)
})

test("a task-augmented tool call returns a handle immediately and follows the A2A lifecycle", async () => {
  const { store, on } = world()
  const [tool] = listDutyTools(store)
  const io = memory(store)
  io.maxWaitMs = 30_000
  io.sleep = async () => {
    throw new Error("task-augmented call waited")
  }
  const opened = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool.name, arguments: { scene: "三个圆" }, task: { ttl: 60_000 } },
    },
    io,
  )
  assert.equal(opened.status, 200)
  assert.equal(bodyOf(opened).error, undefined)
  const created = taskOf(opened)
  assert.equal(created.status, "working")
  assert.equal(created.taskId, store.tasks[0].id)
  assert.equal(created.ttl, MCP_TASK_TTL_MS)
  assert.equal(created.pollInterval, MCP_TASK_POLL_MS)
  assert.equal(store.tasks[0].status, "working")
  const immediate = (bodyOf(opened).result?._meta ?? {}) as Record<string, string>
  assert.match(immediate["io.modelcontextprotocol/model-immediate-response"] ?? "", /tasks\/get/)
  const early = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tasks/result", params: { taskId: created.taskId } }, memory(store))
  assert.equal(bodyOf(early).error?.code, -32099)
  const working = await handleMcp({ jsonrpc: "2.0", id: 3, method: "tasks/get", params: { taskId: created.taskId } }, memory(store))
  assert.equal(taskOf(working).status, "working")
  decideTask(store, created.taskId, on.id, "input", "看不清")
  const needsInput = await handleMcp({ jsonrpc: "2.0", id: 4, method: "tasks/get", params: { taskId: created.taskId } }, memory(store))
  assert.equal(taskOf(needsInput).status, "input_required")
  assert.match(taskOf(needsInput).statusMessage ?? "", /看不清/)
  assert.match(taskOf(needsInput).statusMessage ?? "", /task_id/)
  submitArtifact(store, created.taskId, on.id, '{"count":3}')
  const scoring = await handleMcp({ jsonrpc: "2.0", id: 5, method: "tasks/get", params: { taskId: created.taskId } }, memory(store))
  assert.equal(taskOf(scoring).status, "input_required")
  assert.match(taskOf(scoring).statusMessage ?? "", /a2h_score/)
  assert.match(taskOf(scoring).statusMessage ?? "", /60/)
  assert.match(taskOf(scoring).statusMessage ?? "", /三个圆|3/)
  const ask = await handleMcp({ jsonrpc: "2.0", id: 6, method: "tasks/result", params: { taskId: created.taskId } }, memory(store))
  const askResult = bodyOf(ask).result as { content: { text: string }[]; isError?: boolean; _meta: { "io.modelcontextprotocol/related-task": { taskId: string } } }
  assert.equal(askResult.isError, undefined)
  assert.match(askResult.content[0].text, /a2h_score/)
  assert.equal(askResult._meta["io.modelcontextprotocol/related-task"].taskId, created.taskId)
  assert.equal(store.tasks[0].status, "input-required")
  const forbidden = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "a2h_score", arguments: { taskId: created.taskId, score: 4 }, task: {} },
    },
    memory(store),
  )
  assert.equal(bodyOf(forbidden).error?.code, -32601)
  const scored = await handleMcp(
    { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "a2h_score", arguments: { taskId: created.taskId, score: 4 } } },
    memory(store),
  )
  const scoredResult = bodyOf(scored).result as { content: { text: string }[]; isError?: boolean }
  assert.equal(scoredResult.isError, undefined)
  assert.equal(scoredResult.content[0].text, '{"count":3}')
  assert.equal(store.tasks[0].status, "completed")
  assert.equal(store.tasks[0].workScore, 4)
  const done = await handleMcp({ jsonrpc: "2.0", id: 9, method: "tasks/get", params: { taskId: created.taskId } }, memory(store))
  assert.equal(taskOf(done).status, "completed")
  const payload = await handleMcp({ jsonrpc: "2.0", id: 10, method: "tasks/result", params: { taskId: created.taskId } }, memory(store))
  const finalResult = bodyOf(payload).result as { content: { text: string }[]; isError?: boolean }
  assert.equal(finalResult.isError, undefined)
  assert.equal(finalResult.content[0].text, '{"count":3}')
  const listed = await handleMcp({ jsonrpc: "2.0", id: 11, method: "tasks/list" }, memory(store))
  const page = bodyOf(listed).result as { tasks: { taskId: string; status: string }[]; nextCursor?: string }
  assert.equal(page.tasks.some((item) => item.taskId === created.taskId && item.status === "completed"), true)
  assert.equal(page.nextCursor, undefined)
})

test("a missed score is dropped after 60s and the artifact is still delivered", async () => {
  const { store, on } = world()
  const [tool] = listDutyTools(store)
  const opened = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: { scene: "三个圆" }, task: {} } },
    memory(store),
  )
  const taskId = taskOf(opened).taskId
  submitArtifact(store, taskId, on.id, '{"count":3}')
  const request = store.messages.find((item) => item.taskId === taskId && item.kind === "task.scoreRequest")
  assert.ok(request)
  request.createdAt = new Date(Date.now() - 61_000).toISOString()
  const got = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tasks/get", params: { taskId } }, memory(store))
  assert.equal(taskOf(got).status, "completed")
  assert.equal(store.tasks[0].workScore, undefined)
  assert.equal(store.tasks[0].artifact, '{"count":3}')
  const late = await handleMcp(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "a2h_score", arguments: { taskId, score: 4 } } },
    memory(store),
  )
  assert.equal((bodyOf(late).result as { isError?: boolean }).isError, true)
  assert.equal(store.tasks[0].workScore, undefined)
  const payload = await handleMcp({ jsonrpc: "2.0", id: 4, method: "tasks/result", params: { taskId } }, memory(store))
  assert.equal((bodyOf(payload).result as { content: { text: string }[] }).content[0].text, '{"count":3}')
})

test("tasks/cancel calls A2A CancelTask, and terminal tasks stay terminal", async () => {
  const { store, on } = world()
  const [tool] = listDutyTools(store)
  const opened = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: { scene: "三个圆" }, task: {} } },
    memory(store),
  )
  const taskId = taskOf(opened).taskId
  const cancelled = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tasks/cancel", params: { taskId } }, memory(store))
  assert.equal(bodyOf(cancelled).error, undefined)
  assert.equal(taskOf(cancelled).status, "cancelled")
  assert.equal(store.tasks[0].status, "canceled")
  const again = await handleMcp({ jsonrpc: "2.0", id: 3, method: "tasks/cancel", params: { taskId } }, memory(store))
  assert.equal(bodyOf(again).error?.code, -32602)
  assert.match(bodyOf(again).error?.message ?? "", /cancelled/)
  const failedOpen = await handleMcp(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: tool.name, arguments: { scene: "四个圆" }, task: {} } },
    memory(store),
  )
  const failedId = taskOf(failedOpen).taskId
  decideTask(store, failedId, on.id, "fail", "做不到")
  const failed = await handleMcp({ jsonrpc: "2.0", id: 5, method: "tasks/get", params: { taskId: failedId } }, memory(store))
  assert.equal(taskOf(failed).status, "failed")
  const failedResult = await handleMcp({ jsonrpc: "2.0", id: 6, method: "tasks/result", params: { taskId: failedId } }, memory(store))
  assert.equal((bodyOf(failedResult).result as { isError?: boolean }).isError, true)
  assert.match((bodyOf(failedResult).result as { content: { text: string }[] }).content[0].text, /做不到/)
  const rejectedOpen = await handleMcp(
    { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: tool.name, arguments: { scene: "五个圆" }, task: {} } },
    memory(store),
  )
  const rejectedId = taskOf(rejectedOpen).taskId
  decideTask(store, rejectedId, on.id, "reject", "不接")
  const rejected = await handleMcp({ jsonrpc: "2.0", id: 8, method: "tasks/get", params: { taskId: rejectedId } }, memory(store))
  assert.equal(taskOf(rejected).status, "failed")
})

test("expired tasks drop out of tasks/get and tasks/list, and bad task params are rejected", async () => {
  const { store } = world()
  const [tool] = listDutyTools(store)
  const opened = await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: { scene: "三个圆" }, task: {} } },
    memory(store),
  )
  const taskId = taskOf(opened).taskId
  store.tasks[0].createdAt = new Date(Date.now() - MCP_TASK_TTL_MS - 1000).toISOString()
  const missing = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tasks/get", params: { taskId } }, memory(store))
  assert.equal(bodyOf(missing).error?.code, -32602)
  const listed = await handleMcp({ jsonrpc: "2.0", id: 3, method: "tasks/list", params: {} }, memory(store))
  const page = bodyOf(listed).result as { tasks: { taskId: string }[] }
  assert.equal(page.tasks.some((item) => item.taskId === taskId), false)
  const badCursor = await handleMcp({ jsonrpc: "2.0", id: 4, method: "tasks/list", params: { cursor: "@@@" } }, memory(store))
  assert.equal(bodyOf(badCursor).error?.code, -32602)
  const badTask = await handleMcp(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: tool.name, arguments: { scene: "三个圆" }, task: "soon" } },
    memory(store),
  )
  assert.equal(bodyOf(badTask).error?.code, -32602)
  const absent = await handleMcp({ jsonrpc: "2.0", id: 6, method: "tasks/get", params: { taskId: "missing" } }, memory(store))
  assert.equal(bodyOf(absent).error?.code, -32602)
})

test("tasks/result waits out a working task until it leaves working", async () => {
  const { store, on } = world()
  const [tool] = listDutyTools(store)
  await handleMcp(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: { scene: "三个圆" }, task: {} } },
    memory(store),
  )
  const taskId = store.tasks[0].id
  const io = memory(store)
  io.maxWaitMs = 5_000
  io.sleep = async () => {
    submitArtifact(store, taskId, on.id, '{"count":3}')
  }
  const result = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tasks/result", params: { taskId } }, io)
  assert.equal(bodyOf(result).error, undefined)
  assert.match((bodyOf(result).result as { content: { text: string }[] }).content[0].text, /a2h_score/)
  assert.equal(store.tasks[0].status, "input-required")
})

function modernCall(
  store: Store,
  method: string,
  params: Record<string, unknown>,
  id: unknown = 1,
  capabilities: Record<string, unknown> = { extensions: { "io.modelcontextprotocol/tasks": {} } },
  io?: McpIo,
) {
  const name = typeof params.name === "string" ? params.name : typeof params.taskId === "string" ? params.taskId : null
  const headers: McpHeaders = { protocolVersion: "2026-07-28", method, name }
  return handleMcp(
    {
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": { name: "cursor", version: "1" },
          "io.modelcontextprotocol/clientCapabilities": capabilities,
        },
      },
    },
    io ?? memory(store),
    headers,
  )
}

test("2026-07-28 discover, task handle, and a2h_score share the A2A task with the legacy mode", async () => {
  const { store, on } = world()
  const [tool] = listDutyTools(store)
  const discovered = await modernCall(store, "server/discover", {})
  const discovery = bodyOf(discovered).result as {
    resultType: string
    supportedVersions: string[]
    capabilities: { extensions: Record<string, unknown> }
  }
  assert.equal(discovery.resultType, "complete")
  assert.ok(discovery.supportedVersions.includes("2026-07-28"))
  assert.ok(discovery.supportedVersions.includes("2025-11-25"))
  assert.deepEqual(discovery.capabilities.extensions["io.modelcontextprotocol/tasks"], {})
  const opened = await modernCall(store, "tools/call", { name: tool.name, arguments: { scene: "三个圆" }, task: { ttl: 1000 } })
  const created = bodyOf(opened).result as { resultType: string; taskId: string; status: string; ttlMs: number; pollIntervalMs: number; task?: unknown }
  assert.equal(created.resultType, "task")
  assert.equal(created.status, "working")
  assert.equal(created.task, undefined)
  assert.equal(created.ttlMs, MCP_TASK_TTL_MS)
  assert.equal(created.pollIntervalMs, MCP_TASK_POLL_MS)
  assert.equal(created.taskId, store.tasks[0].id)
  const legacy = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tasks/get", params: { taskId: created.taskId } }, memory(store))
  assert.equal(taskOf(legacy).status, "working")
  assert.equal((bodyOf(legacy).result as { resultType?: string }).resultType, undefined)
  assert.equal(taskOf(legacy).pollInterval, MCP_TASK_POLL_MS)
  submitArtifact(store, created.taskId, on.id, '{"count":3}')
  const scoring = await modernCall(store, "tasks/get", { taskId: created.taskId }, 3)
  const ask = bodyOf(scoring).result as {
    resultType: string
    status: string
    inputRequests: { score: { method: string } }
    statusMessage: string
  }
  assert.equal(ask.resultType, "complete")
  assert.equal(ask.status, "input_required")
  assert.equal(ask.inputRequests.score.method, "elicitation/create")
  assert.match(ask.statusMessage, /a2h_score/)
  assert.match(ask.statusMessage, /60/)
  const removed = await modernCall(store, "tasks/result", { taskId: created.taskId }, 4)
  assert.equal(removed.status, 404)
  assert.equal(bodyOf(removed).error?.code, -32601)
  const scored = await modernCall(store, "tools/call", { name: "a2h_score", arguments: { taskId: created.taskId, score: 4 } }, 5, {})
  const scoreResult = bodyOf(scored).result as { resultType: string; content: { text: string }[]; isError?: boolean }
  assert.equal(scoreResult.resultType, "complete")
  assert.equal(scoreResult.isError, undefined)
  assert.equal(scoreResult.content[0].text, '{"count":3}')
  assert.equal(store.tasks[0].workScore, 4)
  const legacyResult = await handleMcp({ jsonrpc: "2.0", id: 6, method: "tasks/result", params: { taskId: created.taskId } }, memory(store))
  assert.equal((bodyOf(legacyResult).result as { content: { text: string }[] }).content[0].text, '{"count":3}')
  const done = await modernCall(store, "tasks/get", { taskId: created.taskId }, 7)
  const finished = bodyOf(done).result as { status: string; result: { content: { text: string }[]; isError: boolean } }
  assert.equal(finished.status, "completed")
  assert.equal(finished.result.isError, false)
  assert.equal(finished.result.content[0].text, '{"count":3}')
})

test("2026-07-28 drops a missed score after 60s and still returns the artifact", async () => {
  const { store, on } = world()
  const [tool] = listDutyTools(store)
  const opened = await modernCall(store, "tools/call", { name: tool.name, arguments: { scene: "三个圆" } })
  const taskId = (bodyOf(opened).result as { taskId: string }).taskId
  submitArtifact(store, taskId, on.id, '{"count":3}')
  const request = store.messages.find((item) => item.taskId === taskId && item.kind === "task.scoreRequest")
  assert.ok(request)
  request.createdAt = new Date(Date.now() - 61_000).toISOString()
  const got = await modernCall(store, "tasks/get", { taskId }, 2)
  const view = bodyOf(got).result as { status: string; result: { content: { text: string }[]; isError: boolean } }
  assert.equal(view.status, "completed")
  assert.equal(view.result.isError, false)
  assert.equal(view.result.content[0].text, '{"count":3}')
  assert.equal(store.tasks[0].workScore, undefined)
  const late = await modernCall(store, "tools/call", { name: "a2h_score", arguments: { taskId, score: 4 } }, 3)
  assert.equal((bodyOf(late).result as { isError?: boolean }).isError, true)
  assert.equal(store.tasks[0].workScore, undefined)
})

test("2026-07-28 tasks/update scores, tasks/cancel acks, and a client without the extension keeps the fallback", async () => {
  const { store, on } = world()
  const [tool] = listDutyTools(store)
  const io = memory(store)
  io.maxWaitMs = 30_000
  io.sleep = async () => {
    throw new Error("modern task call waited")
  }
  const opened = await modernCall(store, "tools/call", { name: tool.name, arguments: { scene: "三个圆" } }, 1, undefined, io)
  const taskId = (bodyOf(opened).result as { taskId: string }).taskId
  submitArtifact(store, taskId, on.id, '{"count":3}')
  const updated = await modernCall(
    store,
    "tasks/update",
    { taskId, inputResponses: { score: { action: "accept", content: { score: 5 } } } },
    2,
  )
  assert.equal((bodyOf(updated).result as { resultType: string }).resultType, "complete")
  assert.equal(store.tasks[0].workScore, 5)
  assert.equal(store.tasks[0].status, "completed")
  const again = await modernCall(store, "tools/call", { name: tool.name, arguments: { scene: "四个圆" } }, 3)
  const second = (bodyOf(again).result as { taskId: string }).taskId
  const cancelled = await modernCall(store, "tasks/cancel", { taskId: second }, 4)
  assert.equal((bodyOf(cancelled).result as { resultType: string; status?: string }).resultType, "complete")
  assert.equal((bodyOf(cancelled).result as { status?: string }).status, undefined)
  assert.equal(store.tasks.find((item) => item.id === second)?.status, "canceled")
  const listed = await modernCall(store, "tasks/list", {}, 5)
  assert.equal(listed.status, 404)
  const failed = await modernCall(store, "tasks/get", { taskId: second }, 6)
  assert.equal((bodyOf(failed).result as { status: string }).status, "cancelled")
  const third = await modernCall(store, "tools/call", { name: tool.name, arguments: { scene: "五个圆" } }, 7)
  const thirdId = (bodyOf(third).result as { taskId: string }).taskId
  decideTask(store, thirdId, on.id, "fail", "做不到")
  const toolError = await modernCall(store, "tasks/get", { taskId: thirdId }, 8)
  const failedView = bodyOf(toolError).result as { status: string; result: { isError: boolean; content: { text: string }[] } }
  assert.equal(failedView.status, "completed")
  assert.equal(failedView.result.isError, true)
  assert.match(failedView.result.content[0].text, /做不到/)
  const fallback = await modernCall(
    store,
    "tools/call",
    { name: tool.name, arguments: { scene: "六个圆" }, task: {} },
    9,
    {},
    memory(store),
  )
  const fallbackResult = bodyOf(fallback).result as { resultType: string; content: { text: string }[]; taskId?: string }
  assert.equal(fallbackResult.resultType, "complete")
  assert.equal(fallbackResult.taskId, undefined)
  assert.match(fallbackResult.content[0].text, /task_id/)
  const bare = await modernCall(store, "tasks/get", { taskId: thirdId }, 10, {})
  assert.equal(bare.status, 400)
  assert.equal(bodyOf(bare).error?.code, -32021)
})

test("2026-07-28 rejects a protocol header that does not match _meta", async () => {
  const { store } = world()
  const mismatch = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2025-11-25",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    },
    memory(store),
    { protocolVersion: "2026-07-28", method: "tools/list" },
  )
  assert.equal(mismatch.status, 400)
  assert.equal(bodyOf(mismatch).error?.code, -32020)
  const unsupported = await handleMcp(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "1900-01-01",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    },
    memory(store),
    { protocolVersion: "1900-01-01", method: "tools/list" },
  )
  assert.equal(unsupported.status, 400)
  assert.equal(bodyOf(unsupported).error?.code, -32022)
  const supported = (bodyOf(unsupported).error as { data?: { supported?: string[]; requested?: string } } | undefined)?.data
  assert.equal(supported?.requested, "1900-01-01")
  assert.ok(supported?.supported?.includes("2026-07-28"))
  assert.ok(supported?.supported?.includes("2025-11-25"))
})
