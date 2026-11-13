import assert from "node:assert/strict"
import { test } from "node:test"

import { briefRepeatsTitle, callTimeline, handedOff, hireIssue, needsWorker, readableArtifact, scoreWasSkipped, scorerFor, sentBy } from "./task-view.ts"

test("a handed-in task is not still open for the person doing it", () => {
  assert.equal(handedOff({ status: "input-required", artifact: "7" }), true)
  assert.equal(handedOff({ status: "input-required", artifactImage: { mediaType: "image/png" } }), true)
  assert.equal(handedOff({ status: "input-required", artifact: null }), false)
  assert.equal(handedOff({ status: "working", artifact: null }), false)
  assert.equal(needsWorker({ status: "working", artifact: null }), true)
  assert.equal(needsWorker({ status: "input-required", artifact: "7" }), false)
})

test("a delivered task with no score says the score was skipped", () => {
  assert.equal(scoreWasSkipped({ status: "completed", artifact: "7" }), true)
  assert.equal(scoreWasSkipped({ status: "completed", artifact: "7", workScore: 4 }), false)
  assert.equal(scoreWasSkipped({ status: "working", artifact: null }), false)
})

test("answer json is shown as the answer prose", () => {
  assert.equal(readableArtifact('{"answer":"头顶一个问号"}'), "头顶一个问号")
  assert.equal(readableArtifact("画完了"), "画完了")
  assert.equal(readableArtifact('{"count":"7"}'), "count: 7")
})

test("a hire needs text, and a skill when there is more than one", () => {
  assert.equal(hireIssue("  ", "hand_draw", 1), "text")
  assert.equal(hireIssue("画一只猫", "", 1), null)
  assert.equal(hireIssue("画一只猫", "", 2), "skill")
  assert.equal(hireIssue("画一只猫", "hand_draw", 2), null)
})

test("the call timeline follows the recorded messages and marks who spoke", () => {
  const task = { posterId: "agent-1", claimantId: "human-1" }
  const at = "2026-11-13T00:00:00.000Z"
  const events = callTimeline(task, [
    { id: "m1", fromId: "agent-1", fromName: "Painter Bot", kind: "task.submit", text: "画一只正在喝茶的猫", createdAt: at },
    { id: "m2", fromId: "human-1", fromName: "Yuhui", kind: "task.progress", text: "茶杯画上了", createdAt: at },
    { id: "m3", fromId: "human-1", fromName: "Yuhui", kind: "task.artifact", text: "{\"answer\":\"first\"}", createdAt: at },
    { id: "m4", fromId: "human-1", fromName: "Yuhui", kind: "task.artifact", text: "second", createdAt: at },
    { id: "m5", fromId: "agent-1", fromName: "Painter Bot", kind: "task.scoreRequest", text: "", createdAt: at },
    { id: "m6", fromId: "agent-1", fromName: "Painter Bot", kind: "task.score", text: "4", createdAt: at },
    { id: "m7", fromId: "agent-1", fromName: "Painter Bot", kind: "task.complete", text: "", createdAt: at },
  ])
  assert.deepEqual(events.map((event) => [event.step, event.side]), [
    ["request", "agent"],
    ["progress", "human"],
    ["artifact", "human"],
    ["artifact", "human"],
    ["score", "agent"],
    ["complete", "agent"],
  ])
  assert.equal(events[2].text, "first")
  assert.deepEqual(events.map((event) => event.media), [false, false, false, true, false, false])
  assert.deepEqual(callTimeline(task, []), [])
})

test("a brief that only repeats the title stays folded", () => {
  assert.equal(briefRepeatsTitle("画一只正在喝茶的猫", " 画一只正在喝茶的猫 "), true)
  assert.equal(briefRepeatsTitle("画一只正在喝茶的…", "画一只正在喝茶的猫，要有热气"), false)
})

test("outbound lists and the score form follow every id this browser sent as", () => {
  const tasks = [
    { id: "a", senderId: "visitor-12345678", claimantId: "p", updatedAt: "2026-11-13T01:00:00Z" },
    { id: "b", senderId: "agent-1", claimantId: "p", updatedAt: "2026-11-13T02:00:00Z" },
    { id: "c", claimantId: "p", updatedAt: "2026-11-13T03:00:00Z" },
    { id: "d", senderId: "agent-1", claimantId: "agent-1", updatedAt: "2026-11-13T04:00:00Z" },
  ]
  assert.deepEqual(sentBy(tasks, ["agent-1", "visitor-12345678"]).map((task) => task.id), ["d", "b", "a"])
  assert.deepEqual(sentBy(tasks, []), [])
  assert.equal(scorerFor(tasks[0], ["agent-1", "visitor-12345678"]), "visitor-12345678")
  assert.equal(scorerFor(tasks[2], ["agent-1"]), null)
  assert.equal(scorerFor(tasks[3], ["agent-1"]), null)
})
