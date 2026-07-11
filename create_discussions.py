import json
import urllib.request
import ssl
import os

def run_graphql(title, body):
    query = """
    mutation($repoId: ID!, $catId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {repositoryId: $repoId, categoryId: $catId, title: $title, body: $body}) {
        discussion {
          url
        }
      }
    }
    """
    variables = {
        "repoId": "R_kgDOSf5g5g",
        "catId": "DIC_kwDOSf5g5s4C-wHy",
        "title": title,
        "body": body
    }
    
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
    
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            print("Response:", json.dumps(res_data, indent=2))
    except Exception as e:
        print("Error:", e)

msg1_title = "🚀 Project Status & Massive Thank You to Our Contributors!"
msg1_body = "Hello everyone!\n\nI just wanted to make a quick announcement that **all systems and deployments are running perfectly well!** 🌟\n\nThe recent fixes to our CI, rate limiting, frontend refactoring, and AI engine improvements have stabilized the application beautifully.\n\nI want to personally encourage and motivate each and every one of you who is contributing. Your PRs, issues, and ideas are making RepoSage truly excellent. Let's keep this momentum going! 🚀 Happy coding, and thank you for being such an amazing community! 🎉"

msg2_title = "🏆 Recognizing Our Top Contributors! 🌟"
msg2_body = "As a massive thank you for all the incredible work being done, I want to give a special shout-out to our top contributors who have been going above and beyond!\n\nYour code, bug reports, and dedication have been absolutely **SUPER** and **THE BEST**! 🚀✨\n\nHere are our Top 5 community contributors making magic happen:\n1. 🥇 **@sahare-mayur-0071** (Superstar contributor!)\n2. 🥈 **@varun-ai69**\n3. 🥉 **@KajalAhir23**\n4. 🌟 **@varshini-nandula**\n5. 🌟 **@RavindiFernando**\n\nThank you all for the outstanding impact you've made on this project. You guys rock! 🔥 Keep up the incredible work!"

run_graphql(msg1_title, msg1_body)
run_graphql(msg2_title, msg2_body)
