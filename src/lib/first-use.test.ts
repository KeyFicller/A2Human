import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { displayTitle, shownSkillDescription, shownSkillSchema } from "./publish-skills.ts"
import { rosterOrder } from "./roster.ts"
import { awaitingMyScore, callTimeline, isTaskStatus, scoreDeadline, taskHeadline } from "./task-view.ts"

const catalog = JSON.parse(readFileSync(new URL("../locales/skill-catalog.json", import.meta.url), "utf8"))
const zhUi = JSON.parse(readFileSync(new URL("../locales/zh.json", import.meta.url), "utf8"))
const enUi = JSON.parse(readFileSync(new URL("../locales/en.json", import.meta.url), "utf8"))
const HAN = /[\u4e00-\u9fff]/

test("an English card shows a preset's fields in English, even when it was published in Chinese", () => {
  const preset = catalog.find((item: { name: string }) => item.name === "hand_draw")
  const stored = { name: "hand_draw", title: "碳基图像生成", description: preset.description, inputSchema: preset.inputSchema, outputSchema: preset.outputSchema }
  const input = shownSkillSchema(stored, "input", "en", catalog, enUi.publish.taskLabel)
  const output = shownSkillSchema(stored, "output", "en", catalog, enUi.publish.taskLabel)
  assert.equal(input?.properties?.task && (input.properties.task as { description: string }).description, "Task description")
  assert.equal(output?.properties?.picture && (output.properties.picture as { description: string }).description, "The picture from the 30-second board")
  assert.equal(shownSkillDescription(stored, catalog, "en"), preset.en.description)
  const back = shownSkillSchema(stored, "input", "zh", catalog, zhUi.publish.taskLabel)
  assert.equal((back?.properties?.task as { description: string }).description, "任务描述")
})

test("every preset field has an English label with no Chinese in it", () => {
  for (const item of catalog) {
    for (const side of ["input", "output"] as const) {
      const schema = side === "input" ? item.inputSchema : item.outputSchema
      const shown = shownSkillSchema(item, side, "en", catalog, enUi.publish.taskLabel)
      for (const name of Object.keys(schema.properties)) {
        const label = (shown?.properties?.[name] as { description?: string }).description ?? ""
        assert.ok(label && !HAN.test(label), `${item.name} ${side}.${name} reads "${label}" in English`)
      }
    }
  }
})

test("a custom skill keeps its own labels; only the default task label follows the locale", () => {
  const custom = {
    name: "test_blank_skill",
    description: "根据任务描述写一句话。",
    inputSchema: { type: "object", properties: { task: { type: "string", description: "任务描述" }, tone: { type: "string", description: "语气" } }, required: ["task"] },
    outputSchema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
  }
  const shown = shownSkillSchema(custom, "input", "en", catalog, enUi.publish.taskLabel)
  assert.equal((shown?.properties?.task as { description: string }).description, "Task description")
  assert.equal((shown?.properties?.tone as { description: string }).description, "语气")
  assert.equal(shownSkillDescription(custom, catalog, "en"), custom.description)
})

test("a short brief is the headline instead of a server-cut title", () => {
  assert.equal(taskHeadline("Roll one die and tell me the…", "Roll one die and tell me the number."), "Roll one die and tell me the number.")
  assert.equal(taskHeadline('QA test: summarize "buy milk"…', 'QA test: summarize "buy milk" in one line.'), 'QA test: summarize "buy milk" in one line.')
  assert.equal(taskHeadline("画一个笑脸。", "画一个笑脸。"), "画一个笑脸。")
  const long = "a".repeat(120)
  assert.equal(taskHeadline(`${"a".repeat(31)}…`, long), `${"a".repeat(31)}…`)
})

test("a sent hand-in waits for this browser's score for sixty seconds", () => {
  const handed = {
    id: "t1",
    status: "input-required" as const,
    updatedAt: "2026-11-13T07:11:57.000Z",
    artifact: '{"answer":"4"}',
    senderId: "me",
    claimantId: "worker",
  }
  const at = Date.parse(handed.updatedAt)
  assert.equal(scoreDeadline(handed), at + 60_000)
  assert.deepEqual(awaitingMyScore([handed], ["me"], at + 10_000).map((task) => task.id), ["t1"])
  assert.deepEqual(awaitingMyScore([handed], ["me"], at + 61_000), [])
  assert.deepEqual(awaitingMyScore([handed], ["someone-else"], at + 10_000), [])
  assert.equal(scoreDeadline({ ...handed, status: "working", artifact: null }), null)
  // Sending to yourself needs no score.
  assert.deepEqual(awaitingMyScore([{ ...handed, claimantId: "me" }], ["me"], at + 10_000), [])
})

test("the call log names a website sender as a person, not an anonymous Agent", () => {
  const messages = [
    { id: "m1", fromId: "agent_a2a", fromName: "测试-手绘师", kind: "task.submit", text: "Roll one die.", createdAt: "2026-11-13T07:11:44Z" },
    { id: "m2", fromId: "worker", fromName: "测试-找茬员", kind: "task.artifact", text: '{"answer":"4"}', createdAt: "2026-11-13T07:11:57Z" },
    { id: "m3", fromId: "sender", fromName: "测试-手绘师", kind: "task.score", text: "5", createdAt: "2026-11-13T07:12:30Z" },
  ]
  const web = callTimeline({ posterId: "agent_a2a", claimantId: "worker", senderId: "sender" }, messages)
  assert.deepEqual(web.map((event) => event.side), ["web", "human", "web"])
  const model = callTimeline({ posterId: "agent_a2a", claimantId: "worker" }, messages)
  assert.deepEqual(model.map((event) => event.side), ["agent", "human", "agent"])
})

test("the on-duty list sorts by score, then finished work, and keeps people without a score", () => {
  const people = [
    { name: "牛马", averageScore: 2, completed: 6, createdAt: "2026-11-12T01:00:00Z" },
    { name: "新人", averageScore: null, completed: 0, createdAt: "2026-11-13T01:00:00Z" },
    { name: "找茬员", averageScore: 5, completed: 1, createdAt: "2026-11-12T03:00:00Z" },
    { name: "空白党", averageScore: 4, completed: 6, createdAt: "2026-11-12T02:00:00Z" },
    { name: "手绘师", averageScore: 4, completed: 7, createdAt: "2026-11-12T04:00:00Z" },
  ]
  assert.deepEqual(rosterOrder(people).map((person) => person.name), ["找茬员", "手绘师", "空白党", "牛马", "新人"])
})

test("a hire result keeps the status code so it can be shown in either language", () => {
  assert.equal(isTaskStatus("working"), true)
  assert.equal(isTaskStatus("进行中"), false)
})

test("duty status uses one word pair in each language", () => {
  assert.equal(zhUi.duty.working, zhUi.duty.on)
  assert.equal(zhUi.duty.clockedOff, zhUi.duty.off)
  assert.equal(enUi.duty.working, enUi.duty.on)
  assert.equal(enUi.duty.clockedOff, enUi.duty.off)
})

test("a preset's catalog title follows the locale; a written title stays", () => {
  assert.equal(displayTitle({ name: "hand_draw", title: "碳基图像生成" }, catalog, "en"), "Carbon image generation")
  assert.equal(displayTitle({ name: "hand_draw", title: "Carbon image generation" }, catalog, "zh"), "碳基图像生成")
  assert.equal(displayTitle({ name: "one_liner", title: "一句话总结" }, catalog, "en"), "一句话总结")
  assert.equal(displayTitle({ name: "customer_reply" }, catalog, "en"), "customer_reply")
})
