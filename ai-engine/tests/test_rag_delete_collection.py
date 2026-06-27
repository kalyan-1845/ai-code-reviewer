import pytest
from unittest.mock import MagicMock, patch


class TestCollectionName:
    """Unit tests for the _collection_name helper in rag.py."""

    def test_returns_base_name_when_repo_url_is_none(self):
        from rag import _collection_name
        result = _collection_name(None)
        assert result == "reposage_code_chunks"

    def test_returns_base_name_when_repo_url_is_empty_string(self):
        from rag import _collection_name
        result = _collection_name("")
        assert result == "reposage_code_chunks"

    def test_returns_namespaced_name_when_repo_url_provided(self):
        from rag import _collection_name
        result = _collection_name("https://github.com/example/repo")
        assert result.startswith("reposage_code_chunks_")
        assert len(result) == len("reposage_code_chunks_") + 12

    def test_same_repo_url_produces_same_namespaced_name(self):
        from rag import _collection_name
        url = "https://github.com/owner/my-project"
        name1 = _collection_name(url)
        name2 = _collection_name(url)
        assert name1 == name2

    def test_different_repo_urls_produce_different_names(self):
        from rag import _collection_name
        name1 = _collection_name("https://github.com/a/repo")
        name2 = _collection_name("https://github.com/b/repo")
        assert name1 != name2

    def test_namespaced_name_contains_only_hex_suffix(self):
        from rag import _collection_name
        result = _collection_name("https://github.com/test/repo")
        suffix = result.split("_")[-1]
        assert len(suffix) == 12
        assert all(c in "0123456789abcdef" for c in suffix)


class TestDeleteCollection:
    """Unit tests for the delete_collection function in rag.py."""

    @patch("rag._get_client")
    @patch("rag._collection_name")
    def test_deletes_correct_collection_when_it_exists(self, mock_col_name, mock_get_client):
        from rag import delete_collection

        mock_col_name.return_value = "reposage_code_chunks_abc123"
        mock_client_instance = MagicMock()
        mock_get_client.return_value = mock_client_instance

        result = delete_collection("https://github.com/example/repo")

        mock_client_instance.delete_collection.assert_called_once_with("reposage_code_chunks_abc123")
        assert result is True

    @patch("rag._get_client")
    @patch("rag._collection_name")
    def test_returns_false_when_collection_does_not_exist(self, mock_col_name, mock_get_client):
        from rag import delete_collection

        mock_col_name.return_value = "reposage_code_chunks_nonexistent"
        mock_client_instance = MagicMock()
        mock_client_instance.delete_collection.side_effect = ValueError("Collection not found")
        mock_get_client.return_value = mock_client_instance

        result = delete_collection("https://github.com/nonexistent/repo")

        assert result is False

    @patch("rag._get_client")
    @patch("rag._collection_name")
    def test_calls_get_client_and_collection_name(self, mock_col_name, mock_get_client):
        from rag import delete_collection

        mock_col_name.return_value = "reposage_code_chunks_xyz789"
        mock_client_instance = MagicMock()
        mock_get_client.return_value = mock_client_instance

        delete_collection("https://github.com/test/repo")

        mock_col_name.assert_called_once_with("https://github.com/test/repo")
        mock_get_client.assert_called_once()
        mock_client_instance.delete_collection.assert_called_once_with("reposage_code_chunks_xyz789")

    @patch("rag._get_client")
    @patch("rag._collection_name")
    def test_delete_collection_idempotent_when_already_deleted(self, mock_col_name, mock_get_client):
        from rag import delete_collection

        mock_col_name.return_value = "reposage_code_chunks_deleted"
        mock_client_instance = MagicMock()
        mock_client_instance.delete_collection.side_effect = ValueError("does not exist")
        mock_get_client.return_value = mock_client_instance

        result = delete_collection("https://github.com/already/deleted")

        assert result is False
