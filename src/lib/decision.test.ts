import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { decisionText, type DecisionDefaults } from "./decision.ts"

function taskDefaults(name: string): DecisionDefaults {
  const file = JSON.parse(readFileSync(new URL(`../locales/${name}.json`, import.meta.url), "utf8")) as {
    task: { rejectDefault: string; failDefault: string; cancelDefault: string }
  }
  return {
    reject: file.task.rejectDefault,
    fail: file.task.failDefault,
    cancel: file.task.cancelDefault,
  }
}

const zh = taskDefaults("zh")
const en = taskDefaults("en")

test("an empty reject, fail, or cancel submits the locale default", () => {
  assert.deepEqual(zh, { reject: "已拒绝。", fail: "已失败。", cancel: "已取消。" })
  assert.deepEqual(en, { reject: "Rejected.", fail: "Failed.", cancel: "Canceled." })
  assert.equal(decisionText("reject", "", zh), "已拒绝。")
  assert.equal(decisionText("fail", " \n\t ", zh), "已失败。")
  assert.equal(decisionText("cancel", "", zh), "已取消。")
  assert.equal(decisionText("reject", "", en), "Rejected.")
  assert.equal(decisionText("fail", "   ", en), "Failed.")
  assert.equal(decisionText("cancel", "", en), "Canceled.")
})

test("a written reason is sent through, and a supplement is left untouched", () => {
  assert.equal(decisionText("reject", "  这单不接。  ", zh), "这单不接。")
  assert.equal(decisionText("fail", "Stuck on the last line.", en), "Stuck on the last line.")
  assert.equal(decisionText("cancel", "改派了", zh), "改派了")
  assert.equal(decisionText("cancel", "字".repeat(200), en), "字".repeat(200))
  assert.equal(decisionText("input", "", zh), "")
  assert.equal(decisionText("input", "  还缺数字  ", en), "  还缺数字  ")
})
