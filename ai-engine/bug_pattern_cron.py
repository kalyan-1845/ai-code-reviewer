import os
import argparse
import httpx
import uuid
import rag

def fetch_closed_bugs(repo: str, token: str) -> list:
    """Fetch closed issues labeled 'bug' from the repository."""
    url = f"https://api.github.com/repos/{repo}/issues"
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {token}"
    }
    params = {
        "state": "closed",
        "labels": "bug",
        "per_page": 100
    }
    
    print(f"Fetching closed bugs for {repo}...")
    try:
        response = httpx.get(url, headers=headers, params=params, timeout=30.0)
        response.raise_for_status()
        issues = response.json()
        print(f"Found {len(issues)} closed bug issues.")
        return issues
    except Exception as e:
        print(f"Failed to fetch bugs: {e}")
        return []

def run_cron(repo: str):
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        print("Error: GITHUB_TOKEN environment variable not set.")
        return

    issues = fetch_closed_bugs(repo, token)
    if not issues:
        return

    chunks = []
    metadatas = []
    ids = []
    
    for issue in issues:
        # Avoid pull requests in the issues endpoint
        if "pull_request" in issue:
            continue
            
        title = issue.get("title", "")
        body = issue.get("body") or ""
        issue_number = issue.get("number")
        
        # Simple extraction of the bug text to ingest
        text_chunk = f"Bug #{issue_number}: {title}\n\n{body}"
        
        chunks.append(text_chunk)
        metadatas.append({"source_file": f"issue_{issue_number}", "type": "historical_bug"})
        ids.append(str(uuid.uuid5(uuid.NAMESPACE_URL, f"{repo}/issues/{issue_number}")))
        
    if chunks:
        print(f"Ingesting {len(chunks)} bugs into ChromaDB...")
        # Since these are historical bugs, we can use a fixed repo_url or pass it directly.
        repo_url = f"https://github.com/{repo}"
        inserted = rag.upsert_chunks(chunks, metadatas, ids, repo_url=repo_url)
        print(f"Successfully ingested {inserted} historical bug patterns.")
    else:
        print("No valid bug chunks to ingest.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Historical Bug Pattern Cron Job")
    parser.add_argument("--repo", required=True, help="GitHub repository in owner/repo format")
    args = parser.parse_args()
    
    run_cron(args.repo)
