"""Skill field lists and the check that a delivered artifact matches its schema.

The browser edits a simple field list. The server stores JSON Schema and, when
someone submits work, ``canonical_output`` is the only shape that is kept.
"""

from __future__ import annotations

import json
import math
from typing import Any

from a2human.copy import phrase, wire
from a2human.jsonutil import dumps, loads

FIELD_TYPES = ("string", "integer", "number", "boolean", "image")
ENUM_MAX = 20
ENUM_ITEM_MAX = 80
IMAGE_MODES = ("image/png", "image/jpeg", "image/webp", "image/gif")
SCHEMA_KEYS = {
    "type",
    "properties",
    "required",
    "additionalProperties",
    "items",
    "enum",
    "description",
    "contentMediaType",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
}
VALUE_TYPES = {"string", "integer", "number", "boolean"}
MUST_TYPES = {"string", "integer", "number", "boolean", "object", "array"}
VALUE_SHAPE_KEYS = {"type", "description", "minimum", "maximum", "minLength", "maxLength", "enum"}

JsonSchema = dict[str, Any]


def field_type_label(kind: str, locale: str = "zh") -> str:
    return phrase(f"schema.types.{kind}", None, locale)


def _read_description(record: dict[str, Any]) -> str | None:
    """A description, None when it should be omitted, or the sentinel ``False`` when it is illegal."""
    if "description" not in record:
        return None
    if not isinstance(record["description"], str):
        return False  # type: ignore[return-value]
    text = record["description"].strip()
    if len(text) > 120:
        return False  # type: ignore[return-value]
    return text or None


def enum_values(kind: str, value: object) -> list | None:
    """Allowed values, ``[]`` when the field has no enum, or None when this enum cannot be a field list."""
    if value is None:
        return []
    if not isinstance(value, list) or not value or len(value) > ENUM_MAX:
        return None
    found: list = []
    for item in value:
        if kind == "string":
            if not isinstance(item, str) or not item or len(item) > ENUM_ITEM_MAX:
                return None
            token: object = item
        elif kind == "integer":
            if isinstance(item, bool) or not isinstance(item, int):
                return None
            token = item
        elif kind == "number":
            if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item):
                return None
            token = item
        else:
            return None
        if token in found:
            return None
        found.append(token)
    return found


def _example_text(value: object) -> str | None:
    text = str(value or "").strip()
    if not text or len(text) > 120:
        return None
    return text


def _property_schema(field: dict[str, Any]) -> JsonSchema:
    description = (field.get("description") or "").strip()
    example = "" if field.get("type") == "image" else (_example_text(field.get("example")) or "")
    base: JsonSchema = (
        {"type": "string", "contentMediaType": "image/*"} if field["type"] == "image" else {"type": field["type"]}
    )
    kind = field.get("type")
    if kind in {"string", "integer", "number"} and field.get("enum") is not None:
        choices = enum_values(str(kind), field.get("enum"))
        if choices:
            base = {**base, "enum": choices}
    if example:
        base = {**base, "examples": [example]}
    if not description:
        return base
    return {**base, "description": description[:120]}


def _read_example(record: dict[str, Any]) -> str | None | bool:
    if "examples" not in record:
        return None
    value = record.get("examples")
    if not isinstance(value, list) or len(value) != 1 or not isinstance(value[0], str):
        return False
    text = value[0].strip()
    if not text or len(text) > 120:
        return False
    return text


def fields_to_schema(fields: list[dict[str, Any]]) -> JsonSchema | None:
    named = [field for field in fields if str(field.get("name", "")).strip()]
    if not named:
        return None
    properties: dict[str, JsonSchema] = {}
    required: list[str] = []
    for field in named:
        name = str(field["name"]).strip()
        properties[name] = _property_schema({**field, "name": name})
        if field.get("required"):
            required.append(name)
    if required:
        return {"type": "object", "properties": properties, "required": required}
    return {"type": "object", "properties": properties}


def schema_to_fields(schema: JsonSchema | None) -> list[dict[str, Any]] | None:
    if not schema or schema.get("type") != "object":
        return None
    allowed = {"type", "properties", "required"}
    if any(key not in allowed for key in schema):
        return None
    properties = schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        return None
    if schema.get("required") is not None and not isinstance(schema.get("required"), list):
        return None
    required = {item for item in schema.get("required") or [] if isinstance(item, str)}
    fields: list[dict[str, Any]] = []
    for name, value in properties.items():
        if not isinstance(value, dict):
            return None
        keys = list(value)
        description = _read_description(value)
        if description is False:
            return None
        described = {"description": description} if description else {}
        if value.get("type") == "string" and "contentMediaType" in value:
            if any(key not in {"type", "contentMediaType", "description"} for key in keys):
                return None
            media = value.get("contentMediaType")
            if not isinstance(media, str) or not media.startswith("image/"):
                return None
            fields.append({"name": name, "type": "image", "required": name in required, **described})
            continue
        example = _read_example(value)
        if example is False:
            return None
        exemplified = {"example": example} if example else {}
        if any(key not in {"type", "description", "enum", "examples"} for key in keys):
            return None
        kind = value.get("type")
        if kind not in FIELD_TYPES or kind == "image":
            return None
        if kind == "boolean":
            if "enum" in value:
                return None
            fields.append({"name": name, "type": kind, "required": name in required, **described, **exemplified})
            continue
        choices = enum_values(kind, value.get("enum") if "enum" in value else None)
        if choices is None:
            return None
        listed = {"enum": choices} if choices else {}
        fields.append({"name": name, "type": kind, "required": name in required, **described, **exemplified, **listed})
    return fields


def empty_schema_draft() -> dict[str, Any]:
    return {"mode": "fields", "fields": [], "json": ""}


def draft_from_schema(schema: JsonSchema | None) -> dict[str, Any]:
    if not schema:
        return empty_schema_draft()
    text = json.dumps(schema, ensure_ascii=False, indent=2)
    fields = schema_to_fields(schema)
    if fields is None:
        return {"mode": "json", "fields": [], "json": text}
    return {"mode": "fields", "fields": fields, "json": text}


def schema_payload(draft: dict[str, Any]) -> str:
    if draft.get("mode") == "json":
        return str(draft.get("json") or "").strip()
    schema = fields_to_schema(list(draft.get("fields") or []))
    return dumps(schema) if schema else ""


def duplicate_field_name(fields: list[dict[str, Any]]) -> bool:
    names = [str(field.get("name", "")).strip() for field in fields if str(field.get("name", "")).strip()]
    return len(set(names)) != len(names)


def _schema_mentions_image(value: object) -> bool:
    if isinstance(value, list):
        return any(_schema_mentions_image(item) for item in value)
    if not isinstance(value, dict):
        return False
    media = value.get("contentMediaType")
    if isinstance(media, str) and media.startswith("image/"):
        return True
    return any(_schema_mentions_image(item) for item in value.values())


def schema_requires_image(schema: JsonSchema | None) -> bool:
    if not schema:
        return False
    fields = schema_to_fields(schema)
    return bool(fields and any(field["type"] == "image" and field["required"] for field in fields))


def contract_modes(schema: JsonSchema | None) -> list[str] | None:
    """Modes advertised on an agent card for one skill schema."""
    if not schema:
        return None
    fields = schema_to_fields(schema)
    images = any(field["type"] == "image" for field in fields) if fields is not None else _schema_mentions_image(schema)
    data = any(field["type"] != "image" for field in fields) if fields is not None else True
    modes: list[str] = []
    if data:
        modes.append("application/json")
    if images:
        modes.extend(IMAGE_MODES)
    return modes or ["application/json"]


def describe_schema(schema: JsonSchema, locale: str = "zh") -> str:
    fields = schema_to_fields(schema)
    if fields is None:
        return dumps(schema)
    labels = {kind: field_type_label(kind, locale) for kind in FIELD_TYPES}
    required = phrase("schema.requiredMark", None, locale)
    optional = phrase("schema.optionalMark", None, locale)
    joiner = phrase("schema.join", None, locale)
    colon = phrase("schema.colon", None, locale)
    parts = []
    for field in fields:
        enum_mark = ""
        if field.get("enum"):
            values = phrase("schema.enumJoin", None, locale).join(str(item) for item in field["enum"])
            enum_mark = phrase("schema.enumMark", {"values": values}, locale)
        if field["required"]:
            mark = required
        elif field["type"] == "image":
            mark = optional
        else:
            mark = ""
        head = f"{field['name']} {labels[field['type']]}{mark}{enum_mark}"
        parts.append(f"{head}{colon}{field['description']}" if field.get("description") else head)
    return joiner.join(parts)


def _is_image_schema(schema: JsonSchema) -> bool:
    media = schema.get("contentMediaType")
    return schema.get("type") == "string" and isinstance(media, str) and media.startswith("image/")


def output_shape(schema: JsonSchema) -> dict[str, Any]:
    fields = schema_to_fields(schema)
    if fields is not None:
        return {"kind": "fields", "fields": fields}
    if _is_image_schema(schema):
        return {"kind": "image"}
    kind = schema.get("type")
    if isinstance(kind, str) and kind in VALUE_TYPES and all(key in VALUE_SHAPE_KEYS for key in schema):
        return {"kind": "value", "type": kind}
    return {"kind": "json"}


def _value_matches_type(kind: str, value: object) -> bool:
    if kind == "string":
        return isinstance(value, str)
    if kind == "boolean":
        return isinstance(value, bool)
    if kind == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and _finite(value)
    if kind == "array":
        return isinstance(value, list)
    if kind == "object":
        return isinstance(value, dict)
    return False


def _finite(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and __import__("math").isfinite(value)


def _must_be(kind: str, label: str) -> str:
    if kind in MUST_TYPES:
        return wire(f"must.{kind}", {"label": label})
    return wire("must.raw", {"label": label, "type": kind})


def _same_enum(item: object, value: object) -> bool:
    if item is value:
        return True
    try:
        return dumps(item) == dumps(value)
    except (TypeError, ValueError):
        return False


def _check_value(schema: JsonSchema, value: object, label: str) -> None:
    if any(key not in SCHEMA_KEYS for key in schema):
        raise ValueError(wire("output.misaligned"))
    if schema.get("type") is None and schema.get("properties") is None and schema.get("enum") is None:
        raise ValueError(wire("output.misaligned"))
    if isinstance(schema.get("enum"), list):
        if not any(_same_enum(item, value) for item in schema["enum"]):
            raise ValueError(wire("must.enum", {"label": label}))
    kind = schema.get("type")
    if isinstance(kind, str) and not _value_matches_type(kind, value):
        raise ValueError(_must_be(kind, label))
    if kind == "string" and isinstance(value, str):
        length = len(value)
        if isinstance(schema.get("minLength"), (int, float)) and not isinstance(schema.get("minLength"), bool):
            if length < schema["minLength"]:
                raise ValueError(wire("must.short", {"label": label}))
        if isinstance(schema.get("maxLength"), (int, float)) and not isinstance(schema.get("maxLength"), bool):
            if length > schema["maxLength"]:
                raise ValueError(wire("must.long", {"label": label}))
        media = schema.get("contentMediaType")
        if isinstance(media, str) and media.startswith("image/"):
            image = value.startswith("http://") or value.startswith("https://") or value.startswith("data:image/") and _data_image(value)
            if not image:
                raise ValueError(wire("must.image", {"label": label}))
    if kind in {"integer", "number"} and isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(schema.get("minimum"), (int, float)) and not isinstance(schema.get("minimum"), bool) and value < schema["minimum"]:
            raise ValueError(wire("must.small", {"label": label}))
        if isinstance(schema.get("maximum"), (int, float)) and not isinstance(schema.get("maximum"), bool) and value > schema["maximum"]:
            raise ValueError(wire("must.large", {"label": label}))
    if kind == "array" and isinstance(value, list):
        if isinstance(schema.get("minItems"), (int, float)) and not isinstance(schema.get("minItems"), bool) and len(value) < schema["minItems"]:
            raise ValueError(wire("must.few", {"label": label}))
        if isinstance(schema.get("maxItems"), (int, float)) and not isinstance(schema.get("maxItems"), bool) and len(value) > schema["maxItems"]:
            raise ValueError(wire("must.many", {"label": label}))
        items = schema.get("items")
        if isinstance(items, dict):
            for index, item in enumerate(value):
                _check_value(items, item, f"{label}[{index}]")
    if (kind == "object" or schema.get("properties") is not None) and isinstance(value, dict):
        properties = schema.get("properties")
        props: dict[str, JsonSchema] = properties if isinstance(properties, dict) else {}
        required = [item for item in schema.get("required") or [] if isinstance(item, str)] if isinstance(schema.get("required"), list) else []
        for name in required:
            if value.get(name) is None:
                raise ValueError(wire("field.required", {"name": name}))
        extra = schema.get("additionalProperties")
        for key, item in value.items():
            prop = props.get(key)
            if prop is not None:
                _check_value(prop, item, key)
            elif isinstance(extra, dict):
                _check_value(extra, item, key)
            elif extra is not True:
                raise ValueError(wire("output.missing", {"key": key}))


def _data_image(value: str) -> bool:
    return value.startswith("data:image/png;base64,") or value.startswith("data:image/jpeg;base64,") or value.startswith("data:image/webp;base64,") or value.startswith("data:image/gif;base64,")


def _blank_delivery_text(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return True
    try:
        parsed = loads(trimmed)
    except json.JSONDecodeError:
        return False
    return isinstance(parsed, dict) and not parsed


def _field_label(field: dict[str, Any]) -> str:
    description = field.get("description")
    if isinstance(description, str) and description.strip():
        return description.strip()
    return str(field["name"])


def _canonical_fields(fields: list[dict[str, Any]], text: str, has_image: bool) -> str:
    images = [field for field in fields if field["type"] == "image"]
    if len(images) > 1:
        raise ValueError(wire("output.oneImage"))
    image = images[0] if images else None
    if image is None and has_image:
        raise ValueError(wire("output.noImage"))
    data_fields = [field for field in fields if field["type"] != "image"]
    missing: list[str] = []
    if image and image.get("required") and not has_image:
        missing.append(wire("output.needImage"))
    if not data_fields:
        if not _blank_delivery_text(text):
            raise ValueError(wire("output.imageOnly"))
        if missing:
            raise ValueError("\n".join(missing))
        return ""
    parsed: object = {}
    if not _blank_delivery_text(text):
        try:
            parsed = loads(text)
        except json.JSONDecodeError as error:
            raise ValueError(wire("output.fieldsNotText")) from error
    if not isinstance(parsed, dict):
        raise ValueError(wire("output.fields"))
    out: dict[str, Any] = {}
    for field in data_fields:
        value = parsed.get(field["name"])
        if value is None or value == "":
            if field.get("required"):
                missing.append(wire("field.required", {"name": _field_label(field)}))
            continue
        check: JsonSchema = {"type": field["type"]}
        if field.get("enum"):
            check["enum"] = field["enum"]
        _check_value(check, value, _field_label(field))
        out[field["name"]] = value
    if missing:
        raise ValueError("\n".join(missing))
    image_name = image["name"] if image else None
    for key in parsed:
        if image_name and key == image_name:
            continue
        if not any(field["name"] == key for field in data_fields):
            raise ValueError(wire("output.missing", {"key": key}))
    return dumps(out)


def canonical_output(schema: JsonSchema, text: str, has_image: bool) -> str:
    """Return the stored artifact text, or raise ValueError when it does not match."""
    fields = schema_to_fields(schema)
    if fields is not None:
        return _canonical_fields(fields, text, has_image)
    if _is_image_schema(schema):
        if not has_image:
            raise ValueError(wire("output.needImage"))
        if text.strip():
            raise ValueError(wire("output.imageOnly"))
        return ""
    if has_image:
        raise ValueError(wire("output.noImage"))
    trimmed = text.strip()
    if not trimmed:
        raise ValueError(wire("output.schemaRequired"))
    try:
        parsed = loads(trimmed)
    except json.JSONDecodeError as error:
        raise ValueError(wire("output.jsonNotText")) from error
    _check_value(schema, parsed, wire("output.whole"))
    return dumps(parsed)
