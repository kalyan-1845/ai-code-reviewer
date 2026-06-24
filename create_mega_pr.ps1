$branchName = "fix/gssoc-assigned-issues-mega-batch"
git checkout -b $branchName
git add backend/ ai-engine/ frontend/
git commit -m "fix: resolve multiple assigned GSSoC issues across stack"
git push -u origin $branchName

$issuesJson = gh issue list -a "@me" -L 100 --json number
$issues = $issuesJson | ConvertFrom-Json

$body = "### Description`nThis comprehensive PR resolves the batch of performance, security, and bug fix issues assigned to me for GSSoC '26.`n`n### Issues Resolved:`n"
foreach ($issue in $issues) {
    $body += "- Resolves #$($issue.number)`n"
}

gh pr create --title "fix: resolve assigned GSSoC '26 issues (Frontend, Backend, AI Engine)" --body $body
