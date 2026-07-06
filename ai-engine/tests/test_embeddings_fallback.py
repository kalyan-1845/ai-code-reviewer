import pytest
from unittest.mock import patch, MagicMock
import embeddings


class _MockSentenceTransformer:
    def __init__(self, model_name):
        self._model_name = model_name
        self._dim = 384

    def get_sentence_embedding_dimension(self):
        return self._dim

    def encode(self, *args, **kwargs):
        import numpy as np
        return np.array([[0.1] * self._dim])


@pytest.fixture(autouse=True)
def reset_model():
    """Reset the module-level model and fallback state before each test."""
    embeddings._model = None
    embeddings._fallback_active = False
    yield
    embeddings._model = None
    embeddings._fallback_active = False


@pytest.fixture
def mock_st_success():
    """Mock SentenceTransformer loading successfully."""
    with patch('embeddings.SentenceTransformer', _MockSentenceTransformer):
        yield


@pytest.fixture
def mock_st_failure():
    """Mock SentenceTransformer failing to load (OSError triggers fallback)."""
    with patch('embeddings.SentenceTransformer') as mock:
        mock.side_effect = OSError('model file not found')
        yield


@pytest.fixture
def mock_st_general_error():
    """Mock SentenceTransformer failing with a general exception."""
    with patch('embeddings.SentenceTransformer') as mock:
        mock.side_effect = RuntimeError('unexpected error')
        yield


from embeddings import is_fallback_active, _get_model
import embeddings


class TestIsFallbackActive:

    def test_returns_false_initially_before_model_loaded(self):
        """Before _get_model() is called, fallback should not be active yet."""
        embeddings._fallback_active = False
        assert is_fallback_active() is False

    def test_returns_false_when_primary_model_loads_successfully(self, mock_st_success):
        """When SentenceTransformer loads, fallback should not be active."""
        embeddings._model = None
        embeddings._fallback_active = False
        _get_model()
        assert is_fallback_active() is False

    def test_returns_true_when_sentence_transformer_unavailable(self, mock_st_failure):
        """When SentenceTransformer raises OSError, fallback should be active."""
        embeddings._model = None
        embeddings._fallback_active = False
        _get_model()
        assert is_fallback_active() is True

    def test_returns_true_on_general_sentence_transformer_error(self, mock_st_general_error):
        """When SentenceTransformer raises any exception, fallback should be active."""
        embeddings._model = None
        embeddings._fallback_active = False
        _get_model()
        assert is_fallback_active() is True

    def test_is_pure_accessor_does_not_modify_state(self):
        """Calling is_fallback_active() multiple times should not change _fallback_active."""
        initial = embeddings._fallback_active
        is_fallback_active()
        is_fallback_active()
        assert embeddings._fallback_active == initial

    def test_fallback_stays_active_after_first_failure(self, mock_st_failure):
        """Once fallback is activated, subsequent calls should keep it active."""
        embeddings._model = None
        embeddings._fallback_active = False
        _get_model()
        first_call_result = is_fallback_active()
        # Call again - should still be active
        _get_model()
        second_call_result = is_fallback_active()
        assert first_call_result is True
        assert second_call_result is True
