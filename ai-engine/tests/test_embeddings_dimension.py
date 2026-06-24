# Mock sentence_transformers before importing embeddings to avoid model download
import sys
from unittest.mock import MagicMock

class _MockSentenceTransformer:
    def __init__(self, model_name):
        # Store the model name to verify it was called with correct config
        self._model_name = model_name
        self._dim = 384  # default for all-MiniLM-L6-v2

    def get_sentence_embedding_dimension(self):
        return self._dim

    def encode(self, *args, **kwargs):
        import numpy as np
        return np.array([[0.1] * self._dim])

_mock_st_module = MagicMock()
_mock_st_module.SentenceTransformer = _MockSentenceTransformer
sys.modules['sentence_transformers'] = _mock_st_module

# Reset the cached model in embeddings.py before importing
import embeddings
embeddings._model = None

from embeddings import get_embedding_dimension, _get_model


class TestGetEmbeddingDimension:
    def test_returns_positive_integer(self):
        dim = get_embedding_dimension()
        assert isinstance(dim, int)
        assert dim > 0

    def test_returns_consistent_value_across_calls(self):
        dim1 = get_embedding_dimension()
        dim2 = get_embedding_dimension()
        assert dim1 == dim2

    def test_returns_expected_minilm_dimension(self):
        dim = get_embedding_dimension()
        # all-MiniLM-L6-v2 has dimension 384
        assert dim == 384

    def test_caches_model_on_first_call(self):
        import embeddings
        embeddings._model = None  # reset cache
        dim1 = get_embedding_dimension()
        model1 = _get_model()
        model2 = _get_model()
        # Second call should return the same cached model
        assert model1 is model2
        dim2 = get_embedding_dimension()
        assert dim1 == dim2
