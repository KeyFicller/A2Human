import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import {
  canAddCustomSkill,
  customSkillAddLabel,
  defaultTaskInput,
  deliveryOf,
  deliverySchema,
  fieldPill,
  skillPayload,
  toolIdFromTitle,
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

test("the add button says add another once a custom skill is already listed", () => {
  assert.equal(customSkillAddLabel(0), "customAdd")
  assert.equal(customSkillAddLabel(1), "addSkill")
  assert.equal(customSkillAddLabel(5), "addSkill")
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
