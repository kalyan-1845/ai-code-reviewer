
async def _create_refactoring_pr(github_token: str, owner: str, repo: str, head_ref: str, file_path: str, new_content: str, pr_title: str, pr_body: str) -> str:
    """Creates a new branch off head_ref, updates the file, and opens a child PR."""
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    
    async with httpx.AsyncClient() as client:
        # 1. Get the current commit SHA of the head_ref
        ref_url = f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{head_ref}"
        res = await client.get(ref_url, headers=headers)
        if res.status_code != 200:
            print(f"⚠️ Failed to get head ref: {res.text}")
            return None
        base_sha = res.json()["object"]["sha"]
        
        # 2. Create a new branch
        new_branch = f"ai-refactor/{head_ref}-{uuid.uuid4().hex[:8]}"
        create_ref_url = f"https://api.github.com/repos/{owner}/{repo}/git/refs"
        res = await client.post(create_ref_url, headers=headers, json={"ref": f"refs/heads/{new_branch}", "sha": base_sha})
        if res.status_code != 201:
            print(f"⚠️ Failed to create branch: {res.text}")
            return None
            
        # 3. Get file blob SHA if it exists
        file_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}?ref={new_branch}"
        res = await client.get(file_url, headers=headers)
        file_sha = None
        if res.status_code == 200:
            file_sha = res.json()["sha"]
            
        # 4. Update the file
        update_data = {
            "message": f"AI Refactor: {pr_title}",
            "content": base64.b64encode(new_content.encode("utf-8")).decode("utf-8"),
            "branch": new_branch
        }
        if file_sha:
            update_data["sha"] = file_sha
            
        res = await client.put(file_url, headers=headers, json=update_data)
        if res.status_code not in (200, 201):
            print(f"⚠️ Failed to update file: {res.text}")
            return None
            
        # 5. Create Pull Request
        pr_url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
        pr_data = {
            "title": pr_title,
            "body": pr_body,
            "head": new_branch,
            "base": head_ref
        }
        res = await client.post(pr_url, headers=headers, json=pr_data)
        if res.status_code != 201:
            print(f"⚠️ Failed to open PR: {res.text}")
            return None
            
        return res.json().get("html_url")
