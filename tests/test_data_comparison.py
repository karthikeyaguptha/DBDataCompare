from datetime import datetime, timezone
from decimal import Decimal

import pytest

from db_compare.comparison.data import compare_table_data
from db_compare.db import DatabaseConfigurationError


def schema_result():
    return {
        "columns": [
            {
                "name": "Id",
                "sqlserver": {"name": "Id"},
                "postgres": {"name": "id"},
                "status": "match",
            },
            {
                "name": "Name",
                "sqlserver": {"name": "Name"},
                "postgres": {"name": "name"},
                "status": "match",
            },
            {
                "name": "Amount",
                "sqlserver": {"name": "Amount"},
                "postgres": {"name": "amount"},
                "status": "match",
            },
        ]
    }


def compare(sql_rows, pg_rows, **kwargs):
    return compare_table_data(
        {},
        {},
        "Customers",
        "customers",
        schema_result(),
        ["Id"],
        sql_rows=sql_rows,
        pg_rows=pg_rows,
        **kwargs,
    )


def test_streaming_data_comparison_finds_values_and_missing_rows():
    result = compare(
        [(1, "Ana", Decimal("10.00")), (2, "Ben", Decimal("20"))],
        [(1, "Ana", Decimal("10")), (3, "Cara", Decimal("30"))],
    )

    assert result["status"] == "different"
    assert result["counts"] == {
        "matched": 1,
        "different": 0,
        "sql_only": 1,
        "postgres_only": 1,
    }
    assert {item["kind"] for item in result["preview"]} == {
        "sql_only",
        "postgres_only",
    }


def test_value_normalisation_rules_and_tolerances():
    result = compare(
        [(1, "Alpha  ", Decimal("10.004"))],
        [(1, "alpha", Decimal("10.000"))],
        options={
            "ignore_trailing_spaces": True,
            "case_sensitive": False,
            "decimal_tolerance": "0.01",
        },
    )

    assert result["status"] == "match"
    assert result["counts"]["matched"] == 1


def test_timestamp_tolerance():
    local = datetime(2026, 1, 1, 12, 0, 0, 500)
    utc = datetime(2026, 1, 1, 12, 0, 0, 900, tzinfo=timezone.utc)
    extended_schema = schema_result()
    extended_schema["columns"][1] = {
        "name": "CreatedAt",
        "sqlserver": {"name": "CreatedAt"},
        "postgres": {"name": "created_at"},
        "status": "match",
    }

    result = compare_table_data(
        {},
        {},
        "Events",
        "events",
        extended_schema,
        ["Id"],
        sql_rows=[(1, local, 1)],
        pg_rows=[(1, utc, 1)],
        options={"timestamp_tolerance_ms": 1},
    )

    assert result["status"] == "match"


def test_comparison_can_cancel_between_rows():
    calls = 0

    def cancelled():
        nonlocal calls
        calls += 1
        return calls > 1

    result = compare(
        [(1, "A", 1), (2, "B", 2)],
        [(1, "A", 1), (2, "B", 2)],
        cancel_requested=cancelled,
    )

    assert result["status"] == "cancelled"
    assert result["processed"] == 1


def test_manual_key_must_exist_on_both_sides():
    with pytest.raises(DatabaseConfigurationError, match="not available in both"):
        compare_table_data(
            {},
            {},
            "Customers",
            "customers",
            schema_result(),
            ["MissingKey"],
            sql_rows=[],
            pg_rows=[],
        )
