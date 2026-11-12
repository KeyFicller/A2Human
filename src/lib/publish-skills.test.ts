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
  catalogText,
  relocalizeFields,
  defaultTaskInput,
  deliveryOf,
  deliverySchema,
  DRAW_LIMIT_MS,
  drawClock,
  fieldPill,
  installedLabel,
  isBlankDraft,
  mergePresetCatalog,
  MIC_LIMIT_MS,
  micClock,
  promisesOpenMic,
  usesTimedMic,
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
  bioIssue,
  promisesTimedDraw,
  usesTimedBoard,
  withToolId,
  workerSessionKey,
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
  assert.equal(slots[0].template, "open_mic")
  assert.equal(slots[0].title, "一展歌喉")
  assert.equal(slots[0].description, SKILL_CATALOG[6].description)
  assert.equal(slots[0].sample, SKILL_CATALOG[6].sample)
  assert.equal(deliveryOf(SKILL_CATALOG[6].outputSchema), "audio_text")
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
    output: Record<string, string>
  }
  const en = JSON.parse(readFileSync(new URL("../locales/en.json", import.meta.url), "utf8")) as {
    publish: Record<string, string>
    output: Record<string, string>
  }
  const empty = previewFields({ title: "", description: "", sample: "" })
  assert.deepEqual(empty, { title: "", description: "", task: "" })
  assert.notEqual(empty.title, zh.publish.displayPlaceholder)
  assert.notEqual(empty.description, zh.publish.callHint)
  assert.notEqual(empty.task, zh.publish.samplePlaceholder)
  assert.notEqual(empty.task, en.publish.samplePlaceholder)
  assert.equal(zh.publish.askOptional, "再加一项可选输入")
  assert.equal(en.publish.askOptional, "Add another optional input")
  assert.equal(zh.output.playRoll, "写下掷出或抽到的结果。也可以拍下这次动作。")
  assert.equal(en.output.playRoll, "Write the number you rolled or drew. A photo of that action is optional.")
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
  assert.equal(usesTimedBoard("sketch_pengpengyun", "image", "timed_draw"), true)
  assert.equal(usesTimedBoard("sketch_pengpengyun", "text", "timed_draw"), false)
  assert.equal(usesTimedBoard("sketch_pengpengyun", "image"), false)
  assert.equal(promisesTimedDraw("计时三十秒，亲手画完。"), true)
  assert.equal(promisesTimedDraw("写一段说明。"), false)
  assert.equal(workerSessionKey(0, "hand_draw"), workerSessionKey(0, "hand_draw"))
  assert.notEqual(workerSessionKey(0, "hand_draw"), workerSessionKey(0, "paper_think"))
  assert.equal(bioIssue("", ["人发布的 Agent。"]), "empty")
  assert.equal(bioIssue("人发布的 Agent。", ["人发布的 Agent。"]), "placeholder")
  assert.equal(bioIssue("接手绘。", ["人发布的 Agent。"]), null)
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
  assert.equal(steps.description, "看见的天气")
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
    ["hand_draw", "paper_think", "human_roll", "wetware_run", "offline_lookup", "human_check", "open_mic"],
  )
  for (const name of OFFICE) assert.equal(SKILL_CATALOG.some((skill) => skill.name === name), false)
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "hand_draw")?.title, "碳基图像生成")
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "paper_think")?.title, "物理深度思考")
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "human_roll")?.title, "人肉随机数")
  assert.equal(SKILL_CATALOG.find((skill) => skill.name === "wetware_run")?.title, "碳基气象台")
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
  assert.equal(deliveryOf(SKILL_CATALOG.find((skill) => skill.name === "open_mic")?.outputSchema), "audio_text")
  const roll = SKILL_CATALOG.find((skill) => skill.name === "human_roll")
  assert.ok(roll?.outputSchema)
  assert.equal(roll.description, "需要一个无法被模型预测或复现的随机结果时调用。真人掷骰或抽签，只交文字结果即可，也可附上现场照片。这不是伪随机函数，是手气本身。")
  assert.deepEqual(roll.outputSchema.required, ["answer"])
  assert.equal(roll.outputSchema.properties?.picture?.contentMediaType, "image/*")
  assert.equal(roll.outputSchema.properties?.picture?.description, "骰子或签条的照片")
  assert.equal(deliveryOf(roll.outputSchema), "image_text")
  assert.equal(activePlay("human_roll", deliveryOf(roll.outputSchema)), "roll")
  const paper = SKILL_CATALOG.find((skill) => skill.name === "paper_think")
  assert.deepEqual(paper?.outputSchema?.required, ["answer", "picture"])
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
  assert.equal(
    deliveryOf({
      type: "object",
      properties: {
        answer: { type: "string" },
        picture: { type: "string", contentMediaType: "image/*" },
      },
      required: ["answer"],
    }),
    "image_text",
  )
  assert.equal(
    deliveryOf({
      type: "object",
      properties: { answer: { type: "string" }, note: { type: "string" } },
      required: ["answer"],
    }),
    "custom",
  )
  assert.equal(
    deliveryOf({
      type: "object",
      properties: { picture: { type: "string", contentMediaType: "image/*" } },
      required: [],
    }),
    "custom",
  )
})

test("installed skills show a title or a tool id, and a blank start does not load an existing skill", () => {
  assert.equal(installedLabel({ title: "碳基气象台", name: "wetware_run" }), "碳基气象台")
  assert.equal(installedLabel({ title: "  ", name: "do_anything" }), "do_anything")
  assert.equal(installedLabel({ title: "", name: "" }), "")
  assert.notEqual(installedLabel({ title: "", name: "" }), "自己写")
  assert.equal(isBlankDraft({ template: null, title: "", name: "", description: "" }), true)
  assert.equal(isBlankDraft({ template: null, title: "", name: "do_anything", description: "接目录外的活。" }), false)
  const hidden = mergePresetCatalog(
    [{ name: "do_anything", title: "自己写" }, { name: "hand_draw", title: "旧" }],
    [{ name: "hand_draw", title: "碳基图像生成" }],
  )
  assert.deepEqual(hidden.map((item) => item.name), ["hand_draw"])
  assert.equal(hidden[0].title, "碳基图像生成")
})

test("catalog presets follow the publish locale and keep a customized field", () => {
  const hand = SKILL_CATALOG.find((skill) => skill.name === "hand_draw")
  assert.ok(hand && "en" in hand)
  const localized = hand as typeof hand & { en: { title: string; description: string; sample: string } }
  const zh = catalogText(localized, "zh")
  const en = catalogText(localized, "en")
  assert.equal(zh.title, "碳基图像生成")
  assert.equal(en.title, "Carbon image generation")
  assert.equal(en.sample, "Draw a cat drinking tea. 30 seconds, and whatever you finish is the picture.")
  const refreshed = relocalizeFields({ title: zh.title, description: "我改过", sample: zh.sample }, zh, en)
  assert.equal(refreshed.title, en.title)
  assert.equal(refreshed.description, "我改过")
  assert.equal(refreshed.sample, en.sample)
  const weather = SKILL_CATALOG.find((skill) => skill.name === "wetware_run")
  assert.equal(weather?.title, "碳基气象台")
  assert.equal(weather?.name, "wetware_run")
  assert.equal((weather as { en?: { title: string } } | undefined)?.en?.title, "Carbon weather desk")
  for (const skill of SKILL_CATALOG) {
    const english = (skill as { en?: { title: string; description: string; sample: string } }).en
    assert.ok(english)
    assert.ok(english.title.trim())
    assert.ok(english.description.length <= 320)
    assert.ok(english.sample.trim())
    assert.equal(skill.description.includes("人肉") && skill.name === "wetware_run", false)
  }
})

test("audio delivery and the open mic stay attached to a custom tool id", () => {
  const audio = deliverySchema("audio")
  const both = deliverySchema("audio_text")
  assert.equal(deliveryOf(audio), "audio")
  assert.equal(deliveryOf(both), "audio_text")
  assert.equal(audio.properties.audio.contentMediaType, "audio/*")
  assert.deepEqual(both.required, ["answer", "audio"])
  assert.equal(playMode("open_mic"), "open_mic")
  assert.equal(activePlay("open_mic", "audio_text"), "open_mic")
  assert.equal(activePlay("my_song", "audio_text", "open_mic"), "open_mic")
  assert.equal(activePlay("my_song", "text", "open_mic"), null)
  assert.equal(usesTimedMic("my_song", "audio_text", "open_mic"), true)
  assert.equal(usesTimedMic("open_mic", "text"), false)
  assert.equal(promisesOpenMic("十五秒，唱到哪算哪。"), true)
  assert.equal(promisesOpenMic("写一段说明。"), false)
  assert.equal(MIC_LIMIT_MS, 15_000)
  assert.deepEqual(micClock(null, 1_000), { phase: "idle", leftMs: 15_000 })
  assert.deepEqual(micClock(1_000, 16_000), { phase: "frozen", leftMs: 0 })
  const mic = SKILL_CATALOG.find((skill) => skill.name === "open_mic")
  assert.equal(deliveryOf(mic?.outputSchema), "audio_text")
  assert.deepEqual(mic?.outputSchema?.required, ["answer", "audio"])
})
