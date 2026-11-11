import assert from "node:assert/strict"
import { test } from "node:test"

import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  acceptIntegerDraft,
  controlSpec,
  imageFromDataUrl,
  parseFieldValue,
} from "./field-control.ts"

test("each field type maps to the matching try-it control", () => {
  assert.deepEqual(controlSpec("string", { name: "scene" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string", { name: "tone" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string", { name: "direction" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string", { name: "topic" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string", { name: "destination" }), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("string"), { kind: "text", inputMode: "text" })
  assert.deepEqual(controlSpec("integer"), { kind: "integer", step: 1, inputMode: "numeric" })
  assert.deepEqual(controlSpec("number"), { kind: "number", step: "any", inputMode: "decimal" })
  assert.deepEqual(controlSpec("boolean"), { kind: "boolean" })
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
  assert.deepEqual(parseFieldValue("boolean", "yes"), { state: "bad" })
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
