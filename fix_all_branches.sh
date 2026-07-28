#!/bin/bash
set -e

# We have the fixes uncommitted in the current branch.
# Let's save them as a patch.
git diff > fix_dashboard_and_app.patch

BRANCHES=(
    "feat-custom-rules-901"
    "fix-vue-svelte-support-898"
    "fix-rate-limit-retry-897"
    "fix-draft-pr-895"
    "fix-markdown-backticks-894"
)

# First, reset the current branch to avoid dirty tree errors
git checkout -- .

for BRANCH in "${BRANCHES[@]}"; do
    echo "=========================================="
    echo "Processing branch: $BRANCH"
    echo "=========================================="
    
    # Checkout and pull the latest
    git checkout $BRANCH
    
    # Apply the patch
    git apply fix_dashboard_and_app.patch
    
    # Rebuild github action if needed (index.js may have changed due to merges)
    # Actually wait! The patch only touches ai-engine/app.py and frontend/
    
    # Commit changes
    git add ai-engine/app.py frontend/package-lock.json frontend/package.json frontend/src/pages/Dashboard.tsx
    git commit -m "fix: resolve upstream/main breakages in ai-engine and frontend"
    
    # Push changes
    git push origin $BRANCH -f
done
