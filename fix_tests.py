import os
import glob
import re

TEST_DIR = "ai-engine/tests"

# 1. Remove sys.modules poisoning
def remove_sys_modules(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # We remove anything matching sys.modules['...'] = ...
    content = re.sub(r"^sys\.modules\[.*?=.*?\n", "", content, flags=re.MULTILINE)
    
    # In test_embeddings_dimension.py, there is also:
    # _mock_st_module = MagicMock()
    # _mock_st_module.SentenceTransformer = _MockSentenceTransformer
    if "test_embeddings_dimension.py" in filepath:
        content = re.sub(r"^_mock_st_module.*?\n", "", content, flags=re.MULTILINE)
        content = re.sub(r"^sys\.modules\['sentence_transformers'\].*?\n", "", content, flags=re.MULTILINE)
        content = re.sub(r"class _MockSentenceTransformer:.*?sys.modules\['sentence_transformers'\].*?\n", "", content, flags=re.MULTILINE|re.DOTALL)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

for f in glob.glob(os.path.join(TEST_DIR, "test_*.py")):
    remove_sys_modules(f)

# 2. Fix test_app_routes.py specifically
app_routes_path = os.path.join(TEST_DIR, "test_app_routes.py")
with open(app_routes_path, "r", encoding="utf-8") as f:
    content = f.read()

# For cleanup
content = content.replace("        import vectorstore as vs\n        vs.cleanup_stale_vectors = MagicMock(return_value={\n", 
"""        from unittest.mock import patch
        with patch('app.rag.cleanup_stale_chunks') as mock_cleanup:
            mock_cleanup.return_value = {
""")
content = content.replace('            "remaining_count": 2,\n        })\n        payload = {"current_files": ["keep.py"]}',
"""            "remaining_count": 2,
            }
            payload = {"current_files": ["keep.py"]}""")
content = content.replace('            "remaining_count": 3,\n        })\n        payload = {"current_files": ["a.py", "b.py", "c.py"]}',
"""            "remaining_count": 3,
            }
            payload = {"current_files": ["a.py", "b.py", "c.py"]}""")
content = content.replace('            "remaining_count": 0,\n        })\n        payload = {"current_files": []}',
"""            "remaining_count": 0,
            }
            payload = {"current_files": []}""")

# For delete-vectors
content = content.replace("        import vectorstore as vs\n        vs.delete_vectors_for_file = MagicMock(return_value=3)\n        payload = ",
"""        from unittest.mock import patch
        with patch('app.rag.delete_chunks_for_file') as mock_delete:
            mock_delete.return_value = 3
            payload = """)
content = content.replace("        import vectorstore as vs\n        vs.delete_vectors_for_file = MagicMock(return_value=0)\n        payload = ",
"""        from unittest.mock import patch
        with patch('app.rag.delete_chunks_for_file') as mock_delete:
            mock_delete.return_value = 0
            payload = """)

# For split-files
content = content.replace("        import text_splitter as ts\n        ts.split_files = MagicMock",
"""        from unittest.mock import patch
        with patch('app.do_split') as mock_split:
            mock_split""")
content = content.replace("mock_split(return_value=[", "mock_split.return_value=[")

# For query chunks
content = content.replace("        import rag\n        rag.query_chunks = MagicMock",
"""        from unittest.mock import patch
        with patch('app.query_chunks') as mock_query:
            mock_query""")
content = content.replace("mock_query(return_value=[", "mock_query.return_value=[")


with open(app_routes_path, "w", encoding="utf-8") as f:
    f.write(content)

