# conftest.py — Mock sentence_transformers BEFORE any test module imports it.
# sentence_transformers hangs in sandbox due to torch/torchvision import.
import sys

# Patch sentence_transformers BEFORE pytest imports any test files.
# Register a stub module that mimics sentence_transformers with SentenceTransformer = None.
class _FakeSentenceTransformers:
    SentenceTransformer = None

sys.modules["sentence_transformers"] = _FakeSentenceTransformers()


def pytest_configure(config):
    # After embeddings is imported (by app.py), force the fallback flag.
    # This is needed because _fallback_active is only set inside _get_model(),
    # which is called lazily when embedding functions are first used.
    import embeddings as _emb
    _emb._fallback_active = True

