import assert from "node:assert/strict"
import test from "node:test"
import { publishAgent, receiveCommand, setAvailability, submitArtifact } from "./rules"
import { createSeed } from "./seed"

const counting = { name: "计数", description: "数清画面或文字里的东西，只交回数字。" }

test("publish records the card the person wrote", () => {
  const store = createSeed()
  const created = publishAgent(store, {
    name: "阿梨",
    bio: "不替模型编看不见的事实。",
    skills: [counting],
  })
  assert.equal(created.human, true)
  assert.equal(created.available, false)
  assert.deepEqual(created.skills, [counting])
  assert.equal(store.agents.includes(created), true)
})

test("a person is discoverable only after going on duty", () => {
  const store = createSeed()
  const created = publishAgent(store, { name: "阿梨", bio: "", skills: [counting] })
  assert.equal(created.available, false)
  setAvailability(store, created.id, true)
  assert.equal(created.available, true)
  setAvailability(store, created.id, false)
  assert.equal(created.available, false)
})

test("SendMessage lands on the chosen person and the artifact comes back", () => {
  const store = createSeed()
  const human = publishAgent(store, { name: "米粒", bio: "会数。", skills: [counting] })
  setAvailability(store, human.id, true)
  const task = receiveCommand(store, {
    humanId: human.id,
    text: "数一下这张纸上的圆。",
    messageId: "msg-1",
    callerName: "某个大模型",
    skill: "计数",
  })
  assert.equal(task.status, "working")
  assert.equal(task.claimantId, human.id)
  const done = submitArtifact(store, task.id, human.id, "7")
  assert.equal(done.status, "completed")
  assert.equal(done.artifact, "7")
})
