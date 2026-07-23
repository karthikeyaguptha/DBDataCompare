from unittest.mock import patch

from db_compare import create_app
from db_compare.db import DatabaseConnectionError


def client():
    app = create_app({"TESTING": True})
    return app.test_client()


def test_home_page_loads():
    response = client().get("/")

    assert response.status_code == 200
    assert b"DB Compare Studio" in response.data
    assert b"Live connectivity" in response.data
    assert b'<option value="credentials" selected>SQL Server Authentication</option>' in response.data
    assert b'id="tablePagination"' in response.data
    assert b'id="tablesBody"' in response.data


def test_health_endpoint_reports_phase_2():
    response = client().get("/api/health")

    assert response.status_code == 200
    assert response.json["status"] == "ready"
    assert response.json["phase"] == "v0.3.0-database-connectivity"


@patch("db_compare.web.test_database_connection")
def test_connection_endpoint_routes_valid_request(mock_test):
    response = client().post(
        "/api/connections/test",
        json={
            "database_type": "sqlserver",
            "connection": {"server": "db-host", "database": "source"},
        },
    )

    assert response.status_code == 200
    assert response.json["status"] == "connected"
    mock_test.assert_called_once()


@patch(
    "db_compare.web.test_database_connection",
    side_effect=DatabaseConnectionError("SQL Server rejected the login."),
)
def test_connection_endpoint_returns_safe_driver_error(_mock_test):
    response = client().post(
        "/api/connections/test",
        json={
            "database_type": "sqlserver",
            "connection": {"username": "user", "password": "secret-value"},
        },
    )

    assert response.status_code == 503
    assert response.json["message"] == "SQL Server rejected the login."
    assert "secret-value" not in response.get_data(as_text=True)


@patch("db_compare.web.load_table_names")
def test_tables_endpoint_merges_searches_and_paginates(mock_load):
    mock_load.return_value = (
        ["Audit", "Customers", "Orders", "Products"],
        ["customers", "Invoices", "orders", "Products"],
    )

    response = client().post(
        "/api/tables",
        json={
            "sqlserver": {"server": "source"},
            "postgres": {"host": "target"},
            "search": "o",
            "page": 1,
            "page_size": 5,
        },
    )

    assert response.status_code == 200
    assert response.json["pagination"] == {
        "page": 1,
        "page_size": 5,
        "total": 4,
        "total_pages": 1,
    }
    assert [row["id"] for row in response.json["tables"]] == [
        "customers",
        "invoices",
        "orders",
        "products",
    ]
    assert response.json["tables"][0]["status"] == "available"
    assert response.json["tables"][1]["status"] == "postgres_only"


def test_tables_endpoint_rejects_unsupported_page_size():
    response = client().post(
        "/api/tables",
        json={
            "sqlserver": {},
            "postgres": {},
            "page": 1,
            "page_size": 999,
        },
    )

    assert response.status_code == 400
    assert response.json["status"] == "error"
