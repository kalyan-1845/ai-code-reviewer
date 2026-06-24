$issues = 530..549

foreach ($issueNumber in $issues) {
    # Get all comments for the issue via REST API
    $commentsJson = gh api repos/kalyan-1845/ai-code-reviewer/issues/$issueNumber/comments
    $comments = $commentsJson | ConvertFrom-Json
    
    $targetComments = @()
    foreach ($comment in $comments) {
        if ($comment.body -match "Hi @kalyan-1845, can you please assign me this issue under gssoc") {
            $targetComments += $comment
        }
    }
    
    # If there are duplicates, delete all except the first one
    if ($targetComments.Count -gt 1) {
        for ($i = 1; $i -lt $targetComments.Count; $i++) {
            $commentId = $targetComments[$i].id
            Write-Host "Deleting duplicate comment $commentId on issue $issueNumber"
            gh api -X DELETE "repos/kalyan-1845/ai-code-reviewer/issues/comments/$commentId"
            Start-Sleep -Milliseconds 500
        }
    }
}
