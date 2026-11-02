"""Optional commit hook used by tests that mutate a dict and expect Postgres to match.

Production writes go through ``update_store`` and do not set this hook, so the
market rules stay free of connection code.
"""

from __future__ import annotations


def remember(store: dict) -> None:
    hook = store.get("_flush") if isinstance(store, dict) else None
    if callable(hook):
        hook()
