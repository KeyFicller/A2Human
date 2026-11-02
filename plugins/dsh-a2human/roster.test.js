import assert from "node:assert/strict"
import test from "node:test"
import {
  delegateTask,
  describeDuty,
  directoryUrl,
  messageParts,
  readRoster,
  sendBody,
  summarizeRoster,
  toolName,
  uniqueToolNames,
} from "./roster.js"

const card = {
  name: "A2Human",
  a2human: {
    onDuty: [
      {
        name: "米粒",
        url: "https://example.test/api/a2a/11111111-1111-1111-1111-111111111111",
        skills: [
          {
            name: "计数",
            description: "数清画面里的东西。",
            inputSchema: { type: "object", required: ["scene"] },
            outputSchema: { type: "object", required: ["count"] },
          },
        ],
      },
      {
        name: "阿梨",
        url: "https://example.test/api/a2a/22222222-2222-2222-2222-222222222222/",
        skills: [{ name: "看现场", description: "只回答自己看见的。" }],
      },
    ],
  },
}

test("a directory address is normalized to the agent card", () => {
  assert.equal(directoryUrl("https://example.test"), "https://example.test/.well-known/agent-card.json")
  assert.equal(
    directoryUrl("https://example.test/.well-known/agent-card.json"),
    "https://example.test/.well-known/agent-card.json",
  )
  assert.equal(directoryUrl("https://example.test/api/a2a"), "https://example.test/api/a2a")
  assert.throws(() => directoryUrl("file:///tmp/card.json"), /http/)
})

test("on-duty people become one entry per skill", () => {
  const roster = readRoster(card)
  assert.equal(roster.length, 2)
  assert.equal(roster[0].personName, "阿梨")
  assert.equal(roster[1].personName, "米粒")
  assert.equal(roster[1].url, "https://example.test/api/a2a/11111111-1111-1111-1111-111111111111")
  assert.equal(roster[1].inputSchema.required[0], "scene")
  assert.equal(readRoster({ capabilities: { extensions: [{ params: { onDuty: card.a2human.onDuty } }] } }).length, 2)
  assert.equal(readRoster({ a2human: { onDuty: [{ name: "坏", url: "javascript:alert(1)", skills: [{ name: "x" }] }] } }).length, 0)
})

test("tool names stay callable and distinct", () => {
  const named = uniqueToolNames(readRoster(card))
  assert.equal(named.length, 2)
  for (const item of named) assert.match(item.name, /^[A-Za-z0-9_-]{1,64}$/)
  assert.notEqual(named[0].name, named[1].name)
  assert.equal(toolName(readRoster(card)[1]), toolName(readRoster(card)[1]))
  assert.match(describeDuty(readRoster(card)[1]), /米粒/)
  assert.match(summarizeRoster(readRoster(card)), /2 项在岗技能/)
})

test("a json prompt is sent as data and the call waits for the person", async () => {
  assert.deepEqual(messageParts('{"scene":"三个圆"}'), [{ mediaType: "application/json", data: { scene: "三个圆" } }])
  const body = sendBody({ messageId: "m1", skill: "计数", prompt: "数一下" })
  assert.equal(body.params.configuration.returnImmediately, true)
  assert.equal(body.params.metadata.skill, "计数")
  assert.deepEqual(body.params.message.parts, [{ mediaType: "text/plain", text: "数一下" }])

  const calls = []
  const result = await delegateTask({
    url: "https://example.test/api/a2a/person",
    skill: "计数",
    prompt: "数一下",
    intervalMs: 0,
    messageId: "m1",
    call: async (url, payload) => {
      calls.push(payload.method)
      assert.equal(url, "https://example.test/api/a2a/person")
      if (payload.method === "SendMessage") {
        return { result: { task: { id: "task-1", status: { state: "TASK_STATE_WORKING" } } } }
      }
      return {
        result: {
          id: "task-1",
          status: { state: "TASK_STATE_COMPLETED" },
          artifacts: [{ parts: [{ data: { count: 3 } }] }],
        },
      }
    },
  })
  assert.deepEqual(calls, ["SendMessage", "GetTask"])
  assert.equal(result, '{"count":3}')
})

test("a failed task surfaces the remote message", async () => {
  await assert.rejects(
    delegateTask({
      url: "https://example.test/api/a2a/person",
      skill: "计数",
      prompt: "数一下",
      intervalMs: 0,
      call: async () => ({
        result: { task: { id: "task-2", status: { state: "TASK_STATE_FAILED", message: { parts: [{ text: "没上工" }] } } } },
      }),
    }),
    /没上工/,
  )
})
