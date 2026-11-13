import assert from "node:assert/strict"
import { test } from "node:test"

import { VISITOR_KEY, keptVisitorId, sendMessageBody, webSenderId } from "./hire.ts"

test("the copied call is a SendMessage, and it names the sender", () => {
  const body = sendMessageBody({
    text: "画一只猫",
    skill: "sketch_pengpengyun",
    caller: "测试-找茬员",
    senderId: "agent-1",
    messageId: "msg-1",
  })
  assert.equal(body.method, "SendMessage")
  assert.equal(body.params.message.parts[0].text, "画一只猫")
  assert.deepEqual(body.params.metadata, { skill: "sketch_pengpengyun", caller: "测试-找茬员", senderId: "agent-1" })
  assert.equal(JSON.stringify(body).includes("supportedInterfaces"), false)
})

function memory(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed))
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), items }
}

test("a published card sends as itself, a visitor keeps one id across hires", () => {
  assert.equal(webSenderId("agent-1", memory(), () => "unused"), "agent-1")
  const storage = memory()
  const first = webSenderId(null, storage, () => "5F0C2A9E-7D1B-4C4E-9A11-0B6F3C2D8E77")
  assert.equal(first, "visitor-5f0c2a9e-7d1b-4c4e-9a11-0b6f3c2d8e77")
  assert.equal(webSenderId(null, storage, () => "another-one-entirely"), first)
  assert.equal(storage.items.get(VISITOR_KEY), first)
  assert.equal(keptVisitorId(storage), first)
  assert.equal(keptVisitorId(memory({ [VISITOR_KEY]: "not a visitor id" })), null)
  assert.equal(webSenderId(null, null, () => "x"), undefined)
})
