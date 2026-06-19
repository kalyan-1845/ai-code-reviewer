import os
import hashlib
from typing import Optional
from langchain_text_splitters import RecursiveCharacterTextSplitter

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


def _detect_language(file_name: str) -> str:
    ext = os.path.splitext(file_name)[1].lower()
    return _code_extensions.get(ext, "default")


def _make_splitter(file_name: str, chunk_size: Optional[int] = None, chunk_overlap: Optional[int] = None) -> RecursiveCharacterTextSplitter:
    language = _detect_language(file_name)
    separators = _language_separators.get(language, _language_separators["default"])
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size or _CHUNK_SIZE,
        chunk_overlap=chunk_overlap or _CHUNK_OVERLAP,
        separators=separators,
        length_function=len,
    )


def _generate_chunk_id(file_name: str, chunk_index: int) -> str:
    raw = f"{file_name}:{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _calculate_line_numbers(content: str, chunks: list[str]) -> list[tuple[int, int]]:
    line_numbers = []
    remaining = content
    for chunk in chunks:
        start_idx = remaining.find(chunk)
        if start_idx == -1:
            line_numbers.append((0, 0))
            continue
        pre = remaining[:start_idx]
        start_line = pre.count("\n")
        end_line = start_line + chunk.count("\n")
        line_numbers.append((start_line, end_line))
        remaining = remaining[start_idx + len(chunk):]
    return line_numbers


def split_file_content(
    file_name: str,
    content: str,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
    repo_url: Optional[str] = None,
) -> list[dict]:
    if not content or not content.strip():
        return []

    splitter = _make_splitter(file_name, chunk_size, chunk_overlap)
    chunks = splitter.split_text(content)
    line_numbers = _calculate_line_numbers(content, chunks)

    results = []
    for i, chunk in enumerate(chunks):
        metadata = {
            "source_file": file_name,
            "fileName": file_name,
            "chunk_index": i,
            "total_chunks": len(chunks),
            "language": _detect_language(file_name),
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
        chunks = split_file_content(
            file_name=file.get("name", ""),
            content=file.get("content", ""),
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            repo_url=repo_url,
        )
        all_chunks.extend(chunks)
    return all_chunks
