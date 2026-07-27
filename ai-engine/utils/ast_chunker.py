import tree_sitter
import tree_sitter_python
import tree_sitter_javascript

class ASTChunker:
    def __init__(self):
        self.parsers = {}
        self._init_parsers()

    def _init_parsers(self):
        # Initialize Python parser
        py_language = tree_sitter.Language(tree_sitter_python.language())
        py_parser = tree_sitter.Parser(py_language)
        self.parsers['.py'] = py_parser

        # Initialize JavaScript/TypeScript parser
        js_language = tree_sitter.Language(tree_sitter_javascript.language())
        js_parser = tree_sitter.Parser(js_language)
        self.parsers['.js'] = js_parser
        self.parsers['.ts'] = js_parser

    def get_parser(self, language_str: str) -> tree_sitter.Parser:
        """Returns the correct tree-sitter Parser based on the file extension."""
        if language_str not in self.parsers:
            raise ValueError(f"Unsupported language extension for AST chunking: {language_str}")
        return self.parsers[language_str]

    def chunk_code(self, source_code: str, file_extension: str, max_chars: int = 4000) -> list[str]:
        """
        Parses code into an AST and packs top-level nodes into chunks that 
        respect max_chars without breaking syntactic boundaries.
        """
        parser = self.get_parser(file_extension)
        source_bytes = source_code.encode('utf-8')
        tree = parser.parse(source_bytes)
        
        chunks = []
        current_chunk_nodes = []
        current_chunk_size = 0
        
        # Traverse direct children of the root node (top-level declarations)
        for node in tree.root_node.children:
            node_bytes = source_bytes[node.start_byte:node.end_byte]
            node_text = node_bytes.decode('utf-8')
            node_size = len(node_text)
            
            # If adding this node exceeds max_chars, start a new chunk
            if current_chunk_size + node_size > max_chars and current_chunk_nodes:
                chunks.append("\n\n".join(current_chunk_nodes))
                current_chunk_nodes = []
                current_chunk_size = 0
                
            current_chunk_nodes.append(node_text)
            current_chunk_size += node_size
            
        # Add any remaining nodes as the final chunk
        if current_chunk_nodes:
            chunks.append("\n\n".join(current_chunk_nodes))
            
        # Format chunks with metadata headers
        total_chunks = len(chunks)
        comment_prefix = "#" if file_extension == ".py" else "//"
        
        formatted_chunks = []
        for i, chunk_content in enumerate(chunks, 1):
            metadata = f"{comment_prefix} Chunk {i} of {total_chunks}: AST boundaries preserved\n"
            formatted_chunks.append(metadata + chunk_content)
            
        return formatted_chunks
