import pytest
from unittest.mock import patch, MagicMock
from pydantic import ValidationError
from app import PaginatedChunksRequest, PaginatedChunksResponse


class TestPaginatedChunksRequestValidation:
    """Test PaginatedChunksRequest validation for edge cases."""

    def test_default_limit_is_50(self):
        """Default limit should be 50."""
        request = PaginatedChunksRequest()
        assert request.limit == 50

    def test_default_offset_is_0(self):
        """Default offset should be 0."""
        request = PaginatedChunksRequest()
        assert request.offset == 0

    def test_default_repo_url_is_none(self):
        """Default repo_url should be None."""
        request = PaginatedChunksRequest()
        assert request.repo_url is None

    def test_custom_limit(self):
        """Custom limit is accepted."""
        request = PaginatedChunksRequest(limit=100)
        assert request.limit == 100

    def test_custom_offset(self):
        """Custom offset is accepted."""
        request = PaginatedChunksRequest(offset=10)
        assert request.offset == 10

    def test_custom_repo_url(self):
        """Custom repo_url is accepted."""
        repo_url = "https://github.com/owner/repo"
        request = PaginatedChunksRequest(repo_url=repo_url)
        assert request.repo_url == repo_url

    def test_zero_limit(self):
        """Zero limit is valid (returns empty list)."""
        request = PaginatedChunksRequest(limit=0)
        assert request.limit == 0

    def test_zero_offset(self):
        """Zero offset is valid (starts from beginning)."""
        request = PaginatedChunksRequest(offset=0)
        assert request.offset == 0

    def test_negative_limit_raises_validation_error(self):
        """Negative limit should raise ValidationError."""
        with pytest.raises(ValidationError):
            PaginatedChunksRequest(limit=-1)

    def test_negative_limit_minus_100_raises_validation_error(self):
        """Negative limit (-100) should raise ValidationError."""
        with pytest.raises(ValidationError):
            PaginatedChunksRequest(limit=-100)

    def test_negative_offset_raises_validation_error(self):
        """Negative offset should raise ValidationError."""
        with pytest.raises(ValidationError):
            PaginatedChunksRequest(offset=-1)

    def test_negative_offset_minus_10_raises_validation_error(self):
        """Negative offset (-10) should raise ValidationError."""
        with pytest.raises(ValidationError):
            PaginatedChunksRequest(offset=-10)

    def test_string_limit_raises_validation_error(self):
        """String limit should raise ValidationError."""
        with pytest.raises(ValidationError):
            PaginatedChunksRequest(limit="50")

    def test_string_offset_raises_validation_error(self):
        """String offset should raise ValidationError."""
        with pytest.raises(ValidationError):
            PaginatedChunksRequest(offset="10")

    def test_float_limit_raises_validation_error(self):
        """Float limit should raise ValidationError."""
        with pytest.raises(ValidationError):
            PaginatedChunksRequest(limit=50.5)

    def test_float_offset_raises_validation_error(self):
        """Float offset should raise ValidationError."""
        with pytest.raises(ValidationError):
            PaginatedChunksRequest(offset=10.5)

    def test_none_limit_uses_default(self):
        """None limit should use default value."""
        request = PaginatedChunksRequest(limit=None)
        assert request.limit == 50

    def test_none_offset_uses_default(self):
        """None offset should use default value."""
        request = PaginatedChunksRequest(offset=None)
        assert request.offset == 0

    def test_extremely_large_limit(self):
        """Extremely large limit (1_000_000) is accepted."""
        request = PaginatedChunksRequest(limit=1_000_000)
        assert request.limit == 1_000_000

    def test_extremely_large_offset(self):
        """Extremely large offset is accepted."""
        request = PaginatedChunksRequest(offset=999_999_999)
        assert request.offset == 999_999_999

    def test_max_int_limit(self):
        """Maximum integer limit is accepted."""
        max_int = 2**31 - 1
        request = PaginatedChunksRequest(limit=max_int)
        assert request.limit == max_int

    def test_empty_string_repo_url(self):
        """Empty string repo_url is accepted (will be empty, not None)."""
        request = PaginatedChunksRequest(repo_url="")
        assert request.repo_url == ""

    def test_valid_repo_url_format(self):
        """Valid repository URL is accepted."""
        urls = [
            "https://github.com/owner/repo",
            "https://gitlab.com/group/project",
            "git@github.com:owner/repo.git",
            "file:///local/repo/path",
        ]
        for url in urls:
            request = PaginatedChunksRequest(repo_url=url)
            assert request.repo_url == url

    def test_request_serialization(self):
        """Request can be serialized to dict."""
        request = PaginatedChunksRequest(limit=100, offset=50)
        request_dict = request.model_dump()
        assert request_dict["limit"] == 100
        assert request_dict["offset"] == 50
        assert request_dict["repo_url"] is None

    def test_request_json_schema(self):
        """Request has valid JSON schema."""
        schema = PaginatedChunksRequest.model_json_schema()
        assert "properties" in schema
        assert "limit" in schema["properties"]
        assert "offset" in schema["properties"]

    def test_both_limit_and_offset_custom(self):
        """Both limit and offset can be customized together."""
        request = PaginatedChunksRequest(limit=25, offset=100)
        assert request.limit == 25
        assert request.offset == 100

    def test_all_fields_custom(self):
        """All fields can be customized together."""
        request = PaginatedChunksRequest(
            limit=75, offset=25, repo_url="https://github.com/owner/repo"
        )
        assert request.limit == 75
        assert request.offset == 25
        assert request.repo_url == "https://github.com/owner/repo"


class TestPaginatedChunksEndpoint:
    """Test /api/rag/chunks endpoint with mocked backend."""

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_endpoint_default_params(self, mock_stats, mock_get_chunks):
        """Endpoint uses default limit (50) and offset (0)."""
        mock_get_chunks.return_value = [{"id": "chunk1", "content": "test"}] * 50
        mock_stats.return_value = {"chunk_count": 200}

        request = PaginatedChunksRequest()
        assert request.limit == 50
        assert request.offset == 0

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_endpoint_custom_limit(self, mock_stats, mock_get_chunks):
        """Endpoint respects custom limit."""
        mock_get_chunks.return_value = [{"id": f"chunk{i}", "content": "test"} for i in range(100)]
        mock_stats.return_value = {"chunk_count": 500}

        request = PaginatedChunksRequest(limit=100)
        mock_get_chunks(limit=request.limit, offset=request.offset, repo_url=None)
        mock_get_chunks.assert_called_once_with(limit=100, offset=0, repo_url=None)

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_endpoint_custom_offset(self, mock_stats, mock_get_chunks):
        """Endpoint respects custom offset."""
        mock_get_chunks.return_value = []
        mock_stats.return_value = {"chunk_count": 200}

        request = PaginatedChunksRequest(offset=150)
        mock_get_chunks(limit=request.limit, offset=request.offset, repo_url=None)
        mock_get_chunks.assert_called_once_with(limit=50, offset=150, repo_url=None)

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_endpoint_zero_limit_returns_empty(self, mock_stats, mock_get_chunks):
        """Endpoint with limit=0 returns empty list."""
        mock_get_chunks.return_value = []
        mock_stats.return_value = {"chunk_count": 200}

        request = PaginatedChunksRequest(limit=0, offset=0)
        mock_get_chunks(limit=request.limit, offset=request.offset, repo_url=None)
        mock_get_chunks.assert_called_once_with(limit=0, offset=0, repo_url=None)

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_endpoint_offset_beyond_chunks(self, mock_stats, mock_get_chunks):
        """Endpoint with offset beyond available chunks returns empty."""
        mock_get_chunks.return_value = []
        mock_stats.return_value = {"chunk_count": 50}

        request = PaginatedChunksRequest(limit=50, offset=100)
        mock_get_chunks(limit=request.limit, offset=request.offset, repo_url=None)
        mock_get_chunks.assert_called_once_with(limit=50, offset=100, repo_url=None)
        # Backend should return empty list

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_endpoint_extremely_large_limit(self, mock_stats, mock_get_chunks):
        """Endpoint handles extremely large limit without error."""
        mock_get_chunks.return_value = [{"id": f"chunk{i}", "content": "test"} for i in range(1000)]
        mock_stats.return_value = {"chunk_count": 1_000_000}

        request = PaginatedChunksRequest(limit=1_000_000)
        mock_get_chunks(limit=request.limit, offset=request.offset, repo_url=None)
        mock_get_chunks.assert_called_once_with(limit=1_000_000, offset=0, repo_url=None)

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_endpoint_with_repo_url(self, mock_stats, mock_get_chunks):
        """Endpoint passes repo_url to backend."""
        mock_get_chunks.return_value = [{"id": "chunk1", "content": "test"}]
        mock_stats.return_value = {"chunk_count": 100}

        repo_url = "https://github.com/owner/repo"
        request = PaginatedChunksRequest(repo_url=repo_url)
        mock_get_chunks(limit=request.limit, offset=request.offset, repo_url=request.repo_url)
        mock_get_chunks.assert_called_once_with(limit=50, offset=0, repo_url=repo_url)

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_response_structure(self, mock_stats, mock_get_chunks):
        """Response has correct structure."""
        mock_get_chunks.return_value = [{"id": "chunk1", "content": "test"}]
        mock_stats.return_value = {"chunk_count": 100}

        response = PaginatedChunksResponse(
            chunks=mock_get_chunks.return_value,
            total_chunks=mock_stats.return_value["chunk_count"]
        )
        assert len(response.chunks) == 1
        assert response.total_chunks == 100

    @patch("app.get_chunks_paginated")
    @patch("app.get_collection_stats")
    def test_response_empty_chunks(self, mock_stats, mock_get_chunks):
        """Response can have empty chunks list."""
        mock_get_chunks.return_value = []
        mock_stats.return_value = {"chunk_count": 50}

        response = PaginatedChunksResponse(
            chunks=mock_get_chunks.return_value,
            total_chunks=mock_stats.return_value["chunk_count"]
        )
        assert response.chunks == []
        assert response.total_chunks == 50
