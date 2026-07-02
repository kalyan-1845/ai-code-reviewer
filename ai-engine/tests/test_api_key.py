import pytest
from fastapi import HTTPException
from app import verify_api_key


def test_verify_api_key_does_not_raise_when_api_key_not_configured(monkeypatch):
    """When API_KEY is not set in the environment, any key (or no key) is accepted."""
    monkeypatch.delenv("API_KEY", raising=False)
    # Should not raise
    verify_api_key(x_api_key=None)
    verify_api_key(x_api_key="any-value")


def test_verify_api_key_accepts_matching_key(monkeypatch):
    """When API_KEY matches x_api_key, no exception is raised."""
    monkeypatch.setenv("API_KEY", "my-secret-key")
    # Should not raise
    verify_api_key(x_api_key="my-secret-key")


def test_verify_api_key_raises_401_on_mismatch(monkeypatch):
    """When API_KEY is set and x_api_key does not match, HTTPException 401 is raised."""
    monkeypatch.setenv("API_KEY", "my-secret-key")
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key(x_api_key="wrong-key")
    assert exc_info.value.status_code == 401
    assert "Invalid API Key" in exc_info.value.detail


def test_verify_api_key_raises_401_on_none_when_key_is_configured(monkeypatch):
    """When API_KEY is set but x_api_key is None, 401 is raised."""
    monkeypatch.setenv("API_KEY", "my-secret-key")
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key(x_api_key=None)
    assert exc_info.value.status_code == 401


def test_verify_api_key_raises_401_on_empty_string_when_key_is_configured(monkeypatch):
    """When API_KEY is set but x_api_key is empty string, 401 is raised."""
    monkeypatch.setenv("API_KEY", "my-secret-key")
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key(x_api_key="")
    assert exc_info.value.status_code == 401


def test_verify_api_key_accepts_key_when_api_key_env_is_empty_string(monkeypatch):
    """When API_KEY is set to empty string in env, the key is considered not configured."""
    monkeypatch.setenv("API_KEY", "")
    # Should not raise because empty string is falsy -> "not expected_key"
    verify_api_key(x_api_key=None)
    verify_api_key(x_api_key="any-value")
