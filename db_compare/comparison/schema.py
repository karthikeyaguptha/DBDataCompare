"""Cross-database schema comparison."""

from __future__ import annotations

from typing import Any, Callable

from ..cancellation import CancellationController
from ..db import postgres, sqlserver
from ..db.errors import DatabaseConfigurationError


_PG_TYPE_ALIASES = {
    "int8": "bigint",
    "int4": "integer",
    "int": "integer",
    "int2": "smallint",
    "bool": "boolean",
    "decimal": "numeric",
    "float4": "real",
    "float8": "double precision",
    "varchar": "character varying",
    "char": "character",
    "timestamp": "timestamp without time zone",
    "timestamptz": "timestamp with time zone",
    "time": "time without time zone",
    "timetz": "time with time zone",
}

_SIMPLE_TYPE_MAPPINGS = {
    "bigint": ({"bigint"}, "BIGINT"),
    "int": ({"integer"}, "INTEGER"),
    "smallint": ({"smallint"}, "SMALLINT"),
    "tinyint": ({"smallint"}, "SMALLINT"),
    "bit": ({"boolean"}, "BOOLEAN"),
    "real": ({"real"}, "REAL"),
    "float": ({"double precision"}, "DOUBLE PRECISION"),
    "date": ({"date"}, "DATE"),
    "datetime": ({"timestamp without time zone"}, "TIMESTAMP"),
    "datetime2": ({"timestamp without time zone"}, "TIMESTAMP"),
    "smalldatetime": ({"timestamp without time zone"}, "TIMESTAMP"),
    "datetimeoffset": ({"timestamp with time zone"}, "TIMESTAMP WITH TIME ZONE"),
    "time": ({"time without time zone"}, "TIME"),
    "uniqueidentifier": ({"uuid"}, "UUID"),
    "binary": ({"bytea"}, "BYTEA"),
    "varbinary": ({"bytea"}, "BYTEA"),
    "image": ({"bytea"}, "BYTEA"),
    # SQL Server timestamp/rowversion is binary, not a date-time value.
    "timestamp": ({"bytea"}, "BYTEA"),
    "rowversion": ({"bytea"}, "BYTEA"),
    "text": ({"text"}, "TEXT"),
    "ntext": ({"text"}, "TEXT"),
    "xml": ({"xml"}, "XML"),
}

_NUMERIC_TYPES = {"decimal", "numeric"}
_VARIABLE_TEXT_TYPES = {"varchar", "nvarchar"}
_FIXED_TEXT_TYPES = {"char", "nchar"}


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
    sql_primary_key = sql_schema.get("primary_key") or []
    pg_primary_key = pg_schema.get("primary_key") or []
    primary_key_matches = _same_key(sql_primary_key, pg_primary_key)
    counts = {
        "matched": sum(item["status"] == "match" for item in columns),
        "different": sum(item["status"] == "different" for item in columns),
        "missing": sum(item["status"] in {"sql_only", "postgres_only"} for item in columns),
    }
    column_differences = counts["different"] + counts["missing"]
    status = "match" if not column_differences and primary_key_matches else "different"
    schema_differences = []
    if column_differences:
        schema_differences.append(f"{column_differences} column difference(s)")
    if not primary_key_matches:
        schema_differences.append("Primary key")
    return {
        "status": status,
        "summary": (
            f"Schema Match — {len(columns)} column(s) and primary key metadata match."
            if status == "match"
            else f'Schema Mismatch — {", ".join(schema_differences)}.'
        ),
        "sqlserver_table": sqlserver_table,
        "postgres_table": postgres_table,
        "columns": columns,
        "counts": counts,
        "sqlserver_column_count": len(sql_schema["columns"]),
        "postgres_column_count": len(pg_schema["columns"]),
        "comparison_key": comparison_key,
        "key_status": key_status,
        "sqlserver_primary_key": sql_primary_key,
        "postgres_primary_key": pg_primary_key,
        "primary_key_matches": primary_key_matches,
        "primary_key_status": "match" if primary_key_matches else "different",
        "schema_differences": schema_differences,
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
            type_matches, type_reason, expected_postgres = _types_match(
                sql_column, pg_column
            )
            if not type_matches:
                differences.append(type_reason or "Data type")
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
                "expected_postgres": (
                    expected_postgres
                    if sql_column is not None and pg_column is not None
                    else None
                ),
            }
        )
    return output


def _types_match(
    sql_column: dict[str, Any], pg_column: dict[str, Any]
) -> tuple[bool, str | None, str | None]:
    sql_type = str(sql_column.get("data_type", "")).strip().casefold()
    pg_type = _normalise_pg_type(pg_column.get("data_type"))

    if sql_type in _SIMPLE_TYPE_MAPPINGS:
        accepted, expected = _SIMPLE_TYPE_MAPPINGS[sql_type]
        matches = pg_type in accepted
        return matches, None if matches else f"Data type (expected {expected})", expected

    if sql_type in _NUMERIC_TYPES:
        precision = sql_column.get("numeric_precision")
        scale = sql_column.get("numeric_scale")
        expected = _numeric_label(precision, scale)
        matches = (
            pg_type == "numeric"
            and pg_column.get("numeric_precision") == precision
            and pg_column.get("numeric_scale") == scale
        )
        return matches, None if matches else f"Data type (expected {expected})", expected

    if sql_type == "money":
        return _fixed_numeric_match(pg_column, 19, 4)

    if sql_type == "smallmoney":
        return _fixed_numeric_match(pg_column, 10, 4)

    if sql_type in _VARIABLE_TEXT_TYPES:
        length = sql_column.get("character_length")
        if length == -1:
            expected = "TEXT"
            matches = pg_type == "text"
        else:
            expected = f"VARCHAR({length})"
            matches = (
                pg_type == "character varying"
                and pg_column.get("character_length") == length
            )
        return matches, None if matches else f"Data type (expected {expected})", expected

    if sql_type in _FIXED_TEXT_TYPES:
        length = sql_column.get("character_length")
        expected = f"CHAR({length})"
        matches = (
            pg_type == "character"
            and pg_column.get("character_length") == length
        )
        return matches, None if matches else f"Data type (expected {expected})", expected

    reason = "No approved PostgreSQL datatype mapping found."
    return False, reason, None


def _normalise_pg_type(value: Any) -> str:
    raw_type = str(value or "").strip().casefold()
    return _PG_TYPE_ALIASES.get(raw_type, raw_type)


def _fixed_numeric_match(
    pg_column: dict[str, Any], precision: int, scale: int
) -> tuple[bool, str | None, str]:
    expected = f"NUMERIC({precision},{scale})"
    matches = (
        _normalise_pg_type(pg_column.get("data_type")) == "numeric"
        and pg_column.get("numeric_precision") == precision
        and pg_column.get("numeric_scale") == scale
    )
    return matches, None if matches else f"Data type (expected {expected})", expected


def _numeric_label(precision: Any, scale: Any) -> str:
    if precision is None:
        return "NUMERIC"
    return f"NUMERIC({precision},{scale or 0})"


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
    if precision is not None and data_type.casefold() in {
        "decimal",
        "numeric",
        "money",
        "smallmoney",
    }:
        return f"{data_type}({precision},{scale or 0})"
    return data_type


def _same_key(sql_key: list[str], pg_key: list[str]) -> bool:
    return tuple(name.casefold() for name in sql_key) == tuple(
        name.casefold() for name in pg_key
    )


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
