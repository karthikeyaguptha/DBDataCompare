"""Exact row-count comparison for one mapped table."""

from __future__ import annotations

from typing import Any, Callable

from ..db import postgres, sqlserver


def compare_table_row_counts(
    sqlserver_config: dict[str, Any],
    postgres_config: dict[str, Any],
    sqlserver_table: str | None,
    postgres_table: str | None,
    *,
    sql_counter: Callable[[dict[str, Any], str], int] | None = None,
    pg_counter: Callable[[dict[str, Any], str], int] | None = None,
) -> dict[str, Any]:
    """Return exact counts and their absolute difference."""
    if not sqlserver_table or not postgres_table:
        return {
            "status": "not_available",
            "summary": "Row counts require the table in both databases.",
            "sqlserver": None,
            "postgres": None,
            "difference": None,
        }

    sql_count = (sql_counter or sqlserver.count_table_rows)(
        sqlserver_config, sqlserver_table
    )
    pg_count = (pg_counter or postgres.count_table_rows)(
        postgres_config, postgres_table
    )
    difference = abs(sql_count - pg_count)
    return {
        "status": "match" if difference == 0 else "different",
        "summary": (
            "Row counts match."
            if difference == 0
            else f"{difference:,} row difference found."
        ),
        "sqlserver": sql_count,
        "postgres": pg_count,
        "difference": difference,
    }
