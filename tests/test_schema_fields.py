import json

import pytest

from a2human.schema_fields import canonical_output, describe_schema, draft_from_schema, fields_to_schema, schema_payload, schema_to_fields


def test_plain_fields_become_an_object_schema_and_read_back():
    schema = fields_to_schema([
        {"name": " scene ", "type": "string", "required": True},
        {"name": "count", "type": "integer", "required": False},
    ])
    assert schema == {
        "type": "object",
        "properties": {"scene": {"type": "string"}, "count": {"type": "integer"}},
        "required": ["scene"],
    }
    assert schema_to_fields(schema) == [
        {"name": "scene", "type": "string", "required": True},
        {"name": "count", "type": "integer", "required": False},
    ]
    assert describe_schema(schema) == "scene 文字，必填；count 整数"


def test_a_field_can_carry_a_description():
    schema = fields_to_schema([{"name": "画面", "type": "string", "required": True, "description": " 画面里有什么 "}])
    assert schema["properties"] == {"画面": {"type": "string", "description": "画面里有什么"}}
    assert schema_to_fields(schema)[0]["description"] == "画面里有什么"
    assert describe_schema(schema) == "画面 文字，必填：画面里有什么"
    assert schema_to_fields({"type": "object", "properties": {"n": {"type": "string", "description": "x" * 121}}}) is None


def test_an_image_field_is_a_string_with_an_image_media_type():
    schema = fields_to_schema([{"name": "照片", "type": "image", "required": True}])
    assert schema == {
        "type": "object",
        "properties": {"照片": {"type": "string", "contentMediaType": "image/*"}},
        "required": ["照片"],
    }
    assert schema_to_fields(schema) == [{"name": "照片", "type": "image", "required": True}]
    assert describe_schema(schema) == "照片 图片，必填"


def test_a_schema_that_is_not_a_list_of_simple_fields_stays_as_json():
    schema = {"type": "integer"}
    draft = draft_from_schema(schema)
    assert draft["mode"] == "json"
    assert schema_payload(draft) == json.dumps(schema, indent=2)
    assert schema_to_fields({"type": "object", "properties": {"n": {"type": "string", "minLength": 1}}}) is None


def test_an_output_has_to_match_the_declared_schema():
    schema = {"type": "object", "required": ["count"], "properties": {"count": {"type": "integer"}}}
    assert canonical_output(schema, '{"count": 3}', False) == '{"count":3}'
    with pytest.raises(ValueError, match="自由文本"):
        canonical_output(schema, "三个", False)
    with pytest.raises(ValueError, match="整数"):
        canonical_output(schema, '{"count":"3"}', False)
    with pytest.raises(ValueError, match="没有 note"):
        canonical_output(schema, '{"count":3,"note":"多的"}', False)
    assert canonical_output({"type": "integer"}, "7", False) == "7"
    with pytest.raises(ValueError, match="自由文本"):
        canonical_output({"type": "integer"}, "七", False)
    assert canonical_output({"type": "object", "required": ["ok"], "properties": {"ok": {"type": "boolean"}}}, '{"ok":false}', False) == '{"ok":false}'
    image = fields_to_schema([{"name": "照片", "type": "image", "required": True}])
    assert canonical_output(image, "", True) == ""
    with pytest.raises(ValueError, match="图片"):
        canonical_output(image, "", False)
    with pytest.raises(ValueError, match="没有图片"):
        canonical_output(schema, '{"count":3}', True)
