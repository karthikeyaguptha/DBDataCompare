"""Batch-streamed, key-based row comparison."""

from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
from itertools import zip_longest
from typing import Any, Callable, Iterable
from uuid import UUID

from ..db import postgres, sqlserver
from ..db.errors import DatabaseConfigurationError


_MISSING = object()
_PREVIEW_LIMIT = 200


def compare_table_data(
    sqlserver_config: dict[str, Any],
    postgres_config: dict[str, Any],
    sqlserver_table: str,
    postgres_table: str,
    schema_result: dict[str, Any],
    comparison_key: list[str],
    *,
    batch_size: int = 5000,
    options: dict[str, Any] | None = None,
    cancel_requested: Callable[[], bool] | None = None,
    progress: Callable[[int], None] | None = None,
    mismatch_sink: Callable[[dict[str, Any]], None] | None = None,
    sql_rows: Iterable[tuple[Any, ...]] | None = None,
    pg_rows: Iterable[tuple[Any, ...]] | None = None,
) -> dict[str, Any]:
    """Compare ordered streams, export every mismatch, and retain a bounded preview."""
    if batch_size not in {2000, 5000, 10000}:
        raise DatabaseConfigurationError("Choose a supported batch size.")
    if not comparison_key:
        raise DatabaseConfigurationError("A comparison key is required.")

    column_pairs = _common_column_pairs(schema_result)
    if not column_pairs:
        raise DatabaseConfigurationError("No common columns are available for data comparison.")
    sql_lookup = {sql_name.casefold(): (sql_name, pg_name) for sql_name, pg_name in column_pairs}
    pg_lookup = {pg_name.casefold(): (sql_name, pg_name) for sql_name, pg_name in column_pairs}
    try:
        key_pairs = [
            sql_lookup.get(name.casefold()) or pg_lookup[name.casefold()]
            for name in comparison_key
        ]
    except KeyError as exc:
        raise DatabaseConfigurationError(
            f'Comparison key column "{exc.args[0]}" is not available in both databases.'
        ) from exc

    # Put keys first so key extraction is cheap and deterministic.
    remaining = [pair for pair in column_pairs if pair not in key_pairs]
    ordered_pairs = key_pairs + remaining
    sql_columns = [pair[0] for pair in ordered_pairs]
    pg_columns = [pair[1] for pair in ordered_pairs]
    sql_keys = [pair[0] for pair in key_pairs]
    pg_keys = [pair[1] for pair in key_pairs]
    rules = _comparison_options(options or {})

    sql_stream = iter(sql_rows) if sql_rows is not None else sqlserver.iter_table_rows(
        sqlserver_config, sqlserver_table, sql_columns, sql_keys, batch_size
    )
    pg_stream = iter(pg_rows) if pg_rows is not None else postgres.iter_table_rows(
        postgres_config, postgres_table, pg_columns, pg_keys, batch_size
    )

    counts = {"matched": 0, "different": 0, "sql_only": 0, "postgres_only": 0}
    preview: list[dict[str, Any]] = []
    processed = 0
    sql_row = next(sql_stream, _MISSING)
    pg_row = next(pg_stream, _MISSING)

    while sql_row is not _MISSING or pg_row is not _MISSING:
        if cancel_requested and cancel_requested():
            return _result("cancelled", counts, preview, processed, comparison_key)

        if sql_row is _MISSING:
            _record_missing(
                "postgres_only",
                pg_row,
                len(key_pairs),
                pg_columns,
                counts,
                preview,
                mismatch_sink,
            )
            pg_row = next(pg_stream, _MISSING)
        elif pg_row is _MISSING:
            _record_missing(
                "sql_only",
                sql_row,
                len(key_pairs),
                sql_columns,
                counts,
                preview,
                mismatch_sink,
            )
            sql_row = next(sql_stream, _MISSING)
        else:
            sql_key = _key_value(sql_row, len(key_pairs), rules)
            pg_key = _key_value(pg_row, len(key_pairs), rules)
            relation = _compare_keys(sql_key, pg_key)
            if relation < 0:
                _record_missing(
                    "sql_only",
                    sql_row,
                    len(key_pairs),
                    sql_columns,
                    counts,
                    preview,
                    mismatch_sink,
                )
                sql_row = next(sql_stream, _MISSING)
            elif relation > 0:
                _record_missing(
                    "postgres_only",
                    pg_row,
                    len(key_pairs),
                    pg_columns,
                    counts,
                    preview,
                    mismatch_sink,
                )
                pg_row = next(pg_stream, _MISSING)
            else:
                differences = _row_differences(
                    sql_row, pg_row, ordered_pairs, len(key_pairs), rules
                )
                if differences:
                    counts["different"] += 1
                    item = {
                        "kind": "different",
                        "key": _display_key(sql_row[: len(key_pairs)], comparison_key),
                        "differences": differences,
                    }
                    if mismatch_sink:
                        mismatch_sink(item)
                    if len(preview) < _PREVIEW_LIMIT:
                        preview.append(item)
                else:
                    counts["matched"] += 1
                sql_row = next(sql_stream, _MISSING)
                pg_row = next(pg_stream, _MISSING)

        processed += 1
        if progress and (processed % batch_size == 0):
            progress(processed)

    if progress:
        progress(processed)
    status = "match" if not (counts["different"] or counts["sql_only"] or counts["postgres_only"]) else "different"
    return _result(status, counts, preview, processed, comparison_key)


def _common_column_pairs(schema_result: dict[str, Any]) -> list[tuple[str, str]]:
    pairs = []
    for column in schema_result.get("columns") or []:
        sql_column = column.get("sqlserver")
        pg_column = column.get("postgres")
        if sql_column and pg_column:
            pairs.append((str(sql_column["name"]), str(pg_column["name"])))
    return pairs


def _comparison_options(options: dict[str, Any]) -> dict[str, Any]:
    try:
        decimal_tolerance = abs(Decimal(str(options.get("decimal_tolerance", "0") or "0")))
        timestamp_tolerance_ms = max(0, int(options.get("timestamp_tolerance_ms", 0) or 0))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise DatabaseConfigurationError("Comparison tolerances must be valid numbers.") from exc
    return {
        "ignore_trailing_spaces": bool(options.get("ignore_trailing_spaces", False)),
        "case_sensitive": bool(options.get("case_sensitive", True)),
        "decimal_tolerance": decimal_tolerance,
        "timestamp_tolerance_ms": timestamp_tolerance_ms,
    }


def _key_value(row: tuple[Any, ...], key_count: int, rules: dict[str, Any]) -> tuple[Any, ...]:
    return tuple(_canonical(value, rules) for value in row[:key_count])


def _compare_keys(left: tuple[Any, ...], right: tuple[Any, ...]) -> int:
    # Canonical values include a stable type tag, so unlike raw DB values they
    # remain comparable across Python driver types.
    return (left > right) - (left < right)


def _row_differences(
    sql_row: tuple[Any, ...],
    pg_row: tuple[Any, ...],
    pairs: list[tuple[str, str]],
    key_count: int,
    rules: dict[str, Any],
) -> list[dict[str, Any]]:
    differences = []
    for index, ((sql_name, pg_name), sql_value, pg_value) in enumerate(
        zip_longest(pairs, sql_row, pg_row, fillvalue=_MISSING)
    ):
        if index < key_count:
            continue
        if not _values_equal(sql_value, pg_value, rules):
            differences.append(
                {
                    "column": sql_name if sql_name.casefold() == pg_name.casefold() else f"{sql_name} / {pg_name}",
                    "sqlserver": _json_value(sql_value),
                    "postgres": _json_value(pg_value),
                }
            )
    return differences


def _values_equal(left: Any, right: Any, rules: dict[str, Any]) -> bool:
    if left is _MISSING or right is _MISSING:
        return left is right
    if isinstance(left, (int, float, Decimal)) and not isinstance(left, bool) and isinstance(
        right, (int, float, Decimal)
    ) and not isinstance(right, bool):
        try:
            return abs(Decimal(str(left)) - Decimal(str(right))) <= rules["decimal_tolerance"]
        except InvalidOperation:
            pass
    if isinstance(left, datetime) and isinstance(right, datetime):
        left_dt, right_dt = _comparable_datetime(left), _comparable_datetime(right)
        return abs((left_dt - right_dt).total_seconds() * 1000) <= rules["timestamp_tolerance_ms"]
    return _canonical(left, rules) == _canonical(right, rules)


def _canonical(value: Any, rules: dict[str, Any]) -> tuple[str, Any]:
    if value is None:
        return ("null", "")
    if isinstance(value, bool):
        return ("bool", int(value))
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        try:
            return ("number", Decimal(str(value)).normalize())
        except InvalidOperation:
            return ("number", str(value))
    if isinstance(value, datetime):
        return ("datetime", _comparable_datetime(value).isoformat(timespec="microseconds"))
    if isinstance(value, (date, time)):
        return (value.__class__.__name__, value.isoformat())
    if isinstance(value, UUID):
        return ("uuid", str(value).lower())
    if isinstance(value, (bytes, bytearray, memoryview)):
        return ("binary", bytes(value).hex())
    if isinstance(value, (dict, list, tuple)):
        return ("json", json.dumps(value, sort_keys=True, separators=(",", ":"), default=str))
    text = str(value)
    if rules["ignore_trailing_spaces"]:
        text = text.rstrip()
    if not rules["case_sensitive"]:
        text = text.casefold()
    return ("text", text)


def _comparable_datetime(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _record_missing(
    kind: str,
    row: tuple[Any, ...],
    key_count: int,
    columns: list[str],
    counts: dict[str, int],
    preview: list[dict[str, Any]],
    mismatch_sink: Callable[[dict[str, Any]], None] | None = None,
) -> None:
    counts[kind] += 1
    item = {
        "kind": kind,
        "key": _display_key(row[:key_count], columns[:key_count]),
        "values": {
            name: _json_value(value)
            for name, value in zip(columns, row)
        },
    }
    if mismatch_sink:
        mismatch_sink(item)
    if len(preview) < _PREVIEW_LIMIT:
        preview.append(item)


def _display_key(values: tuple[Any, ...], names: list[str]) -> dict[str, Any]:
    return {name: _json_value(value) for name, value in zip(names, values)}


def _json_value(value: Any) -> Any:
    if value is _MISSING:
        return "<missing>"
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime, time, UUID)):
        return value.isoformat() if hasattr(value, "isoformat") else str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"<binary {len(bytes(value))} bytes>"
    if isinstance(value, (dict, list, tuple)):
        return value
    return str(value)


def _result(
    status: str,
    counts: dict[str, int],
    preview: list[dict[str, Any]],
    processed: int,
    comparison_key: list[str],
) -> dict[str, Any]:
    mismatch_total = counts["different"] + counts["sql_only"] + counts["postgres_only"]
    return {
        "status": status,
        "summary": (
            "Row data matches."
            if status == "match"
            else "Data comparison cancelled."
            if status == "cancelled"
            else f"{mismatch_total:,} row difference(s) found."
        ),
        "comparison_key": comparison_key,
        "processed": processed,
        "counts": counts,
        "mismatch_total": mismatch_total,
        "preview": preview,
        "preview_limited": mismatch_total > len(preview),
    }
