import assert from "node:assert/strict"
import test from "node:test"
import { describeSchema, draftFromSchema, fieldsToSchema, schemaPayload, schemaToFields } from "./schema-fields"

test("plain fields become an object schema and read back", () => {
  const schema = fieldsToSchema([
    { name: " scene ", type: "string", required: true },
    { name: "count", type: "integer", required: false },
  ])
  assert.deepEqual(schema, {
    type: "object",
    properties: { scene: { type: "string" }, count: { type: "integer" } },
    required: ["scene"],
  })
  assert.deepEqual(schemaToFields(schema!), [
    { name: "scene", type: "string", required: true },
    { name: "count", type: "integer", required: false },
  ])
  assert.equal(describeSchema(schema!), "scene 文字，必填；count 整数")
})

test("a field can carry a description", () => {
  const schema = fieldsToSchema([{ name: "画面", type: "string", required: true, description: " 画面里有什么 " }])
  assert.deepEqual(schema?.properties, { 画面: { type: "string", description: "画面里有什么" } })
  assert.equal(schemaToFields(schema!)?.[0].description, "画面里有什么")
  assert.equal(describeSchema(schema!), "画面 文字，必填：画面里有什么")
  assert.equal(schemaToFields({ type: "object", properties: { n: { type: "string", description: "x".repeat(121) } } }), null)
})

test("an image field is a string with an image media type", () => {
  const schema = fieldsToSchema([{ name: "照片", type: "image", required: true }])
  assert.deepEqual(schema, {
    type: "object",
    properties: { 照片: { type: "string", contentMediaType: "image/*" } },
    required: ["照片"],
  })
  assert.deepEqual(schemaToFields(schema!), [{ name: "照片", type: "image", required: true }])
  assert.equal(describeSchema(schema!), "照片 图片，必填")
})

test("a schema that is not a list of simple fields stays as JSON", () => {
  const schema = { type: "integer" }
  const draft = draftFromSchema(schema)
  assert.equal(draft.mode, "json")
  assert.equal(schemaPayload(draft), JSON.stringify(schema, null, 2))
  assert.equal(schemaToFields({ type: "object", properties: { n: { type: "string", minLength: 1 } } }), null)
})
