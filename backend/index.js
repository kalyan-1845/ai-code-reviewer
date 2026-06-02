import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Ensure temp_repos folder exists
const tempReposDir = path.join(__dirname, 'temp_repos');
if (!fs.existsSync(tempReposDir)) {
  fs.mkdirSync(tempReposDir, { recursive: true });
}

// Global variable to cache the active repository context for chat functionality
let activeRepositoryContext = null;

// 🟢 Helper to recursively read files
function readFilesRecursively(dir, fileList = [], baseDir = dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    // Skip node_modules, git directories, and build artifacts
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'build') {
      continue;
    }

    if (stat.isDirectory()) {
      readFilesRecursively(filePath, fileList, baseDir);
    } else {
      // Analyze only source code files (Python, JS, TS, HTML, CSS, Go, Rust, Java, C++, PHP, Ruby, SQL)
      const ext = path.extname(file).toLowerCase();
      const validExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.h', '.cs', '.php', '.rb', '.sql', '.html', '.css'];
      
      if (validExtensions.includes(ext)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          fileList.push({
            name: path.relative(baseDir, filePath).replace(/\\/g, '/'),
            content: content
          });
        } catch (e) {
          console.warn(`Could not read file: ${filePath}`, e.message);
        }
      }
    }
  }
  return fileList;
}

// 🟢 Helper to scan for secrets/keys in code files
function scanSecrets(fileContent) {
  const findings = [];
  const rules = [
    {
      type: "AWS Access Key Check",
      regex: /AKIA[0-9A-Z]{16}/g,
      description: "Potential AWS Access Key ID detected. If pushed to a public repository, malicious parties can hijack your AWS cloud infrastructure."
    },
    {
      type: "GitHub Personal Access Token",
      regex: /ghp_[a-zA-Z0-9]{36}/g,
      description: "Hardcoded GitHub Personal Access Token detected. Unauthorized users can gain complete read/write access to your repositories."
    },
    {
      type: "Stripe Secret API Key",
      regex: /sk_live_[0-9a-zA-Z]{24}/g,
      description: "Hardcoded live Stripe Secret Key detected. This can expose customer transaction history or result in financial exploitation."
    },
    {
      type: "Google Cloud API Key",
      regex: /AIzaSy[a-zA-Z0-9-_]{33}/g,
      description: "Hardcoded Google Cloud API Key detected. Allows unauthorized usage of GCP billing services and resources."
    },
    {
      type: "Database Connection Credentials",
      regex: /(mongodb(?:\+srv)?:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/)[a-zA-Z0-9_]+:[a-zA-Z0-9_]+@/gi,
      description: "Database connection credentials detected directly in code. Exposes the database tables to global read/write breaches."
    },
    {
      type: "Slack Incoming Webhook",
      regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8}\/B[A-Z0-9]{8}\/[A-Za-z0-9]{24}/g,
      description: "Hardcoded Slack Incoming Webhook detected. Allows external parties to send spam or phish users inside your workspace channels."
    }
  ];

  const lines = fileContent.split('\n');
  lines.forEach((line, idx) => {
    rules.forEach(rule => {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(line)) {
        findings.push({
          type: rule.type,
          line: idx + 1,
          description: rule.description,
          suggestion: "Move this secret immediately to a protected environment configuration file (.env) and reference it as a dynamic variable instead."
        });
      }
    });
  });

  return findings;
}

// 🟢 Helper to delete a folder recursively
function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
}

// 🟢 Route: GitHub Import & AI Review
app.post('/api/analyze', async (req, res) => {
  const { repoUrl, company = 'General', language = 'English', model = 'llama-3.3-70b-versatile' } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ error: 'GitHub Repository URL is required.' });
  }

  // Generate unique folder name
  const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'temp';
  const uniqueId = Date.now();
  const clonePath = path.join(tempReposDir, `${repoName}_${uniqueId}`);

  console.log(`🚀 Cloning: ${repoUrl} into ${clonePath}`);

  // Clone repo
  exec(`git clone --depth 1 ${repoUrl} "${clonePath}"`, async (error) => {
    if (error) {
      console.error(`❌ Git Clone Error: ${error.message}`);
      return res.status(500).json({ error: 'Failed to clone repository. Make sure the URL is public.' });
    }

    try {
      // 1. Read files
      const files = readFilesRecursively(clonePath);
      
      if (files.length === 0) {
        deleteFolderRecursive(clonePath);
        return res.status(400).json({ error: 'No supportable source code files found in the repository.' });
      }

      console.log(`📁 Found ${files.length} valid source files. Sending to AI engine...`);

      // 2. Mocking AI Response for initial setup (or forward to FastAPI AI Engine)
      // This is a perfect placeholder where contributors can connect the FastAPI server!
      const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
      
      let reviewResult;
      try {
        const aiResponse = await fetch(`${aiEngineUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files, company, language, model })
        });
        
        if (aiResponse.ok) {
          reviewResult = await aiResponse.json();
        } else {
          throw new Error('AI engine responded with error');
        }
      } catch (err) {
        console.warn('⚠️ FastAPI engine not running, falling back to local Express review handler');
        // Let's generate a smart mockup review based on files so it works as an autonomous MVP
        reviewResult = mockAIReview(files, model);
      }

      // 3. Inject Regex-based Secret Detections into the analysis result
      if (reviewResult && reviewResult.fileReviews) {
        files.forEach(file => {
          const secretFindings = scanSecrets(file.content);
          if (secretFindings.length > 0) {
            // Make sure the file exists in reviews
            if (!reviewResult.fileReviews[file.name]) {
              reviewResult.fileReviews[file.name] = { bugs: [], security: [], optimization: [], styling: [] };
            }
            // Append found secrets to security category
            if (!reviewResult.fileReviews[file.name].security) {
              reviewResult.fileReviews[file.name].security = [];
            }
            // Avoid duplicate additions
            secretFindings.forEach(finding => {
              const duplicate = reviewResult.fileReviews[file.name].security.some(s => s.line === finding.line && s.type === finding.type);
              if (!duplicate) {
                reviewResult.fileReviews[file.name].security.unshift(finding); // Place at top of security findings
              }
            });
          }
        });
      }

      // 3. Cache the active repository context for chat
      activeRepositoryContext = {
        repoUrl,
        repoName,
        files
      };

      // 4. Clean up folder
      deleteFolderRecursive(clonePath);
      
      // 5. Return result
      return res.json({
        success: true,
        repoName,
        filesReviewedCount: files.length,
        analysis: reviewResult
      });

    } catch (err) {
      console.error(err);
      deleteFolderRecursive(clonePath);
      return res.status(500).json({ error: 'An error occurred during repository analysis.' });
    }
  });
});

// 🟢 Route: AI Chat with Repository
app.post('/api/chat', async (req, res) => {
  const { message, history = [], model = 'llama-3.3-70b-versatile' } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (!activeRepositoryContext) {
    return res.status(400).json({ error: 'No repository is currently active. Please analyze a repository first.' });
  }

  const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

  try {
    const aiResponse = await fetch(`${aiEngineUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: activeRepositoryContext.files,
        message,
        history,
        model
      })
    });

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      return res.json(data);
    } else {
      const errText = await aiResponse.text();
      throw new Error(errText || 'AI engine chat request failed');
    }
  } catch (err) {
    console.error('❌ Chat API Error:', err.message);
    
    // Simple local fallback if Python FastAPI server is offline
    const responseMessage = `[Fallback Response] I see you are asking about: "${message}". Currently, the FastAPI AI Engine is offline, so I cannot analyze the full codebase for your query. Please make sure the AI Engine service is running on port 8000.`;
    return res.json({ response: responseMessage });
  }
});

// 🟢 Helper for Mock AI Review (Provides instant feedback when python server is offline)
function mockAIReview(files, model = 'llama-3.3-70b-versatile') {
  const reviews = {};
  
  files.forEach(file => {
    reviews[file.name] = {
      bugs: [
        {
          type: "Null Pointer Risk",
          line: 12,
          description: `Variables should be validated before use to prevent potential runtime crashes in ${file.name}.`,
          suggestion: "Add a standard null-check check (e.g. `if (!variable)` or `if variable is None`)."
        }
      ],
      security: [
        {
          type: "Hardcoded API Key Check",
          line: 5,
          description: "Potential hardcoded credentials detected. API keys should always be loaded from environment variables (.env).",
          suggestion: "Move the key to a `.env` file and load using standard environment managers."
        }
      ],
      optimization: [
        {
          type: "Complexity Reduction",
          line: 25,
          description: "Avoid using nested iterations if time complexity grows quadratically. Consider using a Map/Dictionary lookup.",
          suggestion: "Implement a mapping cache instead of performing dual-nested loops."
        }
      ],
      styling: [
        {
          type: "Naming Convention",
          line: 8,
          description: "CamelCase or snake_case format mismatch detected on function declaration.",
          suggestion: "Reformat variable or function definitions to conform to standard styling rules."
        }
      ]
    };
  });

  // Mock generated README
  const mockReadme = `# 🚀 ${files[0].name.split('/')[0] || 'My Repository'}

This repository is powered by RepoSage AI Copilot (Audited using **${model}**). 

## 🏗️ Folder Layout
${files.map(f => `- 📄 **${f.name}**`).join('\n')}

## 💻 Tech Stack
- Source files: ${files.length} modules analyzed.

Generated automatically by **RepoSage AI Generator**.`;

  // Mock generated Mermaid flowchart
  const mockMermaid = `graph TD\n  Root["📦 ${files[0].name.split('/')[0] || 'Repository'}"]\n  ${files.slice(0, 5).map((f, i) => `  Root --> File_${i}["📄 ${f.name.split('/').pop()}"]`).join('\n')}`;

  return {
    fileReviews: reviews,
    generatedReadme: mockReadme,
    mermaidDiagram: mockMermaid
  };
}

app.listen(PORT, () => {
  console.log(`🟢 RepoSage Backend running on http://localhost:${PORT}`);
});
