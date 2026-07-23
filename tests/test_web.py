from db_compare import create_app


def test_home_page_loads():
    app = create_app({"TESTING": True})
    client = app.test_client()

    response = client.get("/")

    assert response.status_code == 200
    assert b"DB Compare Studio" in response.data


def test_health_endpoint():
    app = create_app({"TESTING": True})
    client = app.test_client()

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json["status"] == "ready"
    assert response.json["phase"] == "v0.1.0-project-setup"

