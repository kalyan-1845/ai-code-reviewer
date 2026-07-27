import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "ai-engine")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from src.graph.workflow import build_graph

if __name__ == "__main__":
    graph = build_graph()
    sample_diff = """diff --git a/src/app.py b/src/app.py
index 0000000..1111111 100644
--- a/src/app.py
+++ b/src/app.py
@@ -1,3 +1,5 @@
+import os
+print("Testing LangGraph Cyclical Chunking Pipeline")
"""
    result = graph.invoke({
        "raw_diff": sample_diff,
        "chunks": [],
        "current_index": 0,
        "micro_reviews": [],
        "final_review": "",
        "dependency_context": "",
        "github_repo": "Viidhii19/ai-code-reviewer"
    })

    print("--- EXECUTION SUCCESS ---")
    print("Final Review Result:")
    print(result.get("final_review"))
    print("Dependency Context:", result.get("dependency_context", ""))
    print("Chunks processed:", len(result.get("chunks", [])))
    print("Current Index:", result.get("current_index"))

