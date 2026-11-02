from a2human.phrases import phrase
from a2human.protocol import Client, describe_duty, flat_fields, image_part, summarize_roster, unique_tool_names


def system_prompt(entries: list[dict]) -> str:
    roster = summarize_roster(entries)
    return phrase("system.need") + phrase("system.wait") + phrase("system.score") + "\n" + roster


def _structured_tool(client: Client, entry: dict, name: str, fields: list[dict]):
    from pydantic import Field, create_model
    from langchain_core.tools import StructuredTool

    types = {"string": str, "integer": int, "number": float, "boolean": bool, "image": str}
    model_fields = {}
    for field in fields:
        description = field["description"] or (phrase("tool.image") if field["kind"] == "image" else "")
        annotation = types[field["kind"]]
        if field["required"]:
            model_fields[field["name"]] = (annotation, Field(description=description))
        else:
            model_fields[field["name"]] = (annotation | None, Field(default=None, description=description))
    if "task_id" not in model_fields:
        model_fields["task_id"] = (str | None, Field(default=None, description=phrase("tool.taskId")))
    if "score" not in model_fields:
        model_fields["score"] = (int | None, Field(default=None, description=phrase("tool.score")))
    args_model = create_model(f"Duty_{name}", **model_fields)

    def run(**kwargs) -> str:
        score = kwargs.pop("score", None)
        task_id = kwargs.pop("task_id", None)
        if score is not None or task_id:
            return client.dispatch(entry["url"], entry["skill_name"], task_id=task_id, score=score)
        data = {}
        images = []
        for field in fields:
            value = kwargs.get(field["name"])
            if value is None or value == "":
                continue
            if field["kind"] == "image":
                images.append(image_part(str(value)))
            else:
                data[field["name"]] = value
        return client.dispatch(entry["url"], entry["skill_name"], fields=data, images=images)

    return StructuredTool.from_function(func=run, name=name, description=describe_duty(entry), args_schema=args_model)


def duty_tools(client: Client, entries: list[dict] | None = None):
    from langchain_core.tools import StructuredTool

    roster = client.roster() if entries is None else entries
    tools = []
    for item in unique_tool_names(roster):
        entry = item["entry"]
        fields = flat_fields(entry.get("input_schema"))
        if fields:
            tools.append(_structured_tool(client, entry, item["name"], fields))
            continue

        def run(prompt: str = "", task_id: str | None = None, score: int | None = None, entry=entry) -> str:
            """Send the task to the person on duty and wait for the work."""
            if task_id is not None or score is not None:
                return client.dispatch(entry["url"], entry["skill_name"], task_id=task_id, score=score)
            return client.dispatch(entry["url"], entry["skill_name"], prompt)

        tools.append(StructuredTool.from_function(func=run, name=item["name"], description=describe_duty(entry)))
    return tools


def build_agent(directory: str, model, **client_options):
    from langchain.agents import create_agent

    client = Client(directory, **client_options)
    entries = client.roster()
    return create_agent(model, duty_tools(client, entries), system_prompt=system_prompt(entries))
