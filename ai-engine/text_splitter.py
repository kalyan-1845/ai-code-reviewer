import os
import hashlib
from typing import Optional
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pygments.lexers import guess_lexer_for_filename, guess_lexer
from pygments.util import ClassNotFound

_CHUNK_SIZE = int(os.getenv("TEXT_CHUNK_SIZE", "1000"))
_CHUNK_OVERLAP = int(os.getenv("TEXT_CHUNK_OVERLAP", "200"))

_language_separators = {
    "python": ["\nclass ", "\ndef ", "\n    ", "\n\t", "\n", " ", ""],
    "javascript": ["\nclass ", "\nfunction ", "\nconst ", "\nlet ", "\nvar ", "\n    ", "\n\t", "\n", " ", ""],
    "typescript": ["\nclass ", "\nfunction ", "\nconst ", "\nlet ", "\nvar ", "\n    ", "\n\t", "\n", " ", ""],
    "java": ["\nclass ", "\npublic ", "\nprivate ", "\nprotected ", "\n    ", "\n\t", "\n", " ", ""],
    "go": ["\nfunc ", "\ntype ", "\n    ", "\n\t", "\n", " ", ""],
    "rust": ["\nfn ", "\nstruct ", "\nenum ", "\nimpl ", "\n    ", "\n\t", "\n", " ", ""],
    "cpp": ["\nclass ", "\nvoid ", "\nint ", "\n    ", "\n\t", "\n", " ", ""],
    "default": ["\n\n", "\n", " ", ""],
}

_code_extensions = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".cpp": "cpp",
    ".c": "cpp",
    ".h": "cpp",
    ".hpp": "cpp",
}


def _detect_language(file_name: str, content: str = "") -> str:
    ext = os.path.splitext(file_name)[1].lower()
    if ext and ext in _code_extensions:
        return _code_extensions[ext]

    if content and content.strip():
        try:
            lexer = guess_lexer_for_filename(file_name, content)
            lex_name = lexer.name.lower()
            for ext_key, lang in _code_extensions.items():
                if lang == lex_name or lex_name.startswith(lang.split()[0]):
                    return lang
        except (ClassNotFound, Exception):
            pass

        try:
            lexer = guess_lexer(content)
            lex_name = lexer.name.lower()
            for ext_key, lang in _code_extensions.items():
                if lang == lex_name or lex_name.startswith(lang.split()[0]):
                    return lang
        except (ClassNotFound, Exception):
            pass

    return "default"


def _make_splitter(file_name: str, content: str = "", chunk_size: Optional[int] = None, chunk_overlap: Optional[int] = None) -> RecursiveCharacterTextSplitter:
    language = _detect_language(file_name, content)
    separators = _language_separators.get(language, _language_separators["default"])
    
    final_chunk_size = chunk_size if chunk_size is not None else _CHUNK_SIZE
    final_chunk_overlap = chunk_overlap if chunk_overlap is not None else _CHUNK_OVERLAP
    
    if final_chunk_overlap >= final_chunk_size:
        final_chunk_overlap = max(0, final_chunk_size - 1)
        
    return RecursiveCharacterTextSplitter(
        chunk_size=final_chunk_size,
        chunk_overlap=final_chunk_overlap,
        separators=separators,
        length_function=len,
        add_start_index=True,
    )


def _generate_chunk_id(file_name: str, chunk_index: int) -> str:
    raw = f"{file_name}:{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _calculate_line_numbers(content: str, chunks: list[str], start_indices: list[int]) -> list[tuple[int, int]]:
    line_numbers = []
    for chunk, start_idx in zip(chunks, start_indices):
        pre = content[:start_idx]
        start_line = pre.count("\n")
        end_line = start_line + chunk.count("\n")
        line_numbers.append((start_line, end_line))
    return line_numbers


def split_file_content(
    file_name: str,
    content: str,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
    repo_url: Optional[str] = None,
) -> list[dict]:
    if len(content) > 10 * 1024 * 1024:
        return []
    if not content or not content.strip():
        return []

    splitter = _make_splitter(file_name, content, chunk_size, chunk_overlap)
    docs = splitter.create_documents([content])
    chunks = [d.page_content for d in docs]
    start_indices = [d.metadata.get("start_index", 0) for d in docs]
    line_numbers = _calculate_line_numbers(content, chunks, start_indices)

    results = []
    for i, chunk in enumerate(chunks):
        metadata = {
            "source_file": file_name,
            "fileName": file_name,
            "chunk_index": i,
            "total_chunks": len(chunks),
            "language": _detect_language(file_name, content),
            "start_line": line_numbers[i][0],
            "end_line": line_numbers[i][1],
        }
        if repo_url:
            metadata["repoUrl"] = repo_url
        results.append({
            "chunk_id": _generate_chunk_id(file_name, i),
            "content": chunk,
            "metadata": metadata,
        })
    return results


def split_files(
    files: list[dict],
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
    repo_url: Optional[str] = None,
) -> list[dict]:
    all_chunks = []
    for file in files:
        if not isinstance(file, dict):
            continue
        if not file.get("name") or not file.get("content"):
            continue
        chunks = split_file_content(
            file_name=file["name"],
            content=file["content"],
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            repo_url=repo_url,
        )
        all_chunks.extend(chunks)
    return all_chunks
