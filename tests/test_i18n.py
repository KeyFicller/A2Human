import json
from pathlib import Path

from a2human.copy import localize_error
from a2human.format import duration_phrase, duration_value, kind_label, record_line, score_value, status_label
from a2human.messages import en, zh
from a2human.schema_fields import describe_schema, field_type_label

ROOT = Path(__file__).resolve().parents[1]


def leaves(value, prefix=""):
    if isinstance(value, str):
        return [prefix]
    if not isinstance(value, dict):
        return [prefix]
    found = []
    for key, child in value.items():
        found.extend(leaves(child, f"{prefix}.{key}" if prefix else key))
    return found


def paths(value, prefix=""):
    if isinstance(value, str) or callable(value):
        return [prefix]
    if not isinstance(value, dict):
        return [prefix]
    found = []
    for key, child in value.items():
        found.extend(paths(child, f"{prefix}.{key}" if prefix else key))
    return found


def touch(value):
    if callable(value):
        value("Label", "body")
    elif isinstance(value, dict):
        for child in value.values():
            touch(child)


def source_files(directory: Path):
    skip = {"locales", "node_modules", ".next", "__pycache__", "tests"}
    found = []
    for path in directory.rglob("*"):
        if any(part in skip for part in path.parts):
            continue
        if path.suffix in {".ts", ".tsx", ".py"} and not path.name.endswith(".test.ts"):
            found.append(path)
    return found


def test_english_covers_every_simplified_chinese_ui_string():
    assert paths(en) == paths(zh)
    touch(zh)
    touch(en)
    pairs = [
        ("src/locales/zh.json", "src/locales/en.json"),
        ("src/locales/wire.zh.json", "src/locales/wire.en.json"),
    ]
    for left, right in pairs:
        assert leaves(json.loads((ROOT / right).read_text(encoding="utf-8"))) == leaves(json.loads((ROOT / left).read_text(encoding="utf-8")))


def test_production_source_keeps_copy_in_resource_files():
    files = source_files(ROOT / "src") + source_files(ROOT / "a2human")
    hits = [str(path.relative_to(ROOT)) for path in files if any("\u4e00" <= char <= "\u9fff" for char in path.read_text(encoding="utf-8"))]
    assert hits == []


def test_record_line_stays_chinese_unless_a_locale_is_asked_for():
    assert record_line(0, None, None) == "完成 0 单 · 还没有得分 · 还没有耗时"
    assert record_line(3, 4.5, 120) == "完成 3 单 · 平均 4.5 分 · 平均 2 分钟"
    assert record_line(3, 4.5, 120, "en") == "Completed 3 · avg score 4.5 · avg 2 min"
    assert record_line(2, None, 45, "en") == "Completed 2 · no score yet · avg 45 sec"
    assert record_line(1, 5, 60, "en") == "Completed 1 · avg score 5 · avg 1 min"
    assert duration_phrase(7, "en") == "avg 7 sec"
    assert duration_phrase(5400, "en") == "avg 1.5 hr"
    assert duration_phrase(3600, "en") == "avg 1 hr"
    assert duration_phrase(86400, "en") == "avg 1 day"
    assert duration_phrase(172800, "en") == "avg 2 days"
    assert duration_value(7) == "7 秒"
    assert duration_value(7, "en") == "7 sec"
    assert duration_value(172800, "en") == "2 days"
    assert score_value(4.5) == "4.5"
    assert score_value(5) == "5"
    assert score_value(None) is None
    assert status_label("working") == "进行中"
    assert status_label("working", "en") == "In progress"
    assert status_label("input-required", "en") == "Needs input"
    assert kind_label("task.score") == "打分"
    assert kind_label("task.score", "en") == "Score"


def test_schema_phrases_can_be_english():
    schema = {"type": "object", "properties": {"scene": {"type": "string"}, "count": {"type": "integer"}}, "required": ["scene"]}
    assert describe_schema(schema) == "scene 文字，必填；count 整数"
    assert describe_schema(schema, "en") == "scene text, required; count integer"
    described = {"type": "object", "properties": {"画面": {"type": "string", "description": "画面里有什么"}}, "required": ["画面"]}
    assert describe_schema(described, "en") == "画面 text, required: 画面里有什么"
    assert field_type_label("image") == "图片"
    assert field_type_label("image", "en") == "image"
    assert field_type_label("boolean", "en") == "yes or no"


def test_known_browser_errors_translate_and_unknown_ones_pass_through():
    assert localize_error("名字用 2 到 16 个字", "zh") == "名字用 2 到 16 个字"
    assert localize_error("名字用 2 到 16 个字", "en") == "Use 2 to 16 characters for the name"
    assert localize_error("产物已经交了，等模型打分", "en") == "The work is already in. Waiting for the model to score it."
    assert localize_error("count 要填", "en") == "count is required"
    assert localize_error("answer 要填\n要交一张图片", "en") == "answer is required\nAn image is required"
    assert localize_error("count 要是整数", "en") == "count must be an integer"
    assert localize_error("输出里没有 extra", "en") == "The output has no extra"
    assert localize_error("输入 Schema要是 JSON Schema", "en") == "Input schema must be JSON Schema"
    assert localize_error("输出 Schema最多 2000 字", "en") == "Output schema can be at most 2000 characters"
    assert localize_error("某种新错误", "en") == "某种新错误"
