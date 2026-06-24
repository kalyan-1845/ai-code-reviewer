$issues = 493..512
foreach ($issue in $issues) {
    gh issue comment $issue -b "Hi @kalyan-1845, can you please assign me this issue under gssoc"
    Start-Sleep -Seconds 1
}
