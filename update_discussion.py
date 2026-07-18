import json
import urllib.request
import ssl
import os

def run_query(query, variables):
    payload = json.dumps({
        "query": query,
        "variables": variables
    }).encode('utf-8')
    
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=payload,
        headers={
            "Authorization": f"bearer {os.environ.get('GITHUB_TOKEN', '')}",
            "Content-Type": "application/json",
            "User-Agent": "python-urllib"
        }
    )
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    with urllib.request.urlopen(req, context=ctx) as response:
        return json.loads(response.read().decode('utf-8'))

# 1. Get Discussion ID
get_id_query = """
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    discussion(number: $number) {
      id
    }
  }
}
"""
res = run_query(get_id_query, {"owner": "kalyan-1845", "name": "ai-code-reviewer", "number": 482})

# Handle GraphQL errors in the response
if 'errors' in res:
    print("GraphQL error fetching discussion ID:", json.dumps(res['errors'], indent=2))
    exit(1)

discussion = res.get('data', {}).get('repository', {}).get('discussion')
if discussion is None:
    print("Error: Discussion not found or repository access denied.")
    print("Response:", json.dumps(res, indent=2))
    exit(1)

discussion_id = discussion['id']

# 2. Update Discussion
update_query = """
mutation($id: ID!, $body: String!) {
  updateDiscussion(input: {discussionId: $id, body: $body}) {
    discussion {
      url
    }
  }
}
"""
new_body = "As a massive thank you for all the incredible work being done, I want to give a special shout-out to our top contributors who have been going above and beyond!\n\nYour code, bug reports, and dedication have been absolutely **SUPER** and **THE BEST**! 🚀✨\n\nHere are our True Top 5 community PR submitters making magic happen:\n1. 🥇 **@tmdeveloper007** (87 PRs - Absolute Superstar!)\n2. 🥈 **@ionfwsrijan** (52 PRs)\n3. 🥉 **@sahare-mayur-0071** (34 PRs)\n4. 🌟 **@saurabhhhcodes** (15 PRs)\n5. 🌟 **@Tomeshwari-02** (8 PRs)\n\nThank you all for the outstanding impact you've made on this project. You guys rock! 🔥 Keep up the incredible work!"

res2 = run_query(update_query, {"id": discussion_id, "body": new_body})

if 'errors' in res2:
    print("GraphQL error updating discussion:", json.dumps(res2['errors'], indent=2))
    exit(1)

print("Updated:", json.dumps(res2, indent=2))
