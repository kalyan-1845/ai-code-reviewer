import os


# Configure the internal service credential before test modules import app.py.
os.environ.setdefault("AI_ENGINE_API_KEY", "test-ai-engine-key")
