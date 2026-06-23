from __future__ import annotations

from contextvars import ContextVar, Token

_campus_code: ContextVar[str | None] = ContextVar("campus_code", default=None)


def get_current_campus_code() -> str | None:
    return _campus_code.get()


def activate_campus_tenant(campus_code: str) -> Token[str | None]:
    return _campus_code.set(campus_code.strip().upper())


def reset_campus_tenant(token: Token[str | None] | None) -> None:
    if token is not None:
        _campus_code.reset(token)


def normalize_campus_database_alias(campus_code: str) -> str:
    return f"campus_{campus_code.strip().lower().replace('-', '_')}"
