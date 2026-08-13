import os
import sys

# Ensure ai-engine is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.ast_resolver import extract_missing_dependencies, resolve_ast_dependencies


def test_ast_resolver_missing_dependency():
    code = """
def process_data(items):
    cleaned = sanitize_input(items)
    result = compute_metrics(cleaned)
    print("Done")
    return result
"""
    missing = extract_missing_dependencies(code)
    assert missing == ["sanitize_input", "compute_metrics"]

    ctx = resolve_ast_dependencies(code)
    expected = (
        "Mocked context for fetched dependency: sanitize_input\n"
        "Mocked context for fetched dependency: compute_metrics"
    )
    assert ctx == expected


def test_ast_resolver_defined_function_not_missing():
    code = """
def helper(x):
    return x * 2

def main(val):
    return helper(val)
"""
    missing = extract_missing_dependencies(code)
    assert missing == []
    assert resolve_ast_dependencies(code) == ""


def test_ast_resolver_builtins_ignored():
    code = """
def process(arr):
    print("Length:", len(arr))
    return list(range(5))
"""
    missing = extract_missing_dependencies(code)
    assert missing == []
    assert resolve_ast_dependencies(code) == ""


def test_ast_resolver_diff_format():
    diff_code = """diff --git a/main.py b/main.py
index 1234567..89abcdef 100644
--- a/main.py
+++ b/main.py
@@ -10,3 +10,4 @@
 def run_pipeline():
+    data = fetch_remote_data()
+    save_to_db(data)
"""
    missing = extract_missing_dependencies(diff_code)
    assert "fetch_remote_data" in missing
    assert "save_to_db" in missing
    ctx = resolve_ast_dependencies(diff_code)
    assert "Mocked context for fetched dependency: fetch_remote_data" in ctx
    assert "Mocked context for fetched dependency: save_to_db" in ctx


def test_ast_resolver_syntax_error_fallback():
    invalid_code = "def broken_code(: invalid syntax !!!"
    assert extract_missing_dependencies(invalid_code) == []
    assert resolve_ast_dependencies(invalid_code) == ""
