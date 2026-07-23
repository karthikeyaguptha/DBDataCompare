from db_compare.comparison.schema import compare_table_schema


def column(name, data_type, nullable=False, **metadata):
    return {
        "name": name,
        "data_type": data_type,
        "nullable": nullable,
        "character_length": metadata.get("character_length"),
        "numeric_precision": metadata.get("numeric_precision"),
        "numeric_scale": metadata.get("numeric_scale"),
        "datetime_precision": metadata.get("datetime_precision"),
    }


def test_equivalent_cross_database_types_and_keys_match():
    sql_schema = {
        "columns": [
            column("CustomerId", "int"),
            column("Name", "nvarchar", True, character_length=100),
            column("Enabled", "bit"),
        ],
        "primary_key": ["CustomerId"],
        "unique_keys": [],
    }
    pg_schema = {
        "columns": [
            column("customerid", "integer"),
            column("name", "character varying", True, character_length=100),
            column("enabled", "boolean"),
        ],
        "primary_key": ["customerid"],
        "unique_keys": [],
    }

    result = compare_table_schema(
        {},
        {},
        "Customer",
        "customer",
        sql_loader=lambda *_: sql_schema,
        pg_loader=lambda *_: pg_schema,
    )

    assert result["status"] == "match"
    assert result["counts"] == {"matched": 3, "different": 0, "missing": 0}
    assert result["comparison_key"] == ["CustomerId"]
    assert result["key_status"] == "matched"


def test_missing_column_type_and_nullability_differences_are_reported():
    sql_schema = {
        "columns": [
            column("Id", "bigint"),
            column("Amount", "decimal", numeric_precision=12, numeric_scale=2),
            column("SourceOnly", "varchar", character_length=20),
        ],
        "primary_key": ["Id"],
        "unique_keys": [],
    }
    pg_schema = {
        "columns": [
            column("id", "integer", True),
            column("amount", "numeric", numeric_precision=10, numeric_scale=2),
            column("TargetOnly", "text"),
        ],
        "primary_key": ["id"],
        "unique_keys": [],
    }

    result = compare_table_schema(
        {},
        {},
        "Invoice",
        "invoice",
        sql_loader=lambda *_: sql_schema,
        pg_loader=lambda *_: pg_schema,
    )

    assert result["status"] == "different"
    assert result["counts"] == {"matched": 0, "different": 2, "missing": 2}
    assert {item["status"] for item in result["columns"]} == {
        "different",
        "sql_only",
        "postgres_only",
    }


def test_database_only_table_is_reported_without_metadata_query():
    result = compare_table_schema({}, {}, "Audit", None)

    assert result["status"] == "missing_table"
    assert result["key_status"] == "not_available"
