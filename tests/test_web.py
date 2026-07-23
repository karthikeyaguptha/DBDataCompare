from db_compare import create_app


def test_home_page_loads():
    app = create_app({"TESTING": True})
    client = app.test_client()

    response = client.get("/")

    assert response.status_code == 200
    assert b"DB Compare Studio" in response.data
    assert b"Database connections" in response.data
    assert b"Select tables" in response.data
    assert b"Run comparison" in response.data
    assert b"Execution log" in response.data
    assert b'<option value="credentials" selected>SQL Server Authentication</option>' in response.data
    assert b'id="tablePagination"' in response.data
    assert b'id="tablePageSize"' in response.data


def test_health_endpoint():
    app = create_app({"TESTING": True})
    client = app.test_client()

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json["status"] == "ready"
    assert response.json["phase"] == "v0.2.1-ui-enhancements"
