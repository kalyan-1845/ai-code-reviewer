import os
import re
import ast
import hashlib
import bisect
from typing import List, Dict, Any, Optional

# Supported languages and their file extension mappings
_language_extensions = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "javascript",  # TS and TSX share the same JS-based regex parsing
    ".tsx": "javascript",
    ".java": "java"
}

# Language-specific keywords to filter out from symbols
_js_keywords = {
    'if', 'for', 'while', 'switch', 'catch', 'try', 'function', 'class', 'const', 
    'let', 'var', 'async', 'await', 'return', 'import', 'export', 'default', 
    'get', 'set', 'static', 'new', 'delete', 'typeof', 'void', 'in', 
    'instanceof', 'do', 'else', 'finally', 'throw', 'with', 'yield'
}

_java_keywords = {
    'if', 'for', 'while', 'switch', 'catch', 'try', 'class', 'interface', 'enum', 
    'new', 'return', 'throw', 'assert', 'synchronized', 'else', 'do', 'finally', 
    'void', 'int', 'double', 'float', 'long', 'short', 'byte', 'char', 'boolean', 
    'package', 'import', 'extends', 'implements', 'this', 'super', 'instanceof', 
    'throws', 'break', 'continue', 'true', 'false', 'null',
    'public', 'private', 'protected', 'static', 'final', 'transient', 'volatile',
    'native', 'abstract', 'strictfp'
}


def generate_chunk_id(file_path: str, chunk_index: int) -> str:
    """Generates a unique 16-character hash ID for a code chunk."""
    raw = f"{file_path}:{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def find_matching_brace(content: str, start_pos: int) -> int:
    """
    Given a starting position just after the opening brace '{',
    finds the index of the matching closing brace '}'.
    Properly handles single-line comments, block comments, and string literals
    including JavaScript template literals and nested string interpolation.
    """
    length = len(content)
    pos = start_pos
    brace_count = 1
    
    # State stack to track lexical context
    state_stack = ['normal']
    
    while pos < length:
        char = content[pos]
        current_state = state_stack[-1]
        state_type = current_state[0] if isinstance(current_state, tuple) else current_state
        
        if state_type == 'normal':
            start_depth = current_state[1] if isinstance(current_state, tuple) else None
            if char == '\\':
                pos += 2
                continue
            elif char == '"':
                state_stack.append('string_double')
            elif char == "'":
                state_stack.append('string_single')
            elif char == '`':
                state_stack.append('string_template')
            elif char == '/' and pos + 1 < length and content[pos+1] == '/':
                state_stack.append('line_comment')
                pos += 1
            elif char == '/' and pos + 1 < length and content[pos+1] == '*':
                state_stack.append('block_comment')
                pos += 1
            elif char == '{':
                brace_count += 1
            elif char == '}':
                if start_depth is not None and brace_count == start_depth:
                    state_stack.pop()
                else:
                    brace_count -= 1
                    if brace_count == 0:
                        return pos
                        
        elif state_type == 'string_double':
            if char == '\\':
                pos += 2
                continue
            elif char == '"':
                state_stack.pop()
                
        elif state_type == 'string_single':
            if char == '\\':
                pos += 2
                continue
            elif char == "'":
                state_stack.pop()
                
        elif state_type == 'string_template':
            if char == '\\':
                pos += 2
                continue
            elif char == '`':
                state_stack.pop()
            elif char == '$' and pos + 1 < length and content[pos+1] == '{':
                # Resume normal brace counting inside template string interpolation
                state_stack.append(('normal', brace_count))
                pos += 1
                
        elif state_type == 'line_comment':
            if char == '\n':
                state_stack.pop()
                
        elif state_type == 'block_comment':
            if char == '*' and pos + 1 < length and content[pos+1] == '/':
                state_stack.pop()
                pos += 1
                
        pos += 1
        
    return -1


def extract_python_chunks(file_path: str, content: str) -> List[Dict[str, Any]]:
    """Extracts code chunks from Python file content using AST."""
    chunks = []
    try:
        tree = ast.parse(content)
    except SyntaxError:
        # Gracefully return empty chunks if Python file has syntax errors
        return []
        
    lines = content.splitlines()
    
    def get_node_source(node):
        start = node.lineno - 1
        end = getattr(node, 'end_lineno', len(lines))
        # Ensure we don't index out of bounds
        end = min(end, len(lines))
        return "\n".join(lines[start:end]), start + 1, end

    class PythonVisitor(ast.NodeVisitor):
        def __init__(self):
            self.class_stack = []

        def visit_ClassDef(self, node):
            if self.class_stack:
                full_name = f"{'.'.join(self.class_stack)}.{node.name}"
            else:
                full_name = node.name
                
            code, start, end = get_node_source(node)
            chunks.append({
                "content": code,
                "metadata": {
                    "file_path": file_path,
                    "language": "python",
                    "start_line": start,
                    "end_line": end,
                    "symbols": [full_name]
                }
            })
            self.class_stack.append(node.name)
            self.generic_visit(node)
            self.class_stack.pop()

        def visit_FunctionDef(self, node):
            code, start, end = get_node_source(node)
            if self.class_stack:
                full_name = f"{'.'.join(self.class_stack)}.{node.name}"
            else:
                full_name = node.name
                
            chunks.append({
                "content": code,
                "metadata": {
                    "file_path": file_path,
                    "language": "python",
                    "start_line": start,
                    "end_line": end,
                    "symbols": [full_name]
                }
            })
            self.class_stack.append(node.name)
            self.generic_visit(node)
            self.class_stack.pop()

        def visit_AsyncFunctionDef(self, node):
            self.visit_FunctionDef(node)

    visitor = PythonVisitor()
    visitor.visit(tree)
    return chunks


def extract_regex_chunks(
    file_path: str, content: str, language: str, patterns: List[Dict[str, Any]], keywords: set
) -> List[Dict[str, Any]]:
    """Extracts chunks from Javascript/TypeScript and Java using brace matching and regex signatures."""
    chunks = []
    
    # Map character offsets to line numbers
    line_offsets = []
    current_offset = 0
    for line in content.splitlines(keepends=True):
        line_offsets.append(current_offset)
        current_offset += len(line)
        
    def offset_to_line(offset: int) -> int:
        if not line_offsets:
            return 1
        return bisect.bisect_right(line_offsets, offset)

    candidates = []
    for pat_info in patterns:
        regex = pat_info["regex"]
        symbol_type = pat_info["type"]
        name_group = pat_info["name_group"]
        
        for match in regex.finditer(content):
            try:
                name = match.group(name_group)
            except IndexError:
                continue
                
            if not name or name in keywords:
                continue
                
            # Filter out false method matches that are preceded by definition keywords
            start_idx = match.start()
            line_start = content.rfind('\n', 0, start_idx) + 1
            pre_match_text = content[line_start:start_idx]
            
            if symbol_type == "method":
                if re.search(r'\b(function|class|interface|enum|new|return)\b', pre_match_text):
                    continue
                
            match_end = match.end()
            brace_pos = -1
            pos = match_end
            length = len(content)
            
            # Scan for the next '{' opening brace, ignoring comments & strings
            state_stack = ['normal']
            while pos < length:
                char = content[pos]
                current_state = state_stack[-1]
                state_type = current_state[0] if isinstance(current_state, tuple) else current_state
                
                if state_type == 'normal':
                    start_depth = current_state[1] if isinstance(current_state, tuple) else None
                    if char == '\\':
                        pos += 2
                        continue
                    elif char == '"':
                        state_stack.append('string_double')
                    elif char == "'":
                        state_stack.append('string_single')
                    elif char == '`':
                        state_stack.append('string_template')
                    elif char == '/' and pos + 1 < length and content[pos+1] == '/':
                        state_stack.append('line_comment')
                        pos += 1
                    elif char == '/' and pos + 1 < length and content[pos+1] == '*':
                        state_stack.append('block_comment')
                        pos += 1
                    elif char == '{':
                        brace_pos = pos
                        break
                    elif char == '}':
                        if start_depth is not None:
                            state_stack.pop()
                    elif char == ';':
                        # Declaration without body (e.g., abstract/interface method)
                        break
                elif state_type == 'string_double':
                    if char == '\\': pos += 2; continue
                    elif char == '"': state_stack.pop()
                elif state_type == 'string_single':
                    if char == '\\': pos += 2; continue
                    elif char == "'": state_stack.pop()
                elif state_type == 'string_template':
                    if char == '\\': pos += 2; continue
                    elif char == '`': state_stack.pop()
                    elif char == '$' and pos + 1 < length and content[pos+1] == '{':
                        state_stack.append(('normal', 0))
                        pos += 1
                elif state_type == 'line_comment':
                    if char == '\n': state_stack.pop()
                elif state_type == 'block_comment':
                    if char == '*' and pos + 1 < length and content[pos+1] == '/':
                        state_stack.pop()
                        pos += 1
                pos += 1
                
            if brace_pos != -1:
                closing_pos = find_matching_brace(content, brace_pos + 1)
                if closing_pos != -1:
                    start_char = match.start()
                    # Align chunk start with the beginning of the line
                    start_line_idx = max(0, offset_to_line(start_char) - 1)
                    start_char_adjusted = line_offsets[start_line_idx] if start_line_idx < len(line_offsets) else start_char
                    
                    end_char = closing_pos + 1
                    chunk_code = content[start_char_adjusted:end_char]
                    
                    start_line = start_line_idx + 1
                    end_line = offset_to_line(end_char)
                    
                    candidates.append({
                        "name": name,
                        "content": chunk_code,
                        "start_line": start_line,
                        "end_line": end_line,
                        "type": symbol_type,
                        "span": end_line - start_line + 1
                    })
                    
    # Sort candidates by span size in descending order
    candidates.sort(key=lambda x: x["span"], reverse=True)
    
    # Resolve symbol nesting
    processed = []
    for cand in candidates:
        parent_name = ""
        parent_cand = None
        smallest_parent_span = float('inf')
        for other in processed:
            # Check if current block is completely nested inside 'other'
            if other["start_line"] <= cand["start_line"] and other["end_line"] >= cand["end_line"]:
                if other["span"] < smallest_parent_span and other != cand:
                    smallest_parent_span = other["span"]
                    parent_cand = other
                    parent_name = other["full_symbol"]
                    
        # Java constructor validation
        if cand["type"] == "constructor" and language == "java":
            if not parent_cand or parent_cand["type"] != "class" or cand["name"] != parent_cand["name"]:
                continue

        if parent_name:
            cand["full_symbol"] = f"{parent_name}.{cand['name']}"
        else:
            cand["full_symbol"] = cand["name"]
            
        processed.append(cand)
        
    for cand in processed:
        chunks.append({
            "content": cand["content"],
            "metadata": {
                "file_path": file_path,
                "language": language,
                "start_line": cand["start_line"],
                "end_line": cand["end_line"],
                "symbols": [cand["full_symbol"]]
            }
        })
        
    return chunks


# JavaScript Regex Signatures
_js_patterns = [
    {
        "regex": re.compile(r'\bclass\s+([a-zA-Z0-9_$]+)'),
        "type": "class",
        "name_group": 1
    },
    {
        "regex": re.compile(r'\b(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\('),
        "type": "function",
        "name_group": 1
    },
    {
        "regex": re.compile(r'\b(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>'),
        "type": "arrow_function",
        "name_group": 1
    },
    {
        "regex": re.compile(r'\b(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?function\b'),
        "type": "anon_function_assignment",
        "name_group": 1
    },
    {
        "regex": re.compile(r'\b(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?([a-zA-Z0-9_$]+)\s*\([^)]*\)'),
        "type": "method",
        "name_group": 1
    }
]

# Java Regex Signatures
_java_patterns = [
    {
        "regex": re.compile(r'\b(?:class|interface|enum)\s+([a-zA-Z0-9_$]+)'),
        "type": "class",
        "name_group": 1
    },
    {
        "regex": re.compile(
            r'\b(?:public|protected|private|static|final|synchronized|abstract|volatile|transient\s+)*'
            r'(?:<[a-zA-Z0-9_$,\s<>?]+>\s+)?'
            r'([a-zA-Z0-9_$<>\[\]]+)\s+'
            r'([a-zA-Z0-9_$]+)\s*'
            r'\([^)]*\)'
        ),
        "type": "method",
        "name_group": 2
    },
    {
        "regex": re.compile(
            r'\b(?:public|protected|private\s+)*'
            r'([a-zA-Z0-9_$]+)\s*'
            r'\([^)]*\)'
        ),
        "type": "constructor",
        "name_group": 1
    }
]


def extract_chunks(file_name: str, content: str) -> List[Dict[str, Any]]:
    """
    Parses a repository file and extracts code chunks (classes, functions, methods) 
    along with metadata. Works for Python, JavaScript/TypeScript, and Java.
    Unsupported languages are handled gracefully by returning empty lists.
    """
    if not content or not content.strip():
        return []
        
    ext = os.path.splitext(file_name)[1].lower()
    language = _language_extensions.get(ext)
    
    if not language:
        return []
        
    if language == "python":
        extracted = extract_python_chunks(file_name, content)
    elif language == "javascript":
        extracted = extract_regex_chunks(file_name, content, "javascript", _js_patterns, _js_keywords)
    elif language == "java":
        extracted = extract_regex_chunks(file_name, content, "java", _java_patterns, _java_keywords)
    else:
        extracted = []
        
    # Enrich with chunk_id
    for idx, chunk in enumerate(extracted):
        chunk["chunk_id"] = generate_chunk_id(file_name, idx)
        
    return extracted
