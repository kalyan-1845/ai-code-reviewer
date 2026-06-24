import sys
from unittest.mock import MagicMock

# Mock out heavy dependencies globally before ANY test file imports `app` or `vectorstore`
sys.modules['sentence_transformers'] = MagicMock()
sys.modules['groq'] = MagicMock()
sys.modules['chromadb'] = MagicMock()
sys.modules['chromadb.config'] = MagicMock()
sys.modules['chromadb.api'] = MagicMock()
sys.modules['langchain_text_splitters'] = MagicMock()
