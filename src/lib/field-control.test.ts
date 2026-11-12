import assert from "node:assert/strict"
import { test } from "node:test"

import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  acceptIntegerDraft,
  audioFromDataUrl,
  controlSpec,
  imageFromDataUrl,
  parseEnumText,
  parseFieldValue,
} from "./field-control.ts"

test("each field type maps to the matching control", () => {
  assert.deepEqual(controlSpec("string", { name: "scene" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string", { name: "tone" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string", { name: "direction" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string", { name: "topic" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string", { name: "destination" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string"), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("integer"), { kind: "integer", step: 1, inputMode: "numeric" })
  assert.deepEqual(controlSpec("number"), { kind: "number", step: "any", inputMode: "decimal" })
  assert.deepEqual(controlSpec("boolean"), { kind: "boolean", widget: "checkbox" })
  assert.deepEqual(controlSpec("boolean", { enum: ["yes", "no"] }), { kind: "boolean", widget: "checkbox" })
  assert.deepEqual(controlSpec("image"), { kind: "image", accept: IMAGE_ACCEPT, maxBytes: IMAGE_MAX_BYTES })
  assert.equal(IMAGE_ACCEPT, "image/png,image/jpeg,image/webp,image/gif")
  assert.equal(IMAGE_MAX_BYTES, 1_000_000)
})

test("a passage-shaped string uses a textarea", () => {
  for (const name of ["text", "summary", "ideas", "suggestion", "answer", "sources", "feedback", "reply", "plan", "material", "request", "message", "question", "Text"]) {
    assert.equal(controlSpec("string", { name }).kind, "textarea", name)
  }
  assert.equal(controlSpec("string", { name: "画面" }).kind, "textarea")
  assert.equal(controlSpec("string", { name: "tone", longString: true }).kind, "textarea")
})

test("an integer draft stays on whole numbers", () => {
  assert.equal(acceptIntegerDraft(""), true)
  assert.equal(acceptIntegerDraft("-"), true)
  assert.equal(acceptIntegerDraft("0"), true)
  assert.equal(acceptIntegerDraft("-12"), true)
  assert.equal(acceptIntegerDraft("1.5"), false)
  assert.equal(acceptIntegerDraft("1e2"), false)
  assert.equal(acceptIntegerDraft("abc"), false)
})

test("an enum is a radio group until it is longer than five, then a select", () => {
  const short = ["zh", "en", "ja", "ko", "fr"]
  assert.deepEqual(controlSpec("string", { name: "direction", enum: short }), { kind: "enum", widget: "radio", options: short })
  const long = ["zh", "en", "ja", "ko", "fr", "de"]
  assert.equal(controlSpec("string", { enum: long }).kind, "enum")
  assert.equal(controlSpec("integer", { enum: long.map((_, index) => index) }).widget, "select")
  assert.equal(controlSpec("number", { enum: [1.5, 2] }).widget, "radio")
  assert.equal(controlSpec("image", { enum: ["png", "gif"] }).kind, "image")
})

test("allowed values can be written with commas or new lines and have to match the type", () => {
  assert.deepEqual(parseEnumText("zh, en\nja", "string"), { ok: true, values: ["zh", "en", "ja"] })
  assert.deepEqual(parseEnumText("1, 1, 2", "integer"), { ok: true, values: [1, 2] })
  assert.deepEqual(parseEnumText("1.5\n2", "number"), { ok: true, values: [1.5, 2] })
  assert.deepEqual(parseEnumText("  ", "string"), { ok: true, values: [] })
  assert.equal(parseEnumText("1.5", "integer").ok, false)
  assert.equal(parseEnumText("a, b", "number").ok, false)
  assert.equal(parseEnumText(Array.from({ length: 21 }, (_, index) => `v${index}`).join(","), "string").ok, false)
})

test("a filled value is parsed the way the delivery form submits it", () => {
  assert.deepEqual(parseFieldValue("string", "  "), { state: "empty" })
  assert.deepEqual(parseFieldValue("string", " hello "), { state: "value", value: "hello" })
  assert.deepEqual(parseFieldValue("integer", "3"), { state: "value", value: 3 })
  assert.deepEqual(parseFieldValue("integer", "3.5"), { state: "bad" })
  assert.deepEqual(parseFieldValue("integer", "1.0"), { state: "bad" })
  assert.deepEqual(parseFieldValue("number", "1.5"), { state: "value", value: 1.5 })
  assert.deepEqual(parseFieldValue("number", "nope"), { state: "bad" })
  assert.deepEqual(parseFieldValue("boolean", "true"), { state: "value", value: true })
  assert.deepEqual(parseFieldValue("boolean", "false"), { state: "value", value: false })
  assert.deepEqual(parseFieldValue("boolean", ""), { state: "value", value: false })
  assert.deepEqual(parseFieldValue("string", "en", ["zh", "en"]), { state: "value", value: "en" })
  assert.deepEqual(parseFieldValue("string", "fr", ["zh", "en"]), { state: "bad" })
  assert.deepEqual(parseFieldValue("integer", "2", [1, 2]), { state: "value", value: 2 })
})

test("an image preview only accepts the existing picture types and size", () => {
  const png = "data:image/png;base64,aGVs bG8="
  assert.deepEqual(imageFromDataUrl(png, "a.png", 12), {
    image: { mediaType: "image/png", raw: "aGVsbG8=", filename: "a.png" },
  })
  assert.deepEqual(imageFromDataUrl("data:image/svg+xml;base64,aGVsbG8=", "a.svg", 12), { error: "type" })
  assert.deepEqual(imageFromDataUrl("data:text/plain;base64,aGVsbG8=", "a.txt", 12), { error: "type" })
  assert.deepEqual(imageFromDataUrl(png, "a.png", 1_000_001), { error: "tooBig" })
})

test("an audio clip accepts webm, wav, and mpeg, including a codec parameter", () => {
  assert.deepEqual(audioFromDataUrl("data:audio/webm;codecs=opus;base64,abc=", "take.webm", 12), {
    audio: { mediaType: "audio/webm", raw: "abc=", filename: "take.webm" },
  })
  assert.deepEqual(audioFromDataUrl("data:audio/wav;base64,abc=", "take.wav", 12).audio?.mediaType, "audio/wav")
  assert.deepEqual(audioFromDataUrl("data:audio/mpeg;base64,abc=", "take.mp3", 12).audio?.mediaType, "audio/mpeg")
  assert.deepEqual(audioFromDataUrl("data:audio/mp3;base64,abc=", "take.mp3", 12).audio?.mediaType, "audio/mpeg")
  assert.deepEqual(audioFromDataUrl("data:audio/ogg;base64,abc=", "take.ogg", 12), { error: "type" })
  assert.equal(controlSpec("audio").kind, "audio")
})
