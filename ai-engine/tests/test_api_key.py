import pytest
from fastapi import HTTPException
from app import verify_api_key

def clear_keys(monkeypatch):
    monkeypatch.delenv("REPOSAGE_API_KEY", raising=False)
    monkeypatch.delenv("AI_ENGINE_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)

def set_key(monkeypatch, val):
    clear_keys(monkeypatch)
    monkeypatch.setenv("API_KEY", val)

def test_verify_api_key_does_not_raise_when_api_key_not_configured(monkeypatch):
    clear_keys(monkeypatch)
    verify_api_key(x_api_key=None)
    verify_api_key(x_api_key="any-value")

def test_verify_api_key_accepts_matching_key(monkeypatch):
    set_key(monkeypatch, "my-secret-key")
    verify_api_key(x_api_key="my-secret-key")

def test_verify_api_key_raises_401_on_mismatch(monkeypatch):
    set_key(monkeypatch, "my-secret-key")
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key(x_api_key="wrong-key")
    assert exc_info.value.status_code == 401
    assert "Invalid API Key" in exc_info.value.detail

def test_verify_api_key_raises_401_on_none_when_key_is_configured(monkeypatch):
    set_key(monkeypatch, "my-secret-key")
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key(x_api_key=None)
    assert exc_info.value.status_code == 401

def test_verify_api_key_raises_401_on_empty_string_when_key_is_configured(monkeypatch):
    set_key(monkeypatch, "my-secret-key")
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key(x_api_key="")
    assert exc_info.value.status_code == 401

def test_verify_api_key_accepts_key_when_api_key_env_is_empty_string(monkeypatch):
    set_key(monkeypatch, "")
    verify_api_key(x_api_key=None)
    verify_api_key(x_api_key="any-value")
