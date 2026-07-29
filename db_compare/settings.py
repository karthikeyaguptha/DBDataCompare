"""Validated local application settings."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from threading import Lock
from typing import Any

from .db.errors import DatabaseConfigurationError


_SETTINGS_LOCK = Lock()
_DEFAULT_TYPE_MAPPINGS = [
    {"sqlserver": "bigint", "postgres": ["bigint"]},
    {"sqlserver": "int", "postgres": ["integer"]},
    {"sqlserver": "smallint", "postgres": ["smallint"]},
    {"sqlserver": "tinyint", "postgres": ["smallint"]},
    {"sqlserver": "bit", "postgres": ["boolean"]},
    {"sqlserver": "real", "postgres": ["real"]},
    {"sqlserver": "float", "postgres": ["double precision"]},
    {"sqlserver": "date", "postgres": ["date"]},
    {"sqlserver": "datetime", "postgres": ["timestamp without time zone"]},
    {"sqlserver": "datetime2", "postgres": ["timestamp without time zone"]},
    {"sqlserver": "smalldatetime", "postgres": ["timestamp without time zone"]},
    {"sqlserver": "datetimeoffset", "postgres": ["timestamp with time zone"]},
    {"sqlserver": "time", "postgres": ["time without time zone"]},
    {"sqlserver": "uniqueidentifier", "postgres": ["uuid"]},
    {"sqlserver": "binary", "postgres": ["bytea"]},
    {"sqlserver": "varbinary", "postgres": ["bytea"]},
    {"sqlserver": "image", "postgres": ["bytea"]},
    {"sqlserver": "timestamp", "postgres": ["bytea"]},
    {"sqlserver": "rowversion", "postgres": ["bytea"]},
    {"sqlserver": "text", "postgres": ["text"]},
    {"sqlserver": "ntext", "postgres": ["text"]},
    {"sqlserver": "xml", "postgres": ["xml"]},
]


def default_settings() -> dict[str, Any]:
    return {
        "format_version": 1,
        "notification_duration_seconds": 5,
        "datatype_mappings": deepcopy(_DEFAULT_TYPE_MAPPINGS),
    }


def load_settings(path: Path) -> dict[str, Any]:
    with _SETTINGS_LOCK:
        if not path.exists():
            return default_settings()
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise DatabaseConfigurationError(
                "Application settings could not be read. Check data/config/app-settings.json."
            ) from exc
        return _validate_settings(value)


def save_settings(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    settings = _validate_settings(payload)
    with _SETTINGS_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        try:
            temporary.write_text(
                json.dumps(settings, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            temporary.replace(path)
        except OSError as exc:
            raise DatabaseConfigurationError(
                "Application settings could not be written. Check the data/config folder."
            ) from exc
    return settings


def datatype_mapping_lookup(settings: dict[str, Any]) -> dict[str, set[str]]:
    return {
        item["sqlserver"]: set(item["postgres"])
        for item in settings["datatype_mappings"]
    }


def _validate_settings(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DatabaseConfigurationError("Application settings must be a JSON object.")
    try:
        duration = int(value.get("notification_duration_seconds", 5))
    except (TypeError, ValueError) as exc:
        raise DatabaseConfigurationError(
            "Notification duration must be a whole number from 1 to 30 seconds."
        ) from exc
    if duration < 1 or duration > 30:
        raise DatabaseConfigurationError(
            "Notification duration must be from 1 to 30 seconds."
        )

    mappings = value.get("datatype_mappings")
    if not isinstance(mappings, list) or len(mappings) > 200:
        raise DatabaseConfigurationError(
            "Datatype mappings must be a list containing at most 200 entries."
        )
    sanitized = []
    seen: set[str] = set()
    for item in mappings:
        if not isinstance(item, dict):
            raise DatabaseConfigurationError("Every datatype mapping must be an object.")
        sql_type = _safe_type_name(item.get("sqlserver"), "SQL Server")
        postgres_types = item.get("postgres")
        if (
            not isinstance(postgres_types, list)
            or not postgres_types
            or len(postgres_types) > 20
        ):
            raise DatabaseConfigurationError(
                f'Add at least one PostgreSQL type for SQL Server type "{sql_type}".'
            )
        if sql_type in seen:
            raise DatabaseConfigurationError(
                f'SQL Server datatype "{sql_type}" is configured more than once.'
            )
        seen.add(sql_type)
        normalized_pg = []
        for postgres_type in postgres_types:
            safe_type = _safe_type_name(postgres_type, "PostgreSQL")
            if safe_type not in normalized_pg:
                normalized_pg.append(safe_type)
        sanitized.append({"sqlserver": sql_type, "postgres": normalized_pg})
    sanitized.sort(key=lambda item: item["sqlserver"])
    return {
        "format_version": 1,
        "notification_duration_seconds": duration,
        "datatype_mappings": sanitized,
    }


def _safe_type_name(value: Any, database_name: str) -> str:
    text = " ".join(str(value or "").strip().casefold().split())
    if not text or len(text) > 80:
        raise DatabaseConfigurationError(
            f"{database_name} datatype names must contain 1 to 80 characters."
        )
    if any(character not in "abcdefghijklmnopqrstuvwxyz0123456789_ " for character in text):
        raise DatabaseConfigurationError(
            f'{database_name} datatype "{text}" contains unsupported characters.'
        )
    return text
