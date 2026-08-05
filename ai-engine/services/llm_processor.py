import os
from utils.ast_chunker import ASTChunker

class LLMProcessor:
    def __init__(self):
        self.chunker = ASTChunker()
        self.max_chunk_size = 4000
    
    def process_repository_file(self, filepath: str, raw_code: str):
        """
        Processes a raw repository file, chunks it via AST if needed, 
        and sends it to the LLM sequentially.
        """
        _, file_extension = os.path.splitext(filepath)
        
        try:
            chunks = self.chunker.chunk_code(
                source_code=raw_code,
                file_extension=file_extension,
                max_chars=self.max_chunk_size
            )
        except ValueError:
            # Fallback for unsupported extensions
            chunks = [raw_code[i:i + self.max_chunk_size] for i in range(0, len(raw_code), self.max_chunk_size)]
        
        results = []
        for chunk in chunks:
            # Dispatch sequentially to LLM
            response = self._send_to_llm(chunk)
            results.append(response)
            
        return results

    def _send_to_llm(self, payload: str) -> str:
        """Mock method representing an API call to Groq/Llama."""
        print(f"Sending payload of size {len(payload)} to LLM...")
        # response = groq_client.chat.completions.create(...)
        return "LLM_MOCK_RESPONSE"
