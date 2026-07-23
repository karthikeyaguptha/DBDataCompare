from math import ceil
from secrets import token_urlsafe
from threading import Lock
from time import monotonic
from typing import Any

from flask import Blueprint, jsonify, render_template, request

from .db import (
    DatabaseConfigurationError,
    DatabaseConnectionError,
    load_table_names,
    test_database_connection,
)


web = Blueprint("web", __name__)

_TABLE_CATALOG_TTL_SECONDS = 30 * 60
_TABLE_CATALOG_LIMIT = 8
_TABLE_CATALOGS: dict[str, dict[str, Any]] = {}
_TABLE_CATALOG_LOCK = Lock()


@web.get("/")
def index():
    return render_template("index.html")


@web.get("/api/health")
def health():
    return jsonify(
        {
            "application": "DB Compare Studio",
            "status": "ready",
            "phase": "v0.3.2-table-filtering",
        }
    )


@web.post("/api/connections/test")
def test_connection():
    payload = _json_body()
    database_type = str(payload.get("database_type", ""))
    config = payload.get("connection")
    if not isinstance(config, dict):
        raise DatabaseConfigurationError("Connection details are required.")

    test_database_connection(database_type, config)
    name = "SQL Server" if database_type == "sqlserver" else "PostgreSQL"
    return jsonify({"status": "connected", "message": f"{name} connection succeeded."})


@web.post("/api/tables")
def tables():
    payload = _json_body()
    sqlserver_config = payload.get("sqlserver")
    postgres_config = payload.get("postgres")
    if not isinstance(sqlserver_config, dict) or not isinstance(postgres_config, dict):
        raise DatabaseConfigurationError("Both database connections are required.")

    try:
        page = max(1, int(payload.get("page", 1)))
        page_size = int(payload.get("page_size", 10))
    except (TypeError, ValueError) as exc:
        raise DatabaseConfigurationError("Page and page size must be valid numbers.") from exc
    if page_size not in {5, 10, 25, 50, 100}:
        raise DatabaseConfigurationError("Choose a supported page size.")

    catalog_token = str(payload.get("catalog_token", "")).strip()
    rows = _get_table_catalog(catalog_token) if catalog_token else None
    if rows is None:
        sql_names, pg_names = load_table_names(sqlserver_config, postgres_config)
        rows = _merge_table_names(sql_names, pg_names)
        catalog_token = _store_table_catalog(rows)

    search = str(payload.get("search", "")).strip().casefold()
    statuses = payload.get("statuses", ["available"])
    if not isinstance(statuses, list) or any(not isinstance(status, str) for status in statuses):
        raise DatabaseConfigurationError("Table status filters must be a list.")
    supported_statuses = {"available", "sql_only", "postgres_only"}
    status_filter = set(statuses)
    if not status_filter <= supported_statuses:
        raise DatabaseConfigurationError("Choose supported table status filters.")

    rows = [row for row in rows if row["status"] in status_filter]
    if search:
        rows = [
            row
            for row in rows
            if search in (row["sqlserver"] or "").casefold()
            or search in (row["postgres"] or "").casefold()
        ]

    total = len(rows)
    total_pages = max(1, ceil(total / page_size))
    page = min(page, total_pages)
    start = (page - 1) * page_size
    return jsonify(
        {
            "status": "ready",
            "catalog_token": catalog_token,
            "tables": rows[start : start + page_size],
            "matching_ids": [row["id"] for row in rows],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
            },
        }
    )


def _store_table_catalog(rows: list[dict[str, Any]]) -> str:
    now = monotonic()
    token = token_urlsafe(24)
    with _TABLE_CATALOG_LOCK:
        _remove_expired_catalogs(now)
        while len(_TABLE_CATALOGS) >= _TABLE_CATALOG_LIMIT:
            oldest_token = min(
                _TABLE_CATALOGS,
                key=lambda item: _TABLE_CATALOGS[item]["last_accessed"],
            )
            del _TABLE_CATALOGS[oldest_token]
        _TABLE_CATALOGS[token] = {
            "rows": rows,
            "last_accessed": now,
        }
    return token


def _get_table_catalog(token: str) -> list[dict[str, Any]] | None:
    now = monotonic()
    with _TABLE_CATALOG_LOCK:
        _remove_expired_catalogs(now)
        catalog = _TABLE_CATALOGS.get(token)
        if catalog is None:
            return None
        catalog["last_accessed"] = now
        return catalog["rows"]


def _remove_expired_catalogs(now: float) -> None:
    expired = [
        token
        for token, catalog in _TABLE_CATALOGS.items()
        if now - catalog["last_accessed"] > _TABLE_CATALOG_TTL_SECONDS
    ]
    for token in expired:
        del _TABLE_CATALOGS[token]


def _merge_table_names(sql_names: list[str], pg_names: list[str]) -> list[dict[str, Any]]:
    sql_lookup = {name.casefold(): name for name in sql_names}
    pg_lookup = {name.casefold(): name for name in pg_names}
    rows: list[dict[str, Any]] = []
    for key in sorted(set(sql_lookup) | set(pg_lookup)):
        sql_name = sql_lookup.get(key)
        pg_name = pg_lookup.get(key)
        if sql_name and pg_name:
            status = "available"
        elif sql_name:
            status = "sql_only"
        else:
            status = "postgres_only"
        rows.append(
            {
                "id": key,
                "sqlserver": sql_name,
                "postgres": pg_name,
                "status": status,
            }
        )
    return rows


def _json_body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise DatabaseConfigurationError("A valid JSON request is required.")
    return payload


@web.app_errorhandler(DatabaseConfigurationError)
def handle_configuration_error(error: DatabaseConfigurationError):
    return jsonify({"status": "error", "message": str(error)}), 400


@web.app_errorhandler(DatabaseConnectionError)
def handle_connection_error(error: DatabaseConnectionError):
    return jsonify({"status": "error", "message": str(error)}), 503


@web.app_errorhandler(500)
def handle_unexpected_error(_error):
    return (
        jsonify(
            {
                "status": "error",
                "message": "An unexpected local application error occurred. Check the execution log.",
            }
        ),
        500,
    )
