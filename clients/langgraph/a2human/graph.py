from a2human.protocol import Client, describe_duty, summarize_roster, unique_tool_names


def system_prompt(entries: list[dict]) -> str:
    roster = summarize_roster(entries)
    return (
        "需要人完成的步骤，调用对应的在岗技能，不要自己编造只有人才能看到的结果。"
        "每次调用都会等到对方交回产物。\n"
        f"{roster}"
    )


def duty_tools(client: Client, entries: list[dict] | None = None):
    from langchain_core.tools import StructuredTool

    roster = client.roster() if entries is None else entries
    tools = []
    for item in unique_tool_names(roster):
        entry = item["entry"]

        def run(prompt: str, entry=entry) -> str:
            """把这件事派给在岗的人，并等待产物。"""
            return client.dispatch(entry["url"], entry["skill_name"], prompt)

        tools.append(StructuredTool.from_function(func=run, name=item["name"], description=describe_duty(entry)))
    return tools


def build_agent(directory: str, model, **client_options):
    from langchain.agents import create_agent

    client = Client(directory, **client_options)
    entries = client.roster()
    return create_agent(model, duty_tools(client, entries), system_prompt=system_prompt(entries))
