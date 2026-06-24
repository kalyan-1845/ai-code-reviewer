$issues = @(
    @{
        title = 'Enhancement: JWT Regex Produces False Positives in Secrets Scanner'
        body = '### Description
The JWT regex in `backend/utils/secretsScanner.js` is overly broad and can match generic base64 encoded strings or standard session tokens that happen to begin with `eyJ`.

### Impact
Developers will see their code falsely flagged for JWT secrets on non-secret encoded strings, creating noise and alert fatigue.

### Proposed Solution
Refine the JWT regex to strictly enforce standard JWT lengths and segment counts, or validate the decoding of the header segment before flagging.'
        label = 'backend'
    }
)

foreach ($issue in $issues) {
    gh issue create --title $issue.title --body $issue.body --label $issue.label
}
