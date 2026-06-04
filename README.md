# 🚀 RepoSage: Open Source AI Developer Copilot

![RepoSage Banner](https://via.placeholder.com/1200x400?text=RepoSage+-+AI+Developer+Copilot)

> **"AI-powered developer copilot for code review, documentation, and repository analysis."**

Welcome to **RepoSage**! Developers spend countless hours reviewing code, writing documentation, finding bugs, and understanding unfamiliar repositories. RepoSage automates these processes using AI, allowing you to focus on building great software.

## ✨ Features

- **GitHub Repo Import**: Instantly analyze entire GitHub repositories.
- **AI Code Review**: Automated bug detection, security scanning, and style suggestions.
- **README Generator**: Automatically generate comprehensive documentation for any repository.
- **Multi-language Support**: Fully supports Python, JavaScript, TypeScript, Java, Go, Rust, C++, C#, PHP, Ruby, SQL, HTML, and CSS!
- **Dashboard UI**: Modern, clean, and intuitive dashboard built with React and Vanilla CSS.
- **GitHub Action Bot**: Automated Pull Request code reviewer that posts inline line-by-line feedback directly on GitHub.

## 🏗️ Architecture

The project is split into four main modules:
1. **Frontend**: React + TailwindCSS (User Interface & Dashboard)
2. **Backend**: Node.js + Express (API, Repo Cloning, Queue Management)
3. **AI Engine**: Python + FastAPI (Code Analysis, Prompt Management, LLM Integration)
4. **GitHub Action**: Bundled runner that integrates directly with GitHub Pull Requests

## 🚀 Installation & Setup

Please refer to the setup instructions in each module:
- [Frontend Setup](./frontend/README.md)
- [Backend Setup](./backend/README.md)
- [AI Engine Setup](./ai-engine/README.md)
- [GitHub Action Setup](./github-action/README.md)
- For full API specifications and `curl` examples, see [API.md](./API.md).

### 🤖 Quick Start: GitHub Action Integration

To review Pull Requests automatically in any repo:
1. Create `.github/workflows/reposage-review.yml`:
   ```yaml
   name: RepoSage AI Reviewer
   on:
     pull_request:
       types: [opened, synchronize]
   jobs:
     review:
       runs-on: ubuntu-latest
       permissions:
         pull-requests: write
       steps:
         - name: Checkout Code
           uses: actions/checkout@v4
         - name: Run RepoSage AI PR Audit
           uses: your-username/ai-code-reviewer/github-action@main
           with:
             github-token: ${{ secrets.GITHUB_TOKEN }}
             groq-api-key: ${{ secrets.GROQ_API_KEY }}
   ```


## 🤝 Contributing

We welcome contributions! We are actively participating in **GSSoC**.
Please read our [Contributing Guidelines](CONTRIBUTING.md) to get started.

Check out our [Good First Issues](GOOD_FIRST_ISSUES.md) if you are new here!

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
