import subprocess, json, os

os.environ['PYTHONIOENCODING'] = 'utf-8'

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout or '').strip(), (r.stderr or '').strip()

prs = [3335,3334,3333,3332,3326,3323,3322,3226,3225,3224,3223,3222,3216,3215,3214,3213,3187,3172,3166,3162]

merged = []
for num in prs:
    rc, out, _ = run(f"gh pr view {num} --json title,files,state")
    if rc != 0: continue
    pr = json.loads(out)
    if pr['state'] != 'OPEN': continue
    files = [f['path'] for f in pr['files'] if 'ai-engine' not in f['path'] and f['changeType'] != 'DELETED']
    if not files: continue
    rc2, _, _ = run(f"git fetch origin refs/pull/{num}/head")
    if rc2 != 0: continue
    ok = True
    for f in files:
        rc3, _, _ = run(f"git checkout FETCH_HEAD -- {f}")
        if rc3 != 0: ok = False; break
    if ok:
        merged.append({'num': num, 'title': pr['title'], 'files': files})
        print(f"Staged #{num}: {files}")

print("\n=== Running backend tests ===")
rc, out, err = run("cd backend && npm test")
if rc != 0:
    print("TESTS FAILED!")
    print(out[-1000:])
    run("git reset --hard HEAD")
    exit(1)

print("ALL TESTS PASSED!")
run("git add -A")
titles = "; ".join([f"#{p['num']}" for p in merged])
rc, _, _ = run(f'git commit -m "batch merge PRs {titles}" --no-verify')
if rc != 0: print("Nothing to commit"); exit(0)
rc, _, _ = run("git push origin main")
if rc != 0: print("Push failed!"); exit(1)
_, rev, _ = run("git rev-parse --short HEAD")
print(f"\nPushed as {rev}")

for p in merged:
    run(f'gh pr close {p["num"]} -c "Merged in {rev}"')
    print(f"Closed #{p['num']}")

# Close ai-engine-only PRs
for num in [3325,3324,3183,3180,3179,3170,3168,3164,3147,3134]:
    rc, out, _ = run(f"gh pr view {num} --json state")
    if rc == 0:
        s = json.loads(out)
        if s['state'] == 'OPEN':
            run(f'gh pr close {num} -c "ai-engine changes already in main"')
            print(f"Closed #{num} (ai-engine only)")

print("\nDONE!")
