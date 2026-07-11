import pytest
from fastapi.testclient import TestClient
from app import app


client = TestClient(app)


class TestHealthCheck:
    def test_health_check_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_check_returns_status_ok(self):
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "ok"

    def test_health_check_returns_embedding_model_field(self):
        response = client.get("/health")
        data = response.json()
        assert "embedding_model" in data

    def test_health_check_returns_sentence_transformer(self):
        # conftest.py does not stub sentence_transformers, so it loads correctly
        response = client.get("/health")
        data = response.json()
        assert data["embedding_model"] == "sentence-transformer"

    def test_health_check_response_is_json_object(self):
        response = client.get("/health")
        data = response.json()
        assert isinstance(data, dict)
        assert isinstance(data["status"], str)
        assert isinstance(data["embedding_model"], str)

    def test_health_check_does_not_require_authentication(self):
        # The /health endpoint should not require x-api-key header
        response = client.get("/health")
        assert response.status_code == 200
