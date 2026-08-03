import chromadb
from typing import Optional, Dict, Any

try:
    from embeddings import embed_texts
except ImportError:
    from ai_engine.embeddings import embed_texts

_client = chromadb.EphemeralClient()


def get_historical_prs_collection():
    """Gets or creates the 'historical_prs' collection."""
    return _client.get_or_create_collection(
        name="historical_prs",
        metadata={"hnsw:space": "cosine"}
    )


def add_historical_pr(
    document: str,
    metadata: Optional[Dict[str, Any]] = None,
    doc_id: Optional[str] = None
) -> str:
    """
    Embeds and stores a past merged PR diff or maintainer review comment into the
    historical_prs collection.
    """
    import uuid
    collection = get_historical_prs_collection()
    if doc_id is None:
        doc_id = str(uuid.uuid4())
    embeddings = embed_texts([document])
    collection.add(
        documents=[document],
        embeddings=embeddings,
        metadatas=[metadata or {}],
        ids=[doc_id]
    )
    return doc_id


def retrieve_historical_context(query: str, n_results: int = 2) -> str:
    """
    Queries the historical_prs vector collection for semantically similar past PRs/decisions
    and formats them into a context string.
    Fails gracefully returning an empty string if the DB is empty or an error occurs.
    """
    if not query or not query.strip():
        return ""

    try:
        collection = get_historical_prs_collection()
        count = collection.count()
        if count == 0:
            return ""

        limit = min(n_results, count)
        query_embeddings = embed_texts([query])
        results = collection.query(
            query_embeddings=query_embeddings,
            n_results=limit
        )

        documents = results.get("documents", [[]])[0] if results and results.get("documents") else []
        if not documents:
            return ""

        formatted_docs = []
        for i, doc in enumerate(documents, 1):
            formatted_docs.append(f"--- Historical PR Decision {i} ---\n{doc}")

        return "Historical Repository Conventions & Past Decisions:\n" + "\n\n".join(formatted_docs)
    except Exception:
        return ""
