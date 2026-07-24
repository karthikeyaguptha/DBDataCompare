"""Cross-database schema comparison."""

from __future__ import annotations

from typing import Any, Callable

from ..cancellation import CancellationController
from ..db import postgres, sqlserver
from ..db.errors import DatabaseConfigurationError


_TYPE_FAMILIES = {
    "bigint": "integer64",
    "int8": "integer64",
    "integer": "integer32",
    "int": "integer32",
    "int4": "integer32",
    "smallint": "integer16",
    "int2": "integer16",
    "tinyint": "integer8",
    "bit": "boolean",
    "boolean": "boolean",
    "bool": "boolean",
    "decimal": "decimal",
    "numeric": "decimal",
    "money": "decimal",
    "smallmoney": "decimal",
    "real": "float32",
    "float": "float64",
    "double precision": "float64",
    "varchar": "text",
    "character varying": "text",
    "nvarchar": "text",
    "char": "text",
    "character": "text",
    "nchar": "text",
    "text": "text",
    "ntext": "text",
    "uniqueidentifier": "uuid",
    "uuid": "uuid",
    "date": "date",
    "time": "time",
    "time without time zone": "time",
    "time with time zone": "time_tz",
    "datetime": "timestamp",
    "datetime2": "timestamp",
    "smalldatetime": "timestamp",
    # SQL Server timestamp is the legacy rowversion binary type, not date/time.
    "timestamp": "binary",
    "timestamp without time zone": "timestamp",
    "datetimeoffset": "timestamp_tz",
    "timestamp with time zone": "timestamp_tz",
    "binary": "binary",
    "varbinary": "binary",
    "bytea": "binary",
    "image": "binary",
    "json": "json",
    "jsonb": "json",
    "xml": "xml",
}


def compare_table_schema(
    sqlserver_config: dict[str, Any],
    postgres_config: dict[str, Any],
    sqlserver_table: str | None,
    postgres_table: str | None,
    *,
    sql_loader: Callable[[dict[str, Any], str], dict[str, Any]] | None = None,
    pg_loader: Callable[[dict[str, Any], str], dict[str, Any]] | None = None,
    cancellation: CancellationController | None = None,
) -> dict[str, Any]:
    """Compare one mapped table and return a JSON-safe result."""
    if not sqlserver_table or not postgres_table:
        return {
            "status": "missing_table",
            "summary": "Table is not available in both databases.",
            "sqlserver_table": sqlserver_table,
            "postgres_table": postgres_table,
            "columns": [],
            "counts": {"matched": 0, "different": 0, "missing": 0},
            "comparison_key": None,
            "key_status": "not_available",
        }

    sql_schema = (
        sql_loader(sqlserver_config, sqlserver_table)
        if sql_loader
        else sqlserver.load_table_schema(
            sqlserver_config, sqlserver_table, cancellation=cancellation
        )
    )
    pg_schema = (
        pg_loader(postgres_config, postgres_table)
        if pg_loader
        else postgres.load_table_schema(
            postgres_config, postgres_table, cancellation=cancellation
        )
    )
    columns = _compare_columns(sql_schema["columns"], pg_schema["columns"])
    comparison_key, key_status = _discover_comparison_key(sql_schema, pg_schema)
    counts = {
        "matched": sum(item["status"] == "match" for item in columns),
        "different": sum(item["status"] == "different" for item in columns),
        "missing": sum(item["status"] in {"sql_only", "postgres_only"} for item in columns),
    }
    status = "match" if not counts["different"] and not counts["missing"] else "different"
    return {
        "status": status,
        "summary": (
            "Column metadata matches."
            if status == "match"
            else f'{counts["different"] + counts["missing"]} column difference(s) found.'
        ),
        "sqlserver_table": sqlserver_table,
        "postgres_table": postgres_table,
        "columns": columns,
        "counts": counts,
        "sqlserver_column_count": len(sql_schema["columns"]),
        "postgres_column_count": len(pg_schema["columns"]),
        "comparison_key": comparison_key,
        "key_status": key_status,
        "sqlserver_primary_key": sql_schema.get("primary_key") or [],
        "postgres_primary_key": pg_schema.get("primary_key") or [],
    }


def _compare_columns(
    sql_columns: list[dict[str, Any]], pg_columns: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    sql_lookup = {str(item["name"]).casefold(): item for item in sql_columns}
    pg_lookup = {str(item["name"]).casefold(): item for item in pg_columns}
    output: list[dict[str, Any]] = []
    for key in sorted(set(sql_lookup) | set(pg_lookup)):
        sql_column = sql_lookup.get(key)
        pg_column = pg_lookup.get(key)
        if sql_column is None:
            status, differences = "postgres_only", ["Missing in SQL Server"]
        elif pg_column is None:
            status, differences = "sql_only", ["Missing in PostgreSQL"]
        else:
            differences = []
            if _type_signature(sql_column) != _type_signature(pg_column):
                differences.append("Data type")
            if bool(sql_column.get("nullable")) != bool(pg_column.get("nullable")):
                differences.append("Nullability")
            status = "different" if differences else "match"
        output.append(
            {
                "name": (sql_column or pg_column)["name"],
                "sqlserver": _column_view(sql_column),
                "postgres": _column_view(pg_column),
                "status": status,
                "differences": differences,
            }
        )
    return output


def _type_signature(column: dict[str, Any]) -> tuple[Any, ...]:
    raw_type = str(column.get("data_type", "")).casefold()
    family = _TYPE_FAMILIES.get(raw_type, raw_type)
    if family == "text":
        return family, column.get("character_length")
    if family == "decimal":
        return family, column.get("numeric_precision"), column.get("numeric_scale")
    if family in {"time", "time_tz", "timestamp", "timestamp_tz"}:
        return family, column.get("datetime_precision")
    return (family,)


def _column_view(column: dict[str, Any] | None) -> dict[str, Any] | None:
    if column is None:
        return None
    return {
        "name": column["name"],
        "type": _display_type(column),
        "nullable": bool(column.get("nullable")),
    }


def _display_type(column: dict[str, Any]) -> str:
    data_type = str(column.get("data_type", "unknown"))
    length = column.get("character_length")
    precision = column.get("numeric_precision")
    scale = column.get("numeric_scale")
    if length is not None and data_type.casefold() not in {"text", "ntext"}:
        return f"{data_type}({'max' if length == -1 else length})"
    if precision is not None and _TYPE_FAMILIES.get(data_type.casefold()) == "decimal":
        return f"{data_type}({precision},{scale or 0})"
    return data_type


def _discover_comparison_key(
    sql_schema: dict[str, Any], pg_schema: dict[str, Any]
) -> tuple[list[str] | None, str]:
    sql_candidates = _key_candidates(sql_schema)
    pg_candidates = _key_candidates(pg_schema)
    for sql_key in sql_candidates:
        folded = tuple(name.casefold() for name in sql_key)
        for pg_key in pg_candidates:
            if folded == tuple(name.casefold() for name in pg_key):
                return sql_key, "matched"
    if sql_candidates or pg_candidates:
        return None, "different"
    return None, "required"


def _key_candidates(schema: dict[str, Any]) -> list[list[str]]:
    candidates: list[list[str]] = []
    primary = schema.get("primary_key") or []
    if primary:
        candidates.append(list(primary))
    for key in schema.get("unique_keys") or []:
        if key and list(key) not in candidates:
            candidates.append(list(key))
    return candidates
