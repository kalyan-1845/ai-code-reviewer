#!/bin/bash
BRANCHES=(
  "feat/historical-bug-pattern-recognition-3070"
  "feat/multi-agent-debate-3069"
  "feat/context-aware-secret-leak-detection-3068"
  "feat/code-complexity-heatmap-3067"
  "feat/automated-refactoring-pr-3066"
  "feat/architecture-regression-detection-3065"
  "feat/unit-test-generation-3064"
  "feat/dependency-impact-analysis-3063"
  "fix-draft-pr-895"
)

git fetch origin main
for BRANCH in "${BRANCHES[@]}"; do
  echo "Checking $BRANCH..."
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
  
  # Try to merge main
  if git merge origin/main --no-commit --no-ff > /dev/null 2>&1; then
    echo "✅ $BRANCH: No conflicts."
    git merge --abort
  else
    echo "❌ $BRANCH: Conflicts detected."
    git merge --abort
  fi
done
git checkout main
