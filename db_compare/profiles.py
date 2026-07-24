"""Password-free local comparison profile storage."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from secrets import token_hex
from threading import Lock
from typing import Any

from .db.errors import DatabaseConfigurationError


_PROFILE_LOCK = Lock()
_PROFILE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{6,80}$")
_ALLOWED_SQL_FIELDS = {
    "server",
    "port",
    "database",
    "schema",
    "authentication",
    "username",
    "driver",
    "trust_server_certificate",
}
_ALLOWED_PG_FIELDS = {
    "host",
    "port",
    "database",
    "schema",
    "username",
    "sslmode",
}


def list_profiles(path: Path) -> list[dict[str, Any]]:
    with _PROFILE_LOCK:
        return _read_store(path)["profiles"]


def save_profile(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name", "")).strip()
    if not name or len(name) > 80:
        raise DatabaseConfigurationError("Profile name must contain 1 to 80 characters.")
    profile_id = str(payload.get("id", "")).strip()
    if profile_id and not _PROFILE_ID_PATTERN.fullmatch(profile_id):
        raise DatabaseConfigurationError("The saved profile identifier is invalid.")
    profile = _sanitize_profile(payload)
    profile["id"] = profile_id or f"profile-{token_hex(5)}"
    profile["name"] = name
    profile["updated_at"] = datetime.now(timezone.utc).isoformat()

    with _PROFILE_LOCK:
        store = _read_store(path)
        profiles = store["profiles"]
        existing = next(
            (
                index
                for index, item in enumerate(profiles)
                if item.get("id") == profile["id"]
                or str(item.get("name", "")).casefold() == name.casefold()
            ),
            None,
        )
        if existing is None:
            if len(profiles) >= 100:
                raise DatabaseConfigurationError("A maximum of 100 profiles can be saved.")
            profiles.append(profile)
        else:
            profile["id"] = profiles[existing]["id"]
            profiles[existing] = profile
        profiles.sort(key=lambda item: str(item.get("name", "")).casefold())
        _write_store(path, store)
    return profile


def delete_profile(path: Path, profile_id: str) -> None:
    if not _PROFILE_ID_PATTERN.fullmatch(str(profile_id)):
        raise DatabaseConfigurationError("The saved profile identifier is invalid.")
    with _PROFILE_LOCK:
        store = _read_store(path)
        remaining = [item for item in store["profiles"] if item.get("id") != profile_id]
        if len(remaining) == len(store["profiles"]):
            raise DatabaseConfigurationError("The saved profile was not found.")
        store["profiles"] = remaining
        _write_store(path, store)


def _sanitize_profile(payload: dict[str, Any]) -> dict[str, Any]:
    sqlserver = payload.get("sqlserver") if isinstance(payload.get("sqlserver"), dict) else {}
    postgres = payload.get("postgres") if isinstance(payload.get("postgres"), dict) else {}
    selected_tables = payload.get("selected_tables")
    manual_keys = payload.get("manual_keys")
    statuses = payload.get("statuses")
    options = payload.get("options") if isinstance(payload.get("options"), dict) else {}
    return {
        "sqlserver": _allowed_fields(sqlserver, _ALLOWED_SQL_FIELDS),
        "postgres": _allowed_fields(postgres, _ALLOWED_PG_FIELDS),
        "selected_tables": _safe_string_list(selected_tables, 10_000),
        "manual_keys": _safe_manual_keys(manual_keys),
        "statuses": [
            item
            for item in _safe_string_list(statuses, 3)
            if item in {"available", "sql_only", "postgres_only"}
        ] or ["available"],
        "comparison_mode": (
            payload.get("comparison_mode")
            if payload.get("comparison_mode") in {"full", "schema_and_counts", "schema_only"}
            else "full"
        ),
        "batch_size": (
            int(payload.get("batch_size"))
            if str(payload.get("batch_size")) in {"2000", "5000", "10000"}
            else 5000
        ),
        "options": {
            "ignore_trailing_spaces": bool(options.get("ignore_trailing_spaces")),
            "case_sensitive": bool(options.get("case_sensitive", True)),
            "decimal_tolerance": str(options.get("decimal_tolerance", "0"))[:40],
            "timestamp_tolerance_ms": str(options.get("timestamp_tolerance_ms", "0"))[:40],
        },
    }


def _allowed_fields(source: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
    result = {}
    for key in allowed:
        if key not in source:
            continue
        value = source[key]
        result[key] = bool(value) if key == "trust_server_certificate" else str(value)[:1_000]
    return result


def _safe_string_list(value: Any, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item)[:256] for item in value[:limit] if str(item).strip()]


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
        return {"format_version": 1, "profiles": []}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DatabaseConfigurationError(
            "Saved profiles could not be read. Check config/profiles.json."
        ) from exc
    profiles = value.get("profiles") if isinstance(value, dict) else None
    if not isinstance(profiles, list):
        raise DatabaseConfigurationError("Saved profiles use an unsupported format.")
    return {"format_version": 1, "profiles": profiles}


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
            "Saved profiles could not be written. Check the config folder."
        ) from exc
