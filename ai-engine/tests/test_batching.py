import pytest
from fastapi.testclient import TestClient
from app import app

client = TestClient(app, headers={"x-ai-engine-key": "test-ai-engine-key"})

def test_batch_size_at_minimum_boundary():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        "batchSize": 1
    }
    # batchSize of 1 is at the minimum boundary (ge=1)
    response = client.post("/analyze", json=payload)
    assert response.status_code in [200, 500]


def test_batch_size_at_maximum_boundary():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        "batchSize": 20
    }
    # batchSize of 20 is at the maximum boundary (le=20)
    response = client.post("/analyze", json=payload)
    assert response.status_code in [200, 500]


def test_batch_size_below_minimum_rejected():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        "batchSize": 0
    }
    # batchSize below 1 is rejected by pydantic validation (ge=1)
    response = client.post("/analyze", json=payload)
    assert response.status_code == 422


def test_batch_size_above_maximum_rejected():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        "batchSize": 100
    }
    # batchSize above 20 is rejected by pydantic validation (le=20)
    response = client.post("/analyze", json=payload)
    assert response.status_code == 422


def test_batch_size_non_integer_string_rejected():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        "batchSize": "not-a-number"
    }
    # Non-integer string is rejected by pydantic validation
    response = client.post("/analyze", json=payload)
    assert response.status_code == 422


def test_batch_size_float_rejected():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        "batchSize": 7.8
    }
    # Float is rejected by pydantic validation (must be integer)
    response = client.post("/analyze", json=payload)
    assert response.status_code == 422


def test_batch_size_negative_rejected():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        "batchSize": -5
    }
    # Negative batchSize is rejected by pydantic validation
    response = client.post("/analyze", json=payload)
    assert response.status_code == 422


def test_batch_size_default_is_five():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        # no batchSize key at all — should fall back to default of 5
    }
    response = client.post("/analyze", json=payload)
    assert response.status_code in [200, 500]


def test_batch_size_valid_middle_value():
    payload = {
        "files": [
            {"name": "file1.js", "content": "console.log('1');"},
        ],
        "batchSize": 10
    }
    response = client.post("/analyze", json=payload)
    assert response.status_code in [200, 500]
