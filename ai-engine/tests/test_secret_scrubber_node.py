import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from nodes.secret_scrubber_node import secret_scrubber_node


class TestSecretScrubberNode:
    """Unit tests for secret_scrubber_node LangGraph node."""

    def test_returns_required_state_keys(self):
        """Node should return all required state keys."""
        state = {"raw_diff": ""}
        result = secret_scrubber_node(state)
        assert "raw_diff" in result
        assert "detected_secrets" in result
        assert "has_leaked_secrets" in result
        assert "security_alert" in result

    def test_empty_diff_no_secrets(self):
        """Empty diff should result in no detected secrets."""
        state = {"raw_diff": ""}
        result = secret_scrubber_node(state)
        assert result["detected_secrets"] == []
        assert result["has_leaked_secrets"] is False
        assert result["security_alert"] is None

    def test_clean_diff_no_secrets(self):
        """Diff without secrets should not trigger alerts."""
        state = {"raw_diff": "diff --git a/src/index.js b/src/index.js\n+const x = 1;"}
        result = secret_scrubber_node(state)
        assert result["detected_secrets"] == []
        assert result["has_leaked_secrets"] is False
        assert result["security_alert"] is None
        assert "[REDACTED" not in result["raw_diff"]

    def test_aws_key_detected_in_raw_diff(self):
        """AWS key in raw_diff should be detected and redacted."""
        state = {
            "raw_diff": "+AKIAIOSFODNN7EXAMPLE\n+console.log('hello');"
        }
        result = secret_scrubber_node(state)
        assert "AWS_KEY" in result["detected_secrets"]
        assert result["has_leaked_secrets"] is True
        assert result["security_alert"] is not None
        assert "AKIAIOSFODNN7EXAMPLE" not in result["raw_diff"]
        assert "[REDACTED_AWS_KEY]" in result["raw_diff"]

    def test_rsa_key_detected_in_raw_diff(self):
        """RSA private key in raw_diff should be detected and redacted."""
        raw_diff = "+-----BEGIN RSA PRIVATE KEY-----\n+MIIBOgIBAAJBAL\n+-----END RSA PRIVATE KEY-----"
        state = {"raw_diff": raw_diff}
        result = secret_scrubber_node(state)
        assert "RSA_PRIVATE_KEY" in result["detected_secrets"]
        assert result["has_leaked_secrets"] is True
        assert result["security_alert"] is not None

    def test_api_key_detected_in_raw_diff(self):
        """API key pattern in raw_diff should be detected and redacted."""
        state = {
            "raw_diff": '+api_key = \"sk-abcdefghij1234567890\";'
        }
        result = secret_scrubber_node(state)
        assert "API_KEY" in result["detected_secrets"]
        assert result["has_leaked_secrets"] is True
        assert result["security_alert"] is not None

    def test_db_password_detected_in_raw_diff(self):
        """Database URI with password in raw_diff should be detected and redacted."""
        state = {
            "raw_diff": "+DATABASE_URL=postgres://user:secretpass@localhost/db"
        }
        result = secret_scrubber_node(state)
        assert "DB_PASSWORD" in result["detected_secrets"]
        assert result["has_leaked_secrets"] is True
        assert result["security_alert"] is not None
        assert "secretpass" not in result["raw_diff"]

    def test_secrets_in_chunks_only(self):
        """Secrets appearing only in chunks should be detected and sanitized."""
        state = {
            "raw_diff": "+console.log('hello');",
            "chunks": [
                "+AKIAIOSFODNN7EXAMPLE",
                "+const x = 1;"
            ]
        }
        result = secret_scrubber_node(state)
        assert "AWS_KEY" in result["detected_secrets"]
        assert result["has_leaked_secrets"] is True
        assert result["security_alert"] is not None
        assert "chunks" in result
        assert "[REDACTED_AWS_KEY]" in result["chunks"][0]
        assert "AKIAIOSFODNN7EXAMPLE" not in result["chunks"][0]

    def test_secrets_in_both_diff_and_chunks_deduplicates(self):
        """Same secret in both raw_diff and chunks should appear only once."""
        state = {
            "raw_diff": "+AKIAIOSFODNN7EXAMPLE",
            "chunks": ["+AKIAIOSFODNN7EXAMPLE"]
        }
        result = secret_scrubber_node(state)
        # Should only appear once (deduplicated in the aggregation logic)
        assert result["detected_secrets"].count("AWS_KEY") == 1

    def test_multiple_different_secrets(self):
        """Multiple different secret types should all be detected."""
        state = {
            "raw_diff": "+AKIAIOSFODNN7EXAMPLE\n+DATABASE_URL=postgres://user:pass123@localhost/db"
        }
        result = secret_scrubber_node(state)
        assert "AWS_KEY" in result["detected_secrets"]
        assert "DB_PASSWORD" in result["detected_secrets"]
        assert len(result["detected_secrets"]) == 2

    def test_security_alert_contains_secret_types(self):
        """Security alert should mention detected secret types."""
        state = {
            "raw_diff": "+AKIAIOSFODNN7EXAMPLE\n+DATABASE_URL=postgres://user:pass123@localhost/db"
        }
        result = secret_scrubber_node(state)
        assert result["security_alert"] is not None
        alert = result["security_alert"]
        assert "SECURITY ALERT" in alert or "secrets detected" in alert.lower()

    def test_empty_chunks_omitted_from_result(self):
        """If chunks is empty, it should not be included in result."""
        state = {
            "raw_diff": "+console.log('hello');",
            "chunks": []
        }
        result = secret_scrubber_node(state)
        # Empty chunks should not appear in result
        assert result.get("chunks") is None

    def test_missing_raw_diff_key(self):
        """Node should handle missing raw_diff key gracefully."""
        state = {}
        result = secret_scrubber_node(state)
        assert result["raw_diff"] == ""
        assert result["detected_secrets"] == []
        assert result["has_leaked_secrets"] is False
