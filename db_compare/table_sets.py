"""Local storage for reusable, database-aware table selections."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from secrets import token_hex
from threading import Lock
from typing import Any

from .db.errors import DatabaseConfigurationError


_TABLE_SET_LOCK = Lock()
_TABLE_SET_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{6,80}$")
_CONTEXT_FIELDS = {
    "sqlserver": {"server", "port", "database", "schema"},
    "postgres": {"host", "port", "database", "schema"},
}


def list_table_sets(path: Path) -> list[dict[str, Any]]:
    with _TABLE_SET_LOCK:
        return _read_store(path)["table_sets"]


def save_table_set(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name", "")).strip()
    if not name or len(name) > 80:
        raise DatabaseConfigurationError(
            "Table selection name must contain 1 to 80 characters."
        )
    table_set_id = str(payload.get("id", "")).strip()
    if table_set_id and not _TABLE_SET_ID_PATTERN.fullmatch(table_set_id):
        raise DatabaseConfigurationError("The table selection identifier is invalid.")

    table_set = _sanitize_table_set(payload)
    if not table_set["selected_tables"]:
        raise DatabaseConfigurationError(
            "Select at least one table before saving a table selection."
        )
    table_set["id"] = table_set_id or f"table-set-{token_hex(5)}"
    table_set["name"] = name
    table_set["updated_at"] = datetime.now(timezone.utc).isoformat()

    with _TABLE_SET_LOCK:
        store = _read_store(path)
        table_sets = store["table_sets"]
        existing = next(
            (
                index
                for index, item in enumerate(table_sets)
                if item.get("id") == table_set["id"]
                or str(item.get("name", "")).casefold() == name.casefold()
            ),
            None,
        )
        if existing is None:
            if len(table_sets) >= 100:
                raise DatabaseConfigurationError(
                    "A maximum of 100 table selections can be saved."
                )
            table_sets.append(table_set)
        else:
            table_set["id"] = table_sets[existing]["id"]
            table_sets[existing] = table_set
        table_sets.sort(key=lambda item: str(item.get("name", "")).casefold())
        _write_store(path, store)
    return table_set


def delete_table_set(path: Path, table_set_id: str) -> None:
    if not _TABLE_SET_ID_PATTERN.fullmatch(str(table_set_id)):
        raise DatabaseConfigurationError("The table selection identifier is invalid.")
    with _TABLE_SET_LOCK:
        store = _read_store(path)
        remaining = [
            item for item in store["table_sets"] if item.get("id") != table_set_id
        ]
        if len(remaining) == len(store["table_sets"]):
            raise DatabaseConfigurationError("The saved table selection was not found.")
        store["table_sets"] = remaining
        _write_store(path, store)


def _sanitize_table_set(payload: dict[str, Any]) -> dict[str, Any]:
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    manual_keys = payload.get("manual_keys")
    return {
        "context": {
            database: _allowed_context_fields(context.get(database), fields)
            for database, fields in _CONTEXT_FIELDS.items()
        },
        "selected_tables": _safe_string_list(payload.get("selected_tables"), 10_000),
        "manual_keys": _safe_manual_keys(manual_keys),
    }


def _allowed_context_fields(value: Any, allowed: set[str]) -> dict[str, str]:
    source = value if isinstance(value, dict) else {}
    return {
        key: str(source.get(key, "")).strip()[:1_000]
        for key in allowed
    }


def _safe_string_list(value: Any, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in value[:limit]:
        safe = str(item).strip()[:256]
        if safe and safe not in seen:
            seen.add(safe)
            result.append(safe)
    return result


def _safe_manual_keys(value: Any) -> dict[str, list[str]]:
    if not isinstance(value, dict):
        return {}
    result = {}
    for table_id, keys in list(value.items())[:10_000]:
        safe_keys = _safe_string_list(keys, 20)
        if safe_keys:
            result[str(table_id)[:256]] = safe_keys
    return result


def _read_store(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"format_version": 1, "table_sets": []}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatabaseConfigurationError(
            "Saved table selections could not be read. Check config/table-sets.json."
        ) from exc
    table_sets = value.get("table_sets") if isinstance(value, dict) else None
    if not isinstance(table_sets, list):
        raise DatabaseConfigurationError(
            "Saved table selections use an unsupported format."
        )
    return {"format_version": 1, "table_sets": table_sets}


def _write_store(path: Path, store: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        temporary.write_text(
            json.dumps(store, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(path)
    except OSError as exc:
        raise DatabaseConfigurationError(
            "Saved table selections could not be written. Check the config folder."
        ) from exc
