---
name: "🚀 [MAJOR] Feature: Automated Unit Test Generator"
about: "Build an AI tool to automatically generate test suites for untestable code."
labels: ["enhancement", "gssoc26", "backend", "ai-engine"]
---

### 💡 The Feature
Developers hate writing tests. We want to add a feature to the RepoSage Dashboard where a user can select a file, and the AI will automatically generate a complete, working unit test suite (e.g., Jest for JS/TS, PyTest for Python) for that file.

### 🛠️ Proposed Implementation
1. **Backend Endpoint:** Create a new `/api/generate-tests` endpoint.
2. **AI Engine:** Build a prompt template that takes the source code, identifies exported functions, and writes test cases covering edge cases and normal behavior.
3. **Frontend UI:** Add a "Generate Tests" button next to files in the codebase browser.
4. **File Export:** Allow the user to download the generated `.test.js` or `test_*.py` file directly or create a PR.

### 🏆 Why This Matters
This will drastically reduce developer workload and instantly increase the reliability of any repository plugged into RepoSage!

---
⭐ **Support RepoSage!** If you find this project helpful, please consider giving us a **Star** 🌟 on GitHub! Your support helps us win GSSoC '26 and grow professionally!
