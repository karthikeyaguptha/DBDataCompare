from math import ceil
from typing import Any

from flask import Blueprint, jsonify, render_template, request

from .db import (
    DatabaseConfigurationError,
    DatabaseConnectionError,
    load_table_names,
    test_database_connection,
)


web = Blueprint("web", __name__)


@web.get("/")
def index():
    return render_template("index.html")


@web.get("/api/health")
def health():
    return jsonify(
        {
            "application": "DB Compare Studio",
            "status": "ready",
            "phase": "v0.3.1-connectivity-diagnostics",
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

    search = str(payload.get("search", "")).strip().casefold()
    sql_names, pg_names = load_table_names(sqlserver_config, postgres_config)
    rows = _merge_table_names(sql_names, pg_names)
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
            "tables": rows[start : start + page_size],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
            },
        }
    )


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
