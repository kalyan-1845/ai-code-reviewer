import pytest
from unittest.mock import patch, MagicMock
import embeddings


class _MockSentenceTransformer:
    """Mock SentenceTransformer that always loads successfully."""
    def __init__(self, model_name):
        self._model_name = model_name
        self._dim = 384

    def get_sentence_embedding_dimension(self):
        return self._dim

    def encode(self, *args, **kwargs):
        # Return a valid mock embedding vector
        return [[0.0] * self._dim]


@pytest.fixture(autouse=True)
def reset_embeddings_state():
    """Reset embeddings module state before and after each test."""
    embeddings._model = None
    embeddings._fallback_active = False
    original_use_st = embeddings._USE_SENTENCE_TRANSFORMER
    embeddings._USE_SENTENCE_TRANSFORMER = True
    yield
    embeddings._model = None
    embeddings._fallback_active = False
    embeddings._USE_SENTENCE_TRANSFORMER = original_use_st


class TestIsFallbackActive:
    """Tests for is_fallback_active function in embeddings.py."""

    def test_returns_false_when_primary_model_loads_successfully(self):
        """When SentenceTransformer loads, fallback should not be active."""
        with patch('embeddings.SentenceTransformer', _MockSentenceTransformer):
            # Trigger model initialization
            embeddings._get_model()
            assert embeddings.is_fallback_active() is False

    def test_returns_true_when_sentence_transformer_is_none(self):
        """When sentence-transformers package is unavailable, fallback is active."""
        with patch('embeddings.SentenceTransformer', None):
            embeddings._model = None
            embeddings._get_model()
            assert embeddings.is_fallback_active() is True

    def test_returns_true_when_model_load_raises_oserror(self):
        """When SentenceTransformer raises OSError, fallback should be active."""
        def raise_oserror(model_name):
            raise OSError("Model file not found")

        with patch('embeddings.SentenceTransformer', side_effect=raise_oserror):
            embeddings._model = None
            embeddings._fallback_active = False
            embeddings._get_model()
            assert embeddings.is_fallback_active() is True

    def test_returns_true_when_model_init_raises_generic_exception(self):
        """When SentenceTransformer raises any other exception, fallback should be active."""
        def raise_error(model_name):
            raise RuntimeError("Unexpected initialization error")

        with patch('embeddings.SentenceTransformer', side_effect=raise_error):
            embeddings._model = None
            embeddings._fallback_active = False
            embeddings._get_model()
            assert embeddings.is_fallback_active() is True

    def test_flag_persists_across_multiple_calls(self):
        """The fallback flag should remain stable across multiple is_fallback_active calls."""
        with patch('embeddings.SentenceTransformer', None):
            embeddings._model = None
            embeddings._get_model()
            # Call multiple times
            result1 = embeddings.is_fallback_active()
            result2 = embeddings.is_fallback_active()
            result3 = embeddings.is_fallback_active()
            assert result1 is True
            assert result2 is True
            assert result3 is True
            assert result1 is result2 is result3

    def test_flag_starts_false_before_model_init(self):
        """Before _get_model() is called, fallback_active should be False (module default)."""
        embeddings._model = None
        embeddings._fallback_active = False
        assert embeddings.is_fallback_active() is False

    def test_model_not_reinitialized_after_first_call(self):
        """After _get_model() is called, calling it again should not reinitialize."""
        with patch('embeddings.SentenceTransformer', _MockSentenceTransformer):
            embeddings._model = None
            model1 = embeddings._get_model()
            model2 = embeddings._get_model()
            assert model1 is model2
            assert embeddings.is_fallback_active() is False

    def test_fallback_flag_set_correctly_after_manual_reset(self):
        """Manually setting _fallback_active should be reflected by is_fallback_active."""
        embeddings._fallback_active = True
        assert embeddings.is_fallback_active() is True
        embeddings._fallback_active = False
        assert embeddings.is_fallback_active() is False
