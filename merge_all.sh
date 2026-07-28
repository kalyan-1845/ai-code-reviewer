#!/bin/bash
BRANCHES=(
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
  echo "Processing $BRANCH..."
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
  git merge origin/main -m "chore: merge main into $BRANCH"
  git push -u origin "$BRANCH"
done
