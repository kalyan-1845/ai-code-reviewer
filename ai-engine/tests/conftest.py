import os

import pytest


# Configure the internal service credential before test modules import app.py.
os.environ.setdefault("AI_ENGINE_API_KEY", "test-ai-engine-key")

# Explicit opt-in auth bypass for the test suite. app.py refuses to auto-detect
# test runners, so tests set this env var explicitly; auth fails closed by
# default (including under pytest) unless this is set.
os.environ.setdefault("AI_ENGINE_AUTH_DISABLED", "1")


@pytest.fixture(autouse=True)
def _default_reviewer_llm_caller():
    """Install a deterministic reviewer LLM caller so uncached chunks get a
    real (mocked) model review instead of a fabricated fallback.

    Falls back to no-op when a legacy src copy without the caller hook is
    importable (e.g. the root-level src package), which keeps those runs on
    the legacy behavior.
    """
    try:
        from src.graph.nodes import set_reviewer_llm_caller
    except ImportError:
        yield
        return

    def default_caller(system_prompt, user_prompt):
        return "Micro-review: Analyzed snippet. No critical flaws detected by the model."

    set_reviewer_llm_caller(default_caller)
    yield
    set_reviewer_llm_caller(None)
