import assert from "node:assert/strict"
import { test } from "node:test"

import { handedOff, hireIssue, needsWorker, readableArtifact, scoreWasSkipped } from "./task-view.ts"

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
