import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from services.secret_scrubber import scrub_secrets
from nodes.secret_scrubber_node import secret_scrubber_node
from graphs.review_pipeline import build_review_pipeline
from src.graph.state import AgentState


def test_aws_key_redacted():
    content = "AWS_SECRET_ID = 'AKIA1234567890ABCDEF'"
    sanitized, secrets = scrub_secrets(content)
    assert "[REDACTED_AWS_KEY]" in sanitized
    assert "AKIA1234567890ABCDEF" not in sanitized
    assert "AWS_KEY" in secrets


def test_rsa_private_key_masked():
    content = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
    sanitized, secrets = scrub_secrets(content)
    assert "[REDACTED_PRIVATE_KEY]" in sanitized
    assert "-----BEGIN RSA PRIVATE KEY-----" not in sanitized
    assert "RSA_PRIVATE_KEY" in secrets


def test_clean_code_diff_unmodified():
    diff = "diff --git a/main.py b/main.py\n+def add(a, b):\n+    return a + b"
    sanitized, secrets = scrub_secrets(diff)
    assert sanitized == diff
    assert secrets == []


def test_api_key_redacted():
    content = 'api_key = "abc1234567890abcdef123"'
    sanitized, secrets = scrub_secrets(content)
    assert '[REDACTED_API_KEY]' in sanitized
    assert 'abc1234567890abcdef123' not in sanitized
    assert "API_KEY" in secrets


def test_database_uri_redacted():
    content = "DATABASE_URL = 'postgres://admin:secretpassword123@localhost:5432/mydb'"
    sanitized, secrets = scrub_secrets(content)
    assert "postgres://admin:[REDACTED_DB_PASSWORD]@" in sanitized
    assert "secretpassword123" not in sanitized
    assert "DB_PASSWORD" in secrets


def test_secret_scrubber_node_integration():
    state: AgentState = {
        "raw_diff": "diff --git a/config.py b/config.py\n+AWS_KEY = 'AKIA1234567890ABCDEF'",
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    result = secret_scrubber_node(state)
    assert "[REDACTED_AWS_KEY]" in result["raw_diff"]
    assert result["has_leaked_secrets"] is True
    assert "AWS_KEY" in result["detected_secrets"]
    assert "SECURITY ALERT" in result["security_alert"]


def test_review_pipeline_execution():
    pipeline = build_review_pipeline()
    initial_state: AgentState = {
        "raw_diff": "diff --git a/env.py b/env.py\n+AKIA1234567890ABCDEF\n+db = postgres://user:secret@localhost:5432/db",
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": ""
    }
    output = pipeline.invoke(initial_state)
    assert "final_review" in output
    assert output["has_leaked_secrets"] is True
    assert "[REDACTED_AWS_KEY]" in output["raw_diff"]
