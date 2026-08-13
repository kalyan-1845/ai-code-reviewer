sed -i '' 's/raise RuntimeError("groq is down")/raise RuntimeError("groq is down")/g' ai-engine/tests/test_analyze_concurrent_batches.py
