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


def test_approved_migration_specific_type_mappings_match():
    sql_schema = {
        "columns": [
            column("Level", "tinyint"),
            column("Notes", "varchar", True, character_length=-1),
            column("Amount", "money", numeric_precision=19, numeric_scale=4),
            column("CreatedAt", "datetime", datetime_precision=3),
            column("Payload", "varbinary", True, character_length=100),
        ],
        "primary_key": [],
        "unique_keys": [],
    }
    pg_schema = {
        "columns": [
            column("level", "smallint"),
            column("notes", "text", True),
            column("amount", "numeric", numeric_precision=19, numeric_scale=4),
            column("createdat", "timestamp without time zone", datetime_precision=6),
            column("payload", "bytea", True),
        ],
        "primary_key": [],
        "unique_keys": [],
    }

    result = compare_table_schema(
        {},
        {},
        "MigrationTypes",
        "migrationtypes",
        sql_loader=lambda *_: sql_schema,
        pg_loader=lambda *_: pg_schema,
    )

    assert result["status"] == "match"
    assert result["summary"].startswith("Schema Match")
    assert result["counts"] == {"matched": 5, "different": 0, "missing": 0}


def test_length_precision_and_primary_key_are_part_of_schema_verdict():
    sql_schema = {
        "columns": [
            column("Id", "int"),
            column("Code", "nvarchar", character_length=100),
            column("Amount", "decimal", numeric_precision=12, numeric_scale=2),
        ],
        "primary_key": ["Id"],
        "unique_keys": [],
    }
    pg_schema = {
        "columns": [
            column("id", "integer"),
            column("code", "character varying", character_length=200),
            column("amount", "numeric", numeric_precision=12, numeric_scale=3),
        ],
        "primary_key": ["Code"],
        "unique_keys": [],
    }

    result = compare_table_schema(
        {},
        {},
        "Product",
        "product",
        sql_loader=lambda *_: sql_schema,
        pg_loader=lambda *_: pg_schema,
    )

    assert result["status"] == "different"
    assert result["summary"].startswith("Schema Mismatch")
    assert result["primary_key_status"] == "different"
    assert result["schema_differences"] == ["2 column difference(s)", "Primary key"]
    code_result = next(item for item in result["columns"] if item["name"] == "Code")
    assert "expected VARCHAR(100)" in code_result["differences"][0]


def test_unapproved_source_type_is_a_schema_mismatch():
    sql_schema = {
        "columns": [column("Shape", "geography")],
        "primary_key": [],
        "unique_keys": [],
    }
    pg_schema = {
        "columns": [column("shape", "geography")],
        "primary_key": [],
        "unique_keys": [],
    }

    result = compare_table_schema(
        {},
        {},
        "Location",
        "location",
        sql_loader=lambda *_: sql_schema,
        pg_loader=lambda *_: pg_schema,
    )

    assert result["status"] == "different"
    assert result["columns"][0]["differences"] == [
        "No approved PostgreSQL datatype mapping found."
    ]


def test_user_configured_datatype_mapping_can_be_added_and_removed():
    sql_schema = {
        "columns": [column("Shape", "geography")],
        "primary_key": [],
        "unique_keys": [],
    }
    pg_schema = {
        "columns": [column("shape", "geography")],
        "primary_key": [],
        "unique_keys": [],
    }

    configured = compare_table_schema(
        {},
        {},
        "Location",
        "location",
        sql_loader=lambda *_: sql_schema,
        pg_loader=lambda *_: pg_schema,
        datatype_mappings={"geography": {"geography"}},
    )
    removed = compare_table_schema(
        {},
        {},
        "Location",
        "location",
        sql_loader=lambda *_: sql_schema,
        pg_loader=lambda *_: pg_schema,
        datatype_mappings={},
    )

    assert configured["status"] == "match"
    assert configured["columns"][0]["expected_postgres"] == "GEOGRAPHY"
    assert removed["status"] == "different"
