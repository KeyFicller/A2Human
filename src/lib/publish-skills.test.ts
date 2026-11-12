import assert from "node:assert/strict"
import { test } from "node:test"

import { canAddCustomSkill, customSkillAddLabel } from "./publish-skills.ts"

test("another custom skill can be added until the card has six skills", () => {
  assert.equal(canAddCustomSkill(0), true)
  assert.equal(canAddCustomSkill(1), true)
  assert.equal(canAddCustomSkill(5), true)
  assert.equal(canAddCustomSkill(6), false)
})

test("the add button says add another once a custom skill is already listed", () => {
  assert.equal(customSkillAddLabel(0), "customAdd")
  assert.equal(customSkillAddLabel(1), "addSkill")
  assert.equal(customSkillAddLabel(5), "addSkill")
})
