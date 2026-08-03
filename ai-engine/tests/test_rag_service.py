import sys, os
sub_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if sub_dir not in sys.path: sys.path.insert(0, sub_dir)
if root_dir not in sys.path: sys.path.insert(0, root_dir)

import pytest
from unittest.mock import patch, MagicMock
from services.rag_service import (
    add_historical_pr,
    retrieve_historical_context,
    get_historical_prs_collection,
    _client
)


class TestRAGService:
    @pytest.fixture(autouse=True)
    def reset_collection(self):
        try:
            _client.delete_collection("historical_prs")
        except Exception:
            pass
        yield
        try:
            _client.delete_collection("historical_prs")
        except Exception:
            pass

    def test_retrieve_historical_context_empty_db(self):
        with patch("services.rag_service.embed_texts", return_value=[[0.1] * 384]):
            result = retrieve_historical_context("diff --git a/foo.py b/foo.py")
            assert result == ""

    def test_retrieve_historical_context_empty_query(self):
        result = retrieve_historical_context("")
        assert result == ""
        result_ws = retrieve_historical_context("   ")
        assert result_ws == ""

    def test_add_and_retrieve_mock_pr(self):
        dummy_vector = [[0.1] * 384]
        with patch("services.rag_service.embed_texts", return_value=dummy_vector):
            mock_pr_doc = (
                "PR #101: Maintainers rejected using raw SQL queries. "
                "Always use ORM parameterization for database queries."
            )
            doc_id = add_historical_pr(
                document=mock_pr_doc,
                metadata={"pr_id": 101, "author": "maintainer"},
                doc_id="pr-101"
            )
            assert doc_id == "pr-101"

            query = "diff --git a/db.py b/db.py\n+cursor.execute(f'SELECT * FROM users WHERE id={user_id}')"
            context = retrieve_historical_context(query, n_results=1)

            assert "Historical Repository Conventions & Past Decisions:" in context
            assert "PR #101" in context
            assert "Always use ORM parameterization" in context

    def test_retrieve_historical_context_handles_exception_gracefully(self):
        with patch("services.rag_service.get_historical_prs_collection") as mock_get_coll:
            mock_coll = MagicMock()
            mock_coll.count.side_effect = Exception("DB error")
            mock_get_coll.return_value = mock_coll

            result = retrieve_historical_context("some query")
            assert result == ""
