from db_compare.comparison.counts import compare_table_row_counts


def test_matching_exact_row_counts():
    result = compare_table_row_counts(
        {},
        {},
        "Customers",
        "customers",
        sql_counter=lambda *_: 1250,
        pg_counter=lambda *_: 1250,
    )

    assert result == {
        "status": "match",
        "summary": "Row counts match.",
        "sqlserver": 1250,
        "postgres": 1250,
        "difference": 0,
    }


def test_different_row_counts_report_absolute_gap():
    result = compare_table_row_counts(
        {},
        {},
        "Orders",
        "orders",
        sql_counter=lambda *_: 1205,
        pg_counter=lambda *_: 1200,
    )

    assert result["status"] == "different"
    assert result["difference"] == 5
    assert result["summary"] == "5 row difference found."


def test_missing_table_does_not_execute_count_queries():
    result = compare_table_row_counts(
        {},
        {},
        "Audit",
        None,
        sql_counter=lambda *_: (_ for _ in ()).throw(AssertionError("not called")),
        pg_counter=lambda *_: (_ for _ in ()).throw(AssertionError("not called")),
    )

    assert result["status"] == "not_available"
    assert result["sqlserver"] is None
    assert result["postgres"] is None
    assert result["difference"] is None
