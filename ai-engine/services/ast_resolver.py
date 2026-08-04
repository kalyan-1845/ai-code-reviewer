import ast
import builtins
from typing import List, Set


def extract_missing_dependencies(code_snippet: str) -> List[str]:
    """
    Parses a python code snippet using ast.parse() and extracts the names of
    function calls (ast.Call) that are not defined within that same snippet
    and are not standard built-in functions.
    """
    if not code_snippet or not code_snippet.strip():
        return []

    # Attempt to parse directly first. If SyntaxError occurs (e.g. diff headers/markers),
    # attempt cleaning diff lines before parsing.
    tree = None
    try:
        tree = ast.parse(code_snippet)
    except SyntaxError:
        cleaned_lines = []
        for line in code_snippet.splitlines():
            if (
                line.startswith("diff ")
                or line.startswith("index ")
                or line.startswith("--- ")
                or line.startswith("+++ ")
                or line.startswith("@@ ")
            ):
                continue
            elif line.startswith("-"):
                continue
            elif line.startswith("+"):
                cleaned_lines.append(line[1:])
            elif line.startswith(" "):
                cleaned_lines.append(line[1:])
            else:
                cleaned_lines.append(line)
        cleaned_code = "\n".join(cleaned_lines)
        try:
            tree = ast.parse(cleaned_code)
        except SyntaxError:
            return []

    if not tree:
        return []

    # Collect all functions and classes defined in the snippet
    defined_symbols: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined_symbols.add(node.name)

    # Standard python built-ins
    builtin_names: Set[str] = set(dir(builtins))

    # Find function calls (ast.Call)
    missing_deps: List[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func_name = None
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                func_name = node.func.attr

            if func_name and func_name not in defined_symbols and func_name not in builtin_names:
                if func_name not in missing_deps:
                    missing_deps.append(func_name)

    return missing_deps


def resolve_ast_dependencies(code_snippet: str) -> str:
    """
    Extracts missing function dependencies from a python code snippet using ast
    and returns a mocked context string for LLM review.
    """
    missing_deps = extract_missing_dependencies(code_snippet)
    if not missing_deps:
        return ""

    contexts = [f"Mocked context for fetched dependency: {dep}" for dep in missing_deps]
    return "\n".join(contexts)
