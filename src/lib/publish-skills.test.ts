import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  addAnotherSlot,
  applyToSlot,
  blankDeliveryText,
  blankIdentity,
  canAddCustomSkill,
  canStartAnother,
  defaultTaskInput,
  deliveryOf,
  deliverySchema,
  DRAW_LIMIT_MS,
  drawClock,
  fieldPill,
  mergePresetCatalog,
  personNameIssue,
  playMode,
  presetIdentity,
  previewFields,
  previewSessionKey,
  publishAction,
  skillPayload,
  toolIdAfterTitle,
  toolIdFromTitle,
  toolIdProblem,
  activePlay,
  usesTimedBoard,
  withToolId,
} from "./publish-skills.ts"

const SKILL_CATALOG = JSON.parse(readFileSync(new URL("../locales/skill-catalog.json", import.meta.url), "utf8")) as Array<{
  name: string
  title?: string
  description: string
  sample?: string
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] }
  outputSchema?: { type?: string; properties?: Record<string, { type?: string; contentMediaType?: string }>; required?: string[] }
}>

const TOOL_ID = /^[a-z][a-z0-9_]{0,23}$/

test("another custom skill can be added until the card has six skills", () => {
  assert.equal(canAddCustomSkill(0), true)
  assert.equal(canAddCustomSkill(1), true)
  assert.equal(canAddCustomSkill(5), true)
  assert.equal(canAddCustomSkill(6), false)
})

test("another skill is a separate action and stops at six", () => {
  assert.equal(canStartAnother(0), false)
  assert.equal(canStartAnother(1), true)
  assert.equal(canStartAnother(5), true)
  assert.equal(canStartAnother(6), false)
})

test("preset capsules replace the skill being edited instead of stacking", () => {
  const hand = SKILL_CATALOG.find((skill) => skill.name === "hand_draw")
  const paper = SKILL_CATALOG.find((skill) => skill.name === "paper_think")
  assert.ok(hand && paper)
  let slots = applyToSlot([], 0, presetIdentity(hand, []))
  assert.equal(slots.length, 1)
  assert.equal(slots[0].name, "hand_draw")
  assert.equal(slots[0].template, "hand_draw")
  for (const item of SKILL_CATALOG) slots = applyToSlot(slots, 0, presetIdentity(item, []))
  assert.equal(slots.length, 1)
  assert.equal(slots[0].template, "human_check")
  assert.equal(slots[0].title, "人类兼容性测试")
  assert.equal(slots[0].description, SKILL_CATALOG[5].description)
  assert.equal(slots[0].sample, SKILL_CATALOG[5].sample)
  assert.equal(deliveryOf(SKILL_CATALOG[5].outputSchema), "text")
  const cleared = applyToSlot(slots, 0, blankIdentity())
  assert.equal(cleared.length, 1)
  assert.equal(cleared[0].name, "")
  assert.equal(cleared[0].template, null)
  assert.equal(cleared[0].title, "")
  const added = addAnotherSlot(cleared, blankIdentity())
  assert.ok(added)
  assert.equal(added.length, 2)
  assert.equal(addAnotherSlot(Array.from({ length: 6 }, () => blankIdentity()), blankIdentity()), null)
})

test("a tool id keeps the stated ascii rule and a hand edit is not overwritten", () => {
  assert.equal(toolIdProblem(""), "empty")
  assert.equal(toolIdProblem("手绘师"), "invalid")
  assert.equal(toolIdProblem("sketch peng"), "invalid")
  assert.equal(toolIdProblem("手绘 ABC-id 好"), "invalid")
  assert.equal(toolIdProblem("Sketch-ID"), "invalid")
  assert.equal(toolIdProblem("sketch-id"), "invalid")
  assert.equal(toolIdProblem("1sketch"), "invalid")
  assert.equal(toolIdProblem("a".repeat(25)), "invalid")
  assert.equal(toolIdProblem("sketchpeng"), null)
  assert.equal(toolIdProblem("hand_draw"), null)
  assert.equal(toolIdProblem("a".repeat(24)), null)
  const preset = presetIdentity(SKILL_CATALOG[1], [])
  assert.equal(toolIdAfterTitle("换个名字", [], SKILL_CATALOG, true, preset.name), "paper_think")
  assert.equal(toolIdAfterTitle("人肉画图机", [], SKILL_CATALOG, false, ""), toolIdFromTitle("人肉画图机", [], SKILL_CATALOG))
  assert.equal(toolIdAfterTitle("  ", [], SKILL_CATALOG, false, "skill"), "")
  const edited = withToolId({ ...preset, title: "物理深度思考" }, "my_roll")
  assert.equal(edited.title, "物理深度思考")
  assert.equal(edited.name, "my_roll")
  assert.equal(toolIdAfterTitle("另一个名字", [], SKILL_CATALOG, edited.nameTouched, edited.name), "my_roll")
})

test("preview copy ignores placeholders and checks reset with the skill being edited", () => {
  const zh = JSON.parse(readFileSync(new URL("../locales/zh.json", import.meta.url), "utf8")) as {
    publish: Record<string, string>
  }
  const en = JSON.parse(readFileSync(new URL("../locales/en.json", import.meta.url), "utf8")) as {
    publish: Record<string, string>
  }
  const empty = previewFields({ title: "", description: "", sample: "" })
  assert.deepEqual(empty, { title: "", description: "", task: "" })
  assert.notEqual(empty.title, zh.publish.displayPlaceholder)
  assert.notEqual(empty.description, zh.publish.callHint)
  assert.notEqual(empty.task, zh.publish.samplePlaceholder)
  assert.notEqual(empty.task, en.publish.samplePlaceholder)
  const named = previewFields({ title: "人肉画图机", description: "画一张", sample: "" })
  assert.equal(named.title, "人肉画图机")
  assert.equal(named.description, "画一张")
  assert.equal(named.task, "")
  assert.notEqual(previewSessionKey(0, "hand_draw", "image"), previewSessionKey(0, "paper_think", "image_text"))
  assert.notEqual(previewSessionKey(0, "hand_draw", "image"), previewSessionKey(1, "hand_draw", "image"))
  assert.notEqual(previewSessionKey(0, "hand_draw", "image"), previewSessionKey(0, "hand_draw", "text"))
  assert.notEqual(previewSessionKey(0, "hand_draw", "image"), previewSessionKey(0, null, "image"))
})

test("an empty person name belongs on the name field, and a bound card saves until a new card starts", () => {
  assert.equal(personNameIssue(""), "name.length")
  assert.equal(personNameIssue("阿"), "name.length")
  assert.equal(personNameIssue("啊".repeat(17)), "name.length")
  assert.equal(personNameIssue(" 阿梨 "), null)
  assert.equal(personNameIssue("啊".repeat(16)), null)
  assert.equal(publishAction(true, false), "save")
  assert.equal(publishAction(true, true), "publish")
  assert.equal(publishAction(false, false), "publish")
})

test("an uploaded image counts as image-only delivery and an empty object is not extra text", () => {
  assert.equal(blankDeliveryText(""), true)
  assert.equal(blankDeliveryText("  {}  "), true)
  assert.equal(blankDeliveryText('{"answer":""}'), false)
  assert.equal(blankDeliveryText("画完了"), false)
})

test("the six presets are distinct play modes and only carbon drawing uses the timed board", () => {
  assert.equal(playMode("hand_draw"), "timed_draw")
  assert.equal(playMode("paper_think"), "paper")
  assert.equal(playMode("human_roll"), "roll")
  assert.equal(playMode("wetware_run"), "wetware")
  assert.equal(playMode("offline_lookup"), "book")
  assert.equal(playMode("human_check"), "human_check")
  assert.equal(playMode("skill"), null)
  assert.equal(usesTimedBoard("hand_draw", "image"), true)
  assert.equal(usesTimedBoard("hand_draw", "text"), false)
  assert.equal(usesTimedBoard("hand_draw", "image_text"), false)
  assert.equal(usesTimedBoard("paper_think", "image"), false)
  assert.equal(activePlay("hand_draw", "image"), "timed_draw")
  assert.equal(activePlay("hand_draw", "text"), null)
  assert.equal(activePlay("paper_think", "image_text"), "paper")
  assert.equal(activePlay("paper_think", "text"), null)
  assert.equal(activePlay("offline_lookup", "text"), "book")
  assert.equal(activePlay("human_check", "image"), null)
  assert.equal(DRAW_LIMIT_MS, 30_000)
  assert.deepEqual(drawClock(null, 1_000), { phase: "idle", leftMs: 30_000 })
  assert.deepEqual(drawClock(1_000, 1_000), { phase: "live", leftMs: 30_000 })
  assert.deepEqual(drawClock(1_000, 30_999), { phase: "live", leftMs: 1 })
  assert.deepEqual(drawClock(1_000, 31_000), { phase: "frozen", leftMs: 0 })
  const picture = SKILL_CATALOG.find((skill) => skill.name === "hand_draw")?.outputSchema?.properties?.picture as { description?: string }
  const answer = SKILL_CATALOG.find((skill) => skill.name === "paper_think")?.outputSchema?.properties?.answer as { description?: string }
  const photo = SKILL_CATALOG.find((skill) => skill.name === "paper_think")?.outputSchema?.properties?.picture as { description?: string }
  const roll = SKILL_CATALOG.find((skill) => skill.name === "human_roll")?.outputSchema?.properties?.picture as { description?: string }
  const book = SKILL_CATALOG.find((skill) => skill.name === "offline_lookup")?.outputSchema?.properties?.answer as { description?: string }
  const line = SKILL_CATALOG.find((skill) => skill.name === "human_check")?.outputSchema?.properties?.answer as { description?: string }
  const steps = SKILL_CATALOG.find((skill) => skill.name === "wetware_run")?.outputSchema?.properties?.answer as { description?: string }
  assert.equal(picture.description, "三十秒画板上的图")
  assert.equal(answer.description, "算出来的答案")
  assert.equal(photo.description, "纸上草稿的照片")
  assert.equal(roll.description, "骰子或签条的照片")
  assert.equal(steps.description, "做完步骤后的结果")
  assert.equal(book.description, "书里抄来的一句")
  assert.equal(line.description, "最不像人的那一句")
  const stale = [{ name: "hand_draw", title: "旧" }]
  const merged = mergePresetCatalog(stale, [{ name: "hand_draw", title: "碳基图像生成" }])
  assert.equal(merged[0].title, "碳基图像生成")
  assert.equal(merged.length, 1)
})

const OFFICE = ["translate", "summarize", "rewrite", "proofread", "brainstorm", "schedule", "research", "coach", "customer_reply", "plan_trip"]

test("the first screen lists the carbon presets and drops the office catalog", () => {
  assert.deepEqual(
    SKILL_CATALOG.map((skill) => skill.name),
    ["hand_draw", "paper_think", "human_roll", "wetware_run", "offline_lookup", "human_check"],
  )
  for (const name of OFFICE) assert.equal(SKILL_CATALOG.some((skill) => skill.name === name), false)
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "hand_draw")?.title, "碳基图像生成")
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "paper_think")?.title, "物理深度思考")
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "human_roll")?.title, "人肉随机数")
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "wetware_run")?.title, "湿件代码执行")
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "offline_lookup")?.title, "离线知识检索")
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "human_check")?.title, "人类兼容性测试")
  for (const skill of SKILL_CATALOG) {
    assert.equal(skill.inputSchema?.required?.length, 1)
    assert.equal(skill.inputSchema?.properties && Object.keys(skill.inputSchema.properties).length, 1)
    assert.equal((skill.inputSchema?.properties?.task as { description?: string } | undefined)?.description, "任务描述")
    assert.ok(skill.sample.trim())
    assert.ok(skill.description.trim())
  }
  assert.equal(deliveryOf(SKILL_CATALOG.find((skill) => skill.name === "hand_draw")?.outputSchema), "image")
  assert.equal(deliveryOf(SKILL_CATALOG.find((skill) => skill.name === "paper_think")?.outputSchema), "image_text")
  assert.equal(deliveryOf(SKILL_CATALOG.find((skill) => skill.name === "human_roll")?.outputSchema), "image_text")
  assert.equal(deliveryOf(SKILL_CATALOG.find((skill) => skill.name === "wetware_run")?.outputSchema), "text")
  assert.equal(deliveryOf(SKILL_CATALOG.find((skill) => skill.name === "offline_lookup")?.outputSchema), "text")
  assert.equal(deliveryOf(SKILL_CATALOG.find((skill) => skill.name === "human_check")?.outputSchema), "text")
})

test("a new skill starts as one required text input", () => {
  const fields = defaultTaskInput("任务描述")
  assert.equal(fields.length, 1)
  assert.equal(fields[0].name, "task")
  assert.equal(fields[0].type, "string")
  assert.equal(fields[0].required, true)
  assert.deepEqual(fields[0].description, "任务描述")
  assert.equal(fieldPill(fields[0], "文字", "必填"), "任务描述 · 文字 · 必填")
  assert.equal(fieldPill({ ...fields[0], required: false, description: "" }, "text", "optional"), "task · text · optional")
})

test("a chinese display name gets an ascii tool id the person can keep editing", () => {
  assert.equal(toolIdFromTitle("碳基图像生成", [], SKILL_CATALOG), "hand_draw")
  assert.equal(toolIdFromTitle("碳基图像生成", ["hand_draw"], SKILL_CATALOG).startsWith("skill_"), true)
  assert.match(toolIdFromTitle("碳基推理引擎", [], SKILL_CATALOG), TOOL_ID)
  assert.equal(toolIdFromTitle("碳基推理引擎", [], SKILL_CATALOG), toolIdFromTitle("碳基推理引擎", [], SKILL_CATALOG))
  assert.notEqual(toolIdFromTitle("碳基推理引擎", [], SKILL_CATALOG), toolIdFromTitle("人肉画图机", [], SKILL_CATALOG))
  assert.equal(toolIdFromTitle("Deep Think", [], SKILL_CATALOG), "deep_think")
  assert.equal(toolIdFromTitle("Deep Think", ["deep_think"], SKILL_CATALOG), "deep_think_2")
  assert.equal(toolIdFromTitle("", [], SKILL_CATALOG), "skill")
  assert.equal(toolIdFromTitle("", ["skill"], SKILL_CATALOG), "skill_2")
})

test("the publish payload stores the display name apart from the tool id", () => {
  const payload = skillPayload({
    name: "carbon_reason",
    title: "碳基推理引擎",
    description: "在纸上推完再交。",
    inputSchema: JSON.stringify({ type: "object", properties: { task: { type: "string" } }, required: ["task"] }),
    outputSchema: JSON.stringify(deliverySchema("text")),
  })
  assert.equal(payload.name, "carbon_reason")
  assert.equal(payload.title, "碳基推理引擎")
  assert.equal(payload.description, "在纸上推完再交。")
  assert.deepEqual(JSON.parse(payload.inputSchema ?? "{}").required, ["task"])
  assert.equal(JSON.parse(payload.outputSchema ?? "{}").properties.answer.type, "string")
  const untitled = skillPayload({
    name: "neighborhood",
    title: "  ",
    description: "邻里通知。",
    inputSchema: "",
    outputSchema: "",
  })
  assert.equal("title" in untitled, false)
  assert.equal("inputSchema" in untitled, false)
})

test("switching delivery type changes the schema the duty preview checks", () => {
  const image = deliverySchema("image")
  const both = deliverySchema("image_text")
  const text = deliverySchema("text")
  assert.equal(deliveryOf(image), "image")
  assert.equal(deliveryOf(both), "image_text")
  assert.equal(deliveryOf(text), "text")
  assert.equal(image.properties.picture.contentMediaType, "image/*")
  assert.equal("answer" in image.properties, false)
  assert.equal(both.properties.picture.contentMediaType, "image/*")
  assert.equal(both.properties.answer.type, "string")
  assert.deepEqual(both.required, ["answer", "picture"])
  assert.equal("picture" in text.properties, false)
  assert.equal(deliveryOf({ type: "object", properties: { note: { type: "integer" } }, required: ["note"] }), "custom")
})
