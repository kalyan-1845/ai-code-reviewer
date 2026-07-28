import os
import re
from typing import List, Dict, Set, Any
from .ast_chunker import ASTChunker

def _traverse_and_extract_imports(node, file_extension: str, source_bytes: bytes, imports: Set[str]):
    """Recursively traverse the AST to extract imported module names."""
    if file_extension == ".py":
        if node.type == "import_statement" or node.type == "import_from_statement":
            # Extract module names (e.g., from module import x -> module)
            for child in node.children:
                if child.type == "dotted_name":
                    module_name = source_bytes[child.start_byte:child.end_byte].decode("utf-8")
                    imports.add(module_name)
    elif file_extension in [".js", ".ts", ".jsx", ".tsx"]:
        if node.type == "import_statement":
            for child in node.children:
                if child.type == "string":
                    # extract the string content
                    for str_child in child.children:
                        if str_child.type == "string_fragment":
                            imports.add(source_bytes[str_child.start_byte:str_child.end_byte].decode("utf-8"))
        elif node.type == "call_expression":
            is_require = False
            for child in node.children:
                if child.type == "identifier" and source_bytes[child.start_byte:child.end_byte].decode("utf-8") == "require":
                    is_require = True
                if is_require and child.type == "arguments":
                    for arg in child.children:
                        if arg.type == "string":
                            for str_child in arg.children:
                                if str_child.type == "string_fragment":
                                    imports.add(source_bytes[str_child.start_byte:str_child.end_byte].decode("utf-8"))

    for child in node.children:
        _traverse_and_extract_imports(child, file_extension, source_bytes, imports)

def extract_imports(source_code: str, file_name: str) -> Set[str]:
    """Extracts all imported module paths/names from the source code."""
    _, ext = os.path.splitext(file_name)
    
    # Simple regex fallback for unsupported languages
    fallback_imports = set()
    if ext not in [".py", ".js", ".ts", ".jsx", ".tsx"]:
        # Fallback naive regex
        import_pattern = re.compile(r'import\s+.*?(?:from\s+)?[\'"]([^\'"]+)[\'"]')
        for match in import_pattern.finditer(source_code):
            fallback_imports.add(match.group(1))
        return fallback_imports

    try:
        chunker = ASTChunker()
        # map .jsx/.tsx to JS parser
        mapped_ext = ext
        if ext in [".jsx", ".tsx"]:
            mapped_ext = ".js"
            
        parser = chunker.get_parser(mapped_ext)
        source_bytes = source_code.encode("utf-8")
        tree = parser.parse(source_bytes)
        
        imports = set()
        _traverse_and_extract_imports(tree.root_node, ext, source_bytes, imports)
        return imports
    except Exception as e:
        print(f"⚠️ Failed to parse AST for {file_name}: {e}")
        return set()

def _extract_basename(path_or_module: str) -> str:
    """Gets the base module name (e.g. './UserService' -> 'UserService', 'models.User' -> 'User')."""
    # handle slashes
    basename = path_or_module.split('/')[-1]
    # handle dots for python modules
    basename = basename.split('.')[-1]
    return basename

def build_dependency_graph(files: List[Any]) -> Dict[str, Set[str]]:
    """Builds an undirected adjacency list based on AST import dependencies."""
    # Map file basenames (without extension) to full file objects
    file_map = {}
    for f in files:
        base = os.path.splitext(os.path.basename(f.name))[0]
        file_map[base] = f.name
        
    graph = {f.name: set() for f in files}
    
    for f in files:
        imports = extract_imports(f.content, f.name)
        for imp in imports:
            base_imp = _extract_basename(imp)
            if base_imp in file_map and file_map[base_imp] != f.name:
                target = file_map[base_imp]
                # Undirected edge to group tightly coupled files
                graph[f.name].add(target)
                graph[target].add(f.name)
                
    return graph

def _get_connected_components(graph: Dict[str, Set[str]]) -> List[List[str]]:
    """Returns connected components from the dependency graph."""
    visited = set()
    components = []
    
    # To maintain determinism, sort keys
    for node in sorted(graph.keys()):
        if node not in visited:
            component = []
            queue = [node]
            visited.add(node)
            
            while queue:
                curr = queue.pop(0)
                component.append(curr)
                # Sort neighbors for determinism
                for neighbor in sorted(graph[curr]):
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(component)
            
    return components

def smart_batch_files(files: List[Any], batch_size: int) -> List[List[Any]]:
    """
    Dynamically groups files into batches using an AST dependency graph.
    Tightly coupled files (e.g. UserService and UserRepository) are grouped together.
    """
    if not files:
        return []
        
    if batch_size <= 0:
        batch_size = 5
        
    # Build graph and get components
    graph = build_dependency_graph(files)
    components = _get_connected_components(graph)
    
    # Sort components by size descending, then alphabetically by first element
    components.sort(key=lambda c: (-len(c), c[0]))
    
    file_obj_map = {f.name: f for f in files}
    
    batches = []
    current_batch = []
    
    for comp in components:
        # If adding the entire component fits
        if len(current_batch) + len(comp) <= batch_size:
            current_batch.extend(comp)
        else:
            # We have to split the component or flush the current batch
            if current_batch:
                batches.append([file_obj_map[name] for name in current_batch])
                current_batch = []
                
            # If component is strictly larger than batch_size, we split it sequentially
            if len(comp) > batch_size:
                for i in range(0, len(comp), batch_size):
                    chunk = comp[i:i+batch_size]
                    if len(chunk) == batch_size:
                        batches.append([file_obj_map[name] for name in chunk])
                    else:
                        current_batch = chunk
            else:
                current_batch.extend(comp)
                
    if current_batch:
        batches.append([file_obj_map[name] for name in current_batch])
        
    return batches
