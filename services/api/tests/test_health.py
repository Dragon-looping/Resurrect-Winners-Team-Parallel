"""Unit tests for the health check and documentation endpoints."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_returns_healthy_status() -> None:
    """Verify GET /health returns HTTP 200 with expected JSON body."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": "setuvyuha-api",
    }


def test_swagger_docs_available() -> None:
    """Verify Swagger UI is served at /docs and OpenAPI schema reflects app title."""
    docs_response = client.get("/docs")
    openapi_response = client.get("/openapi.json")

    assert docs_response.status_code == 200
    assert "Swagger UI" in docs_response.text
    assert openapi_response.status_code == 200
    assert openapi_response.json()["info"]["title"] == "SETUVYUHA API"
