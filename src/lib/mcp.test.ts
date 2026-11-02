import assert from "node:assert/strict"
import test from "node:test"
import { handleMcp, listDutyTools, type McpIo } from "./mcp"
import { publishAgent, setAvailability, submitArtifact } from "./rules"
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
  const result = (opened.body as { result: { protocolVersion: string; instructions: string } }).result
  assert.equal(result.protocolVersion, "2025-06-18")
  assert.match(result.instructions, /A2A/)
  assert.match(result.instructions, /MCP/)
  const listed = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, memory(store))
  const tools = (listed.body as { result: { tools: { name: string }[] } }).result.tools
  assert.equal(tools.length, 2)
  const quiet = await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, memory(store))
  assert.equal(quiet.status, 202)
  assert.equal(quiet.body, null)
})
