import assert from "node:assert/strict"
import { test } from "node:test"

import { sendMessageBody } from "./hire.ts"

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
