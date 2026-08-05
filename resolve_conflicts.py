import subprocess
import sys

branches = [
    "feat-custom-rules-901",
    "fix-vue-svelte-support-898",
    "fix-rate-limit-retry-897",
    "fix-draft-pr-895",
    "fix-markdown-backticks-894"
]

for branch in branches:
    print(f"\\n--- Processing {branch} ---")
    subprocess.run(["git", "checkout", branch])
    
    # Merge upstream/main
    res = subprocess.run(["git", "merge", "upstream/main", "-m", f"chore: merge upstream/main into {branch}"], capture_output=True, text=True)
    if res.returncode != 0:
        print("Conflicts found. Output:")
        print(res.stdout)
        
        # Check which files have conflicts
        status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
        conflicts = [line[3:] for line in status.stdout.splitlines() if line.startswith("UU ")]
        
        print("Conflicting files:", conflicts)
        
        if len(conflicts) == 1 and conflicts[0] == "github-action/dist/index.js":
            print("Only dist/index.js is in conflict. Rebuilding...")
            subprocess.run(["npm", "ci"], cwd="github-action")
            subprocess.run(["npm", "run", "build"], cwd="github-action")
            subprocess.run(["git", "add", "github-action/dist/index.js"])
            subprocess.run(["git", "commit", "--no-edit"])
            subprocess.run(["git", "push", "origin", branch, "-f"])
            print(f"Successfully fixed and pushed {branch}")
        else:
            print(f"Other conflicts exist in {branch}! Manual resolution required. Aborting merge...")
            subprocess.run(["git", "merge", "--abort"])
    else:
        print(f"Merged upstream/main into {branch} cleanly. Pushing...")
        subprocess.run(["git", "push", "origin", branch, "-f"])

