"""
Regression tests for issue #3581: RAG cross-tenant isolation.

The vector store must be namespaced per tenant (x-client-id). A tenant can never
address, query, or modify another tenant's collection — even when both tenants
ingest the same repo_url. These tests lock in:
  1. per-tenant collection naming (stable per tenant, distinct across tenants),
  2. tenant forwarding through the rag helper functions, and
  3. the x-client-id requirement and forwarding at the HTTP endpoint layer.
"""
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app import app

client = TestClient(app, headers={"x-api-key": "test-ai-engine-key"})


class TestCollectionNameIsolation:
    def test_distinct_collections_for_different_tenants(self):
        from rag import _collection_name
        repo_url = "https://github.com/acme/app"
        name_tenant_a = _collection_name(repo_url, tenant_id="tenant-a")
        name_tenant_b = _collection_name(repo_url, tenant_id="tenant-b")
        assert name_tenant_a != name_tenant_b

    def test_same_tenant_same_repo_is_stable(self):
        from rag import _collection_name
        repo_url = "https://github.com/acme/app"
        assert _collection_name(repo_url, tenant_id="tenant-a") == _collection_name(
            repo_url, tenant_id="tenant-a"
        )

    def test_tenant_scoped_collection_differs_from_unscoped(self):
        from rag import _collection_name
        repo_url = "https://github.com/acme/app"
        assert _collection_name(repo_url, tenant_id="tenant-a") != _collection_name(repo_url)

    def test_different_repos_same_tenant_still_isolated(self):
        from rag import _collection_name
        assert _collection_name("https://github.com/a/x", tenant_id="t") != _collection_name(
            "https://github.com/b/y", tenant_id="t"
        )


class TestRagHelperTenantForwarding:
    def test_query_chunks_forwards_tenant_id_to_collection(self):
        import rag
        mock_collection = MagicMock()
        mock_collection.count.return_value = 0
        with patch("rag._get_collection", return_value=mock_collection) as mock_get:
            rag.query_chunks("question", repo_url="https://github.com/a/x", tenant_id="tenant-a")
            mock_get.assert_called_once()
            assert mock_get.call_args.kwargs.get("tenant_id") == "tenant-a"

    def test_upsert_chunks_forwards_tenant_id_to_collection(self):
        import rag
        mock_collection = MagicMock()
        with patch("rag._get_collection", return_value=mock_collection) as mock_get, \
             patch("rag.embed_texts", return_value=[[0.1] * 8]):
            rag.upsert_chunks(
                ["def f(): pass"], [{"source_file": "f.py"}], ["f.py-0"],
                repo_url="https://github.com/a/x", tenant_id="tenant-a",
            )
            mock_get.assert_called_once()
            assert mock_get.call_args.kwargs.get("tenant_id") == "tenant-a"

    def test_stats_include_tenant_scoped_collection_name(self):
        import rag
        mock_collection = MagicMock()
        mock_collection.count.return_value = 3
        with patch("rag._get_collection", return_value=mock_collection), \
             patch("rag._collection_name") as mock_name:
            rag.get_collection_stats(repo_url="https://github.com/a/x", tenant_id="tenant-a")
            assert mock_name.call_args.kwargs.get("tenant_id") == "tenant-a"


class TestRagEndpointTenantScoping:
    def test_query_without_client_id_is_rejected(self):
        response = client.post("/api/rag/query", json={"question": "hi"})
        assert response.status_code == 422

    def test_chunks_without_client_id_is_rejected(self):
        response = client.post("/api/rag/chunks", json={"limit": 10, "offset": 0})
        assert response.status_code == 422

    def test_ingest_requires_client_id(self):
        import app as app_module
        from app import verify_rag_ingest_key
        original = getattr(app_module, "X_RAG_INGEST_KEY", None)
        try:
            app_module.X_RAG_INGEST_KEY = "ingest-secret"
            response = TestClient(app, headers={"x-rag-ingest-key": "ingest-secret"}).post(
                "/api/rag/ingest",
                json={"repo_url": "https://github.com/a/x", "chunks": [{"chunk_id": "c", "content": "x"}]},
            )
            assert response.status_code == 422
        finally:
            app_module.X_RAG_INGEST_KEY = original

    def test_query_forwards_requested_client_id(self):
        import rag
        with patch("rag.query_chunks", return_value=[]) as mock_query:
            resp_a = client.post(
                "/api/rag/query",
                json={"question": "hello", "repo_url": "https://github.com/a/x"},
                headers={"x-client-id": "tenant-a"},
            )
            resp_b = client.post(
                "/api/rag/query",
                json={"question": "hello", "repo_url": "https://github.com/a/x"},
                headers={"x-client-id": "tenant-b"},
            )
            assert resp_a.status_code == 200
            assert resp_b.status_code == 200
            assert mock_query.call_count == 2
            tenant_ids = [call.kwargs.get("tenant_id") for call in mock_query.call_args_list]
            assert tenant_ids == ["tenant-a", "tenant-b"]

    def test_chunks_forwards_requested_client_id(self):
        import rag
        with patch("rag.get_chunks_paginated", return_value=[]), \
             patch("rag.get_collection_stats", return_value={"chunk_count": 0}) as mock_stats:
            client.post(
                "/api/rag/chunks",
                json={"repo_url": "https://github.com/a/x"},
                headers={"x-client-id": "tenant-a"},
            )
            assert mock_stats.call_args.kwargs.get("tenant_id") == "tenant-a"
