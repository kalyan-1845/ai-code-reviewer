import sys
import pytest
from unittest.mock import patch, MagicMock

from embeddings import get_embedding_dimension, embed_text, embed_texts


def make_mock_st():
    """Build a mock sentence_transformers module."""
    mock_st = MagicMock()
    mock_model = MagicMock()
    mock_model.encode = MagicMock(return_value=MagicMock(
        tolist=MagicMock(return_value=[0.1, 0.2, 0.3])
    ))
    mock_model.get_sentence_embedding_dimension = MagicMock(return_value=384)
    mock_st.SentenceTransformer.return_value = mock_model
    return mock_st, mock_model


class TestGetEmbeddingDimension:
    def test_returns_positive_integer(self):
        dim = get_embedding_dimension()
        assert isinstance(dim, int)
        assert dim > 0

    def test_returns_expected_minilm_dimension(self):
        dim = get_embedding_dimension()
        assert dim == 384

    def test_caches_model_instance(self):
        mock_st, mock_model = make_mock_st()
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            r1 = embeddings.get_embedding_dimension()
            r2 = embeddings.get_embedding_dimension()
            assert r1 == r2
            assert mock_st.SentenceTransformer.call_count == 1


class TestEmbedText:
    def test_returns_list_of_floats(self):
        result = embed_text("hello world")
        assert isinstance(result, list)
        assert len(result) > 0
        assert all(isinstance(v, (int, float)) for v in result)

    def test_returns_embedding_of_expected_dimension(self):
        text = "the quick brown fox jumps over the lazy dog"
        result = embed_text(text)
        expected_dim = get_embedding_dimension()
        assert len(result) == expected_dim

    def test_returns_normalized_vector(self):
        result = embed_text("test string")
        magnitude = sum(v * v for v in result) ** 0.5
        assert abs(magnitude - 1.0) < 0.01

    def test_handles_multiline_content(self):
        code = "def hello():\n    print('world')\n    return True"
        result = embed_text(code)
        assert isinstance(result, list)
        assert len(result) == get_embedding_dimension()

    def test_mocked_embed_text_returns_list_of_floats(self):
        mock_st, mock_model = make_mock_st()
        mock_model.encode.return_value = MagicMock(
            tolist=MagicMock(return_value=[0.5, 0.6, 0.7])
        )
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            result = embeddings.embed_text("hello world")
            assert isinstance(result, list)
            assert len(result) == 3
            assert all(isinstance(x, float) for x in result)

    def test_normalizes_embedding(self):
        mock_st, mock_model = make_mock_st()
        mock_model.encode.return_value = MagicMock(
            tolist=MagicMock(return_value=[0.1, 0.2])
        )
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            embeddings.embed_text("test input")
            mock_model.encode.assert_called_once_with(
                "test input", normalize_embeddings=True
            )

    def test_handles_empty_string(self):
        mock_st, mock_model = make_mock_st()
        mock_model.encode.return_value = MagicMock(
            tolist=MagicMock(return_value=[])
        )
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            result = embeddings.embed_text("")
            assert isinstance(result, list)


class TestEmbedTexts:
    def test_returns_list_of_embedding_vectors(self):
        texts = ["hello", "world", "foo bar"]
        result = embed_texts(texts)
        assert isinstance(result, list)
        assert len(result) == 3
        assert all(isinstance(v, list) for v in result)
        assert all(len(v) == get_embedding_dimension() for v in result)

    def test_returns_empty_list_for_empty_input(self):
        result = embed_texts([])
        assert result == []

    def test_batch_consistency_with_single(self):
        single = embed_text("consistent test content")
        batch = embed_texts(["consistent test content"])
        assert len(batch) == 1
        assert batch[0] == single

    def test_different_texts_produce_different_embeddings(self):
        result = embed_texts(["apple", "banana", "car"])
        assert len(result) == 3
        assert result[0] != result[1] or result[1] != result[2]

    def test_mocked_returns_list_of_lists_of_floats(self):
        import numpy as np
        mock_st, mock_model = make_mock_st()
        mock_model.encode.return_value = np.array([[0.1, 0.2], [0.3, 0.4]])
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            result = embeddings.embed_texts(["hello", "world"])
            assert isinstance(result, list)
            assert len(result) == 2
            assert all(isinstance(sub, list) for sub in result)
            assert result[0] == [0.1, 0.2]
            assert result[1] == [0.3, 0.4]

    def test_normalizes_each_embedding(self):
        mock_st, mock_model = make_mock_st()
        mock_model.encode.return_value = MagicMock(
            tolist=MagicMock(return_value=[[0.1], [0.2]])
        )
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            embeddings.embed_texts(["a", "b"])
            mock_model.encode.assert_called_once_with(
                ["a", "b"], normalize_embeddings=True
            )

    def test_single_text_returns_single_list(self):
        import numpy as np
        mock_st, mock_model = make_mock_st()
        mock_model.encode.return_value = np.array([[0.1, 0.2]])
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            result = embeddings.embed_texts(["single text"])
            assert len(result) == 1
            assert result[0] == [0.1, 0.2]

    def test_empty_list_returns_empty_list_mock(self):
        mock_st, mock_model = make_mock_st()
        mock_model.encode.return_value = MagicMock(
            tolist=MagicMock(return_value=[])
        )
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            result = embeddings.embed_texts([])
            assert result == []

    def test_embed_texts_raises_error_on_encode_failure(self):
        mock_st, mock_model = make_mock_st()
        mock_model.encode.side_effect = Exception("API timeout")
        with patch.dict(sys.modules, {"sentence_transformers": mock_st}):
            if "embeddings" in sys.modules:
                del sys.modules["embeddings"]
            import embeddings
            embeddings._model = None
            with pytest.raises(Exception, match="API timeout"):
                embeddings.embed_texts(["test text"])

    def test_embed_text_with_unicode_only_content(self):
        result = embed_text("你好，世界！🌍")
        assert isinstance(result, list)
        assert len(result) == get_embedding_dimension()

    def test_embed_text_with_extremely_long_text(self):
        long_text = "test " * 10000
        result = embed_text(long_text)
        assert isinstance(result, list)
        assert len(result) == get_embedding_dimension()

    def test_embed_texts_with_duplicate_content_is_consistent(self):
        result = embed_texts(["duplicate", "duplicate"])
        assert len(result) == 2
        assert result[0] == result[1]

    def test_embed_texts_single_item_matches_embed_text(self):
        text = "single item comparison"
        single_res = embed_text(text)
        batch_res = embed_texts([text])
        assert len(batch_res) == 1
        assert batch_res[0] == single_res

    def test_embed_texts_handles_none_values(self):
        # Depending on sentence_transformers it might throw or not. 
        # We assume we test that it raises ValueError or similar if None is passed.
        with pytest.raises(Exception):
            embed_texts([None, "test"])
