import ast
import re
from typing import List, Set, Dict
from src.graph.state import AgentState
from src.utils.github_fetcher import fetch_file_content

# Common standard libraries and external packages to ignore during AST resolution
IGNORED_MODULES = {
    "os", "sys", "re", "json", "math", "typing", "base64", "requests", "ast",
    "time", "datetime", "functools", "itertools", "collections", "subprocess",
    "unittest", "pytest", "asyncio", "react", "express", "lodash", "axios",
    "path", "fs", "http", "https", "langgraph", "langchain", "pydantic"
}


def _clean_chunk_to_code(chunk: str) -> str:
    """
    Strips git diff headers and deleted lines to extract clean source code for AST parsing.
    """
    cleaned_lines = []
    for line in chunk.splitlines():
        if line.startswith("+++") or line.startswith("---") or line.startswith("@@") or line.startswith("diff --git"):
            continue
        if line.startswith("+"):
            cleaned_lines.append(line[1:])
        elif line.startswith("-"):
            continue
        else:
            cleaned_lines.append(line)
    return "\n".join(cleaned_lines)


def _resolve_python_ast_imports(code: str) -> Set[str]:
    """
    Uses Python's native AST module to extract module import paths from valid Python code.
    """
    file_candidates = set()
    try:
        parsed_ast = ast.parse(code)
        for node in ast.walk(parsed_ast):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    mod_name = alias.name
                    root_mod = mod_name.split(".")[0]
                    if root_mod not in IGNORED_MODULES:
                        file_path = mod_name.replace(".", "/") + ".py"
                        file_candidates.add(file_path)

            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    root_mod = node.module.split(".")[0]
                    if root_mod not in IGNORED_MODULES:
                        base_path = node.module.replace(".", "/")
                        file_candidates.add(f"{base_path}.py")
                        file_candidates.add(f"{base_path}/__init__.py")
                        for alias in node.names:
                            file_candidates.add(f"{base_path}/{alias.name}.py")
    except Exception:
        # Fall back gracefully if snippet is partial or unparseable by AST
        pass
    return file_candidates


def _resolve_regex_imports(code: str) -> Set[str]:
    """
    Uses regex heuristics to extract import paths for Python and JS/TS code snippets.
    """
    file_candidates = set()

    # Regex for Python imports: from x.y import z OR import x.y
    py_from_pattern = r'^\s*from\s+([\w\.]+)\s+import\s+([\w\.,\s\(\)]+)'
    py_import_pattern = r'^\s*import\s+([\w\.]+)'

    # Regex for JS/TS imports: import { x } from './path' OR require('./path')
    js_import_pattern = r'(?:import|export)\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]'
    js_require_pattern = r'require\([\'"]([^\'"]+)[\'"]\)'

    for line in code.splitlines():
        line_str = line.strip()

        # Python 'from' matches
        from_match = re.match(py_from_pattern, line_str)
        if from_match:
            mod_name = from_match.group(1)
            root_mod = mod_name.split(".")[0]
            if root_mod not in IGNORED_MODULES:
                base_path = mod_name.replace(".", "/")
                file_candidates.add(f"{base_path}.py")
                file_candidates.add(f"{base_path}/__init__.py")

        # Python 'import' matches
        imp_match = re.match(py_import_pattern, line_str)
        if imp_match:
            mod_name = imp_match.group(1)
            root_mod = mod_name.split(".")[0]
            if root_mod not in IGNORED_MODULES:
                file_candidates.add(mod_name.replace(".", "/") + ".py")

        # JS/TS matches
        for js_pattern in (js_import_pattern, js_require_pattern):
            for match in re.findall(js_pattern, line_str):
                clean_path = re.sub(r'^\./|^\.\./', '', match)
                if not clean_path.startswith("http") and not clean_path in IGNORED_MODULES:
                    # Append probable extensions
                    if "." in clean_path.split("/")[-1]:
                        file_candidates.add(clean_path)
                    else:
                        file_candidates.add(f"{clean_path}.js")
                        file_candidates.add(f"{clean_path}.ts")
                        file_candidates.add(f"src/{clean_path}.js")
                        file_candidates.add(f"src/{clean_path}.ts")
                        file_candidates.add(f"{clean_path}.py")
                        file_candidates.add(f"src/{clean_path}.py")

    return file_candidates


def ast_resolver_node(state: AgentState) -> dict:
    """
    LangGraph node that parses git diff chunks using AST and regex heuristics,
    fetches external dependency files via GitHub REST API, and populates
    dependency_context in AgentState.
    """
    repo = state.get("github_repo", "")
    chunks = state.get("chunks", [])

    candidate_paths: Set[str] = set()

    for chunk in chunks:
        clean_code = _clean_chunk_to_code(chunk)
        # Combine AST and Regex extracted file paths
        candidate_paths.update(_resolve_python_ast_imports(clean_code))
        candidate_paths.update(_resolve_regex_imports(clean_code))

    fetched_contexts = []
    fetched_paths = set()

    for file_path in sorted(candidate_paths):
        if file_path in fetched_paths:
            continue

        content = fetch_file_content(repo=repo, file_path=file_path)
        if content and content.strip():
            fetched_paths.add(file_path)
            context_header = f"--- Dependency File: {file_path} ---"
            fetched_contexts.append(f"{context_header}\n{content.strip()}")

    concatenated_context = "\n\n".join(fetched_contexts)

    return {
        "dependency_context": concatenated_context
    }
