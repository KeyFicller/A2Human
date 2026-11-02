import sys

from a2human.protocol import A2HumanError, Client, summarize_roster


def main() -> None:
    if len(sys.argv) != 2:
        print("用法：python -m a2human https://<入口>", file=sys.stderr)
        raise SystemExit(2)
    try:
        client = Client(sys.argv[1])
        print(client.directory)
        print(summarize_roster(client.roster()))
    except A2HumanError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
