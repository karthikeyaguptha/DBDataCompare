import json

from db_compare import create_app
from db_compare.comparison.data import compare_table_data
from db_compare.reporting import format_duration


def make_client(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "REPORTS_DIR": tmp_path / "reports",
            "PROFILES_FILE": tmp_path / "config" / "profiles.json",
        }
    )
    return app.test_client()


def test_duration_is_formatted_in_conversational_units():
    assert format_duration(0.3) == "< 1 sec"
    assert format_duration(45) == "45 sec"
    assert format_duration(243.9) == "4 min 4 sec"
    assert format_duration(7_680) == "2 hr 8 min"
    assert format_duration(97_200) == "1 day 3 hr"


def test_profile_round_trip_never_persists_passwords(tmp_path):
    client = make_client(tmp_path)
    saved = client.post(
        "/api/profiles",
        json={
            "name": "Migration QA",
            "sqlserver": {
                "server": "sql-host",
                "username": "reader",
                "password": "sql-secret",
            },
            "postgres": {
                "host": "pg-host",
                "username": "reader",
                "password": "pg-secret",
            },
            "selected_tables": ["customers"],
            "manual_keys": {"customers": ["CustomerId"]},
            "statuses": ["available"],
            "comparison_mode": "full",
            "batch_size": 5000,
            "options": {"case_sensitive": True},
        },
    )

    assert saved.status_code == 200
    profile_id = saved.json["profile"]["id"]
    listed = client.get("/api/profiles")
    assert listed.status_code == 200
    assert listed.json["profiles"][0]["id"] == profile_id
    assert listed.json["profiles"][0]["sqlserver"]["server"] == "sql-host"
    assert listed.json["profiles"][0]["postgres"]["host"] == "pg-host"
    raw = (tmp_path / "config" / "profiles.json").read_text(encoding="utf-8")
    assert "sql-secret" not in raw
    assert "pg-secret" not in raw
    assert '"password"' not in raw

    deleted = client.delete(f"/api/profiles/{profile_id}")
    assert deleted.status_code == 200
    assert client.get("/api/profiles").json["profiles"] == []


def test_report_run_writes_summary_csv_jsonl_and_log(tmp_path):
    client = make_client(tmp_path)
    started = client.post(
        "/api/reports/runs",
        json={"comparison_mode": "full", "selected_tables": ["customers"]},
    )
    assert started.status_code == 201
    run_id = started.json["run_id"]
    run_dir = tmp_path / "reports" / run_id
    with (run_dir / "data-sync-check-mismatches.jsonl").open("a", encoding="utf-8") as handle:
        handle.write('{"table_id":"customers","kind":"different"}\n')

    finalized = client.post(
        f"/api/reports/{run_id}/finalize",
        json={
            "started_at": started.json["started_at"],
            "duration_seconds": 1.25,
            "comparison_mode": "full",
            "batch_size": 5000,
            "comparison_options": {"case_sensitive": True},
            "connections": {
                "sqlserver": {
                    "server": "sql-host",
                    "port": "1433",
                    "database": "SalesSource",
                    "schema": "dbo",
                    "username": "should-not-be-saved",
                    "password": "secret",
                },
                "postgres": {
                    "host": "pg-host",
                    "port": "5432",
                    "database": "sales_target",
                    "schema": "public",
                    "username": "should-not-be-saved",
                    "password": "secret",
                },
            },
            "cancelled": False,
            "tables": [
                {
                    "table_id": "customers",
                    "sqlserver_table": "Customers",
                    "postgres_table": "customers",
                    "status": "different",
                    "summary": "1 difference.",
                    "sqlserver_columns": 3,
                    "postgres_columns": 3,
                    "column_differences": 0,
                    "row_counts": {"sqlserver": 10, "postgres": 10, "difference": 0},
                    "comparison_key": ["CustomerId"],
                    "data_counts": {
                        "matched": 9,
                        "different": 1,
                        "sql_only": 0,
                        "postgres_only": 0,
                    },
                    "processed_rows": 10,
                }
            ],
            "log_entries": [
                {"timestamp": "12:00:00", "level": "READY", "message": "Finished."}
            ],
        },
    )

    assert finalized.status_code == 200
    assert set(finalized.json["files"]) == {
        "summary",
        "mismatches",
        "csv",
        "log",
        "dashboard",
    }
    summary = json.loads((run_dir / "data-sync-check-run-summary.json").read_text(encoding="utf-8"))
    assert summary["totals"]["row_mismatches"] == 1
    assert summary["connections"]["sqlserver"]["database"] == "SalesSource"
    assert summary["connections"]["postgres"]["host"] == "pg-host"
    assert "password" not in summary["connections"]["sqlserver"]
    assert "username" not in summary["connections"]["postgres"]
    assert "CustomerId" in (run_dir / "data-sync-check-comparison-summary.csv").read_text(
        encoding="utf-8-sig"
    )
    assert "Finished." in (run_dir / "data-sync-check-execution.log").read_text(encoding="utf-8")
    assert client.get(f"/api/reports/{run_id}/mismatches").status_code == 200
    dashboard = client.get(f"/reports/{run_id}/dashboard")
    assert dashboard.status_code == 200
    assert b"Data Sync Check Comparison Report" in dashboard.data
    assert b"Export PDF" in dashboard.data
    assert b"SalesSource" in dashboard.data
    assert b"sales_target" in dashboard.data
    assert b"Schema + Row Count + Data" in dashboard.data

    dashboard_data = client.get(
        f"/api/reports/{run_id}/dashboard-data?page=1&page_size=25"
    )
    assert dashboard_data.status_code == 200
    assert dashboard_data.json["pagination"]["total"] == 1
    assert dashboard_data.json["rows"][0]["table_id"] == "customers"
    assert dashboard_data.json["facets"]["kinds"]["different"] == 1


def test_dashboard_filters_multi_table_mismatch_data(tmp_path):
    client = make_client(tmp_path)
    started = client.post(
        "/api/reports/runs",
        json={"comparison_mode": "full", "selected_tables": ["a", "b"]},
    )
    run_id = started.json["run_id"]
    run_dir = tmp_path / "reports" / run_id
    records = [
        {"table_id": "a", "kind": "different", "key": {"id": 1}},
        {"table_id": "a", "kind": "sql_only", "key": {"id": 2}},
        {"table_id": "b", "kind": "postgres_only", "key": {"id": 3}},
    ]
    with (run_dir / "data-sync-check-mismatches.jsonl").open("a", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record) + "\n")
    client.post(
        f"/api/reports/{run_id}/finalize",
        json={
            "started_at": started.json["started_at"],
            "duration_seconds": 0.3,
            "comparison_mode": "full",
            "cancelled": False,
            "tables": [
                {"table_id": "a", "status": "different"},
                {"table_id": "b", "status": "different"},
            ],
            "log_entries": [],
        },
    )

    response = client.get(
        f"/api/reports/{run_id}/dashboard-data"
        "?page=1&page_size=25&table=a&kind=sql_only"
    )
    assert response.status_code == 200
    assert response.json["pagination"]["total"] == 1
    assert response.json["rows"][0]["kind"] == "sql_only"
    assert {item["table_id"] for item in response.json["facets"]["tables"]} == {"a", "b"}


def test_csv_export_neutralizes_spreadsheet_formulas(tmp_path):
    client = make_client(tmp_path)
    started = client.post(
        "/api/reports/runs",
        json={"comparison_mode": "schema_only", "selected_tables": ["=unsafe"]},
    )
    run_id = started.json["run_id"]

    finalized = client.post(
        f"/api/reports/{run_id}/finalize",
        json={
            "started_at": started.json["started_at"],
            "duration_seconds": 0.1,
            "comparison_mode": "schema_only",
            "cancelled": False,
            "tables": [
                {
                    "table_id": "=unsafe",
                    "sqlserver_table": "+source",
                    "postgres_table": "@target",
                    "status": "different",
                    "summary": "-formula",
                }
            ],
            "log_entries": [],
        },
    )

    assert finalized.status_code == 200
    csv_text = (tmp_path / "reports" / run_id / "data-sync-check-comparison-summary.csv").read_text(
        encoding="utf-8-sig"
    )
    assert "'=unsafe" in csv_text
    assert "'+source" in csv_text
    assert "'@target" in csv_text
    assert "'-formula" in csv_text


def test_streaming_comparison_sends_every_mismatch_to_export_sink():
    schema = {
        "columns": [
            {
                "sqlserver": {"name": "Id"},
                "postgres": {"name": "id"},
            },
            {
                "sqlserver": {"name": "Name"},
                "postgres": {"name": "name"},
            },
        ]
    }
    exported = []
    result = compare_table_data(
        {},
        {},
        "Customers",
        "customers",
        schema,
        ["Id"],
        sql_rows=[(1, "A"), (2, "B")],
        pg_rows=[(1, "Changed"), (3, "C")],
        mismatch_sink=exported.append,
    )

    assert result["mismatch_total"] == 3
    assert len(exported) == 3
    assert {item["kind"] for item in exported} == {
        "different",
        "sql_only",
        "postgres_only",
    }
