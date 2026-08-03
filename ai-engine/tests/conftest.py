import os


# Configure the internal service credential before test modules import app.py.
os.environ.setdefault("AI_ENGINE_API_KEY", "test-ai-engine-key")

# Explicit opt-in auth bypass for the test suite. app.py refuses to auto-detect
# test runners, so tests set this env var explicitly; auth fails closed by
# default (including under pytest) unless this is set.
os.environ.setdefault("AI_ENGINE_AUTH_DISABLED", "1")
