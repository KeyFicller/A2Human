import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { durationPhrase, durationValue, kindLabel, recordLine, scoreValue, statusLabel } from "./format"
import { en, localizeError, zh } from "./messages"
import { describeSchema, fieldTypeLabel } from "./schema-fields"

function leaves(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix]
  if (!value || typeof value !== "object") return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  )
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as unknown
}

function touch(value: unknown) {
  if (typeof value === "function") (value as (a: string, b: string) => unknown)("Label", "body")
  else if (value && typeof value === "object") Object.values(value).forEach(touch)
}

function sourceFiles(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === "locales" || name === "node_modules" || name === ".next" || name === "__pycache__" || name === "tests") continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.(ts|tsx|py)$/.test(name) && !name.endsWith(".test.ts")) out.push(path)
  }
  return out
}

function paths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string" || typeof value === "function") return [prefix]
  if (!value || typeof value !== "object") return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  )
}

test("english covers every simplified chinese ui string", () => {
  assert.deepEqual(paths(en), paths(zh))
  touch(zh)
  touch(en)
  const root = fileURLToPath(new URL("../..", import.meta.url))
  const pairs = [
    ["src/locales/zh.json", "src/locales/en.json"],
    ["src/locales/wire.zh.json", "src/locales/wire.en.json"],
    ["clients/langgraph/a2human/locales/zh.json", "clients/langgraph/a2human/locales/en.json"],
  ]
  for (const [left, right] of pairs) {
    assert.deepEqual(leaves(readJson(join(root, right))), leaves(readJson(join(root, left))))
  }
})

test("production source keeps copy in resource files", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url))
  const files = [...sourceFiles(join(root, "src")), ...sourceFiles(join(root, "clients/langgraph/a2human"))]
  const hits = files.filter((file) => /[\u4e00-\u9fff]/.test(readFileSync(file, "utf8")))
  assert.deepEqual(hits, [])
})

test("record line stays chinese unless a locale is asked for", () => {
  assert.equal(recordLine(0, null, null), "完成 0 单 · 还没有得分 · 还没有耗时")
  assert.equal(recordLine(3, 4.5, 120), "完成 3 单 · 平均 4.5 分 · 平均 2 分钟")
  assert.equal(recordLine(3, 4.5, 120, "en"), "Completed 3 · avg score 4.5 · avg 2 min")
  assert.equal(recordLine(2, null, 45, "en"), "Completed 2 · no score yet · avg 45 sec")
  assert.equal(recordLine(1, 5, 60, "en"), "Completed 1 · avg score 5 · avg 1 min")
  assert.equal(durationPhrase(7, "en"), "avg 7 sec")
  assert.equal(durationPhrase(5400, "en"), "avg 1.5 hr")
  assert.equal(durationPhrase(3600, "en"), "avg 1 hr")
  assert.equal(durationPhrase(86400, "en"), "avg 1 day")
  assert.equal(durationPhrase(172800, "en"), "avg 2 days")
  assert.equal(durationValue(7), "7 秒")
  assert.equal(durationValue(7, "en"), "7 sec")
  assert.equal(durationValue(172800, "en"), "2 days")
  assert.equal(scoreValue(4.5), "4.5")
  assert.equal(scoreValue(5), "5")
  assert.equal(scoreValue(null), null)
  assert.equal(statusLabel("working"), "进行中")
  assert.equal(statusLabel("working", "en"), "In progress")
  assert.equal(statusLabel("input-required", "en"), "Needs input")
  assert.equal(kindLabel("task.score"), "打分")
  assert.equal(kindLabel("task.score", "en"), "Score")
})

test("schema phrases can be english", () => {
  const schema = {
    type: "object" as const,
    properties: { scene: { type: "string" as const }, count: { type: "integer" as const } },
    required: ["scene"],
  }
  assert.equal(describeSchema(schema), "scene 文字，必填；count 整数")
  assert.equal(describeSchema(schema, "en"), "scene text, required; count integer")
  assert.equal(
    describeSchema({ type: "object", properties: { 画面: { type: "string", description: "画面里有什么" } }, required: ["画面"] }, "en"),
    "画面 text, required: 画面里有什么",
  )
  assert.equal(fieldTypeLabel("image"), "图片")
  assert.equal(fieldTypeLabel("image", "en"), "image")
  assert.equal(fieldTypeLabel("boolean", "en"), "yes or no")
})

test("known browser errors translate and unknown ones pass through", () => {
  assert.equal(localizeError("名字用 2 到 16 个字", "zh"), "名字用 2 到 16 个字")
  assert.equal(localizeError("名字用 2 到 16 个字", "en"), "Use 2 to 16 characters for the name")
  assert.equal(localizeError("产物已经交了，等模型打分", "en"), "The work is already in. Waiting for the model to score it.")
  assert.equal(localizeError("count 要填", "en"), "count is required")
  assert.equal(localizeError("count 要是整数", "en"), "count must be an integer")
  assert.equal(localizeError("输出里没有 extra", "en"), "The output has no extra")
  assert.equal(localizeError("输入 Schema要是 JSON Schema", "en"), "Input schema must be JSON Schema")
  assert.equal(localizeError("输出 Schema最多 2000 字", "en"), "Output schema can be at most 2000 characters")
  assert.equal(localizeError("某种新错误", "en"), "某种新错误")
})
