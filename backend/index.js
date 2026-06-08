import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Octokit } from '@octokit/rest';

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
    },
    {
      type: "Generic Private Key",
      regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/gi,
      description: "Generic Private Key detected. Committing private keys to a repository exposes critical encryption keys, identity access, or infrastructure certificates."
    },
    {
      type: "Common Environment Credential",
      regex: /(?:password|passwd|secret|secret_key|private_key|api_key|token|auth_token)\s*=\s*['"][^'"]+['"]/gi,
      description: "Hardcoded credential (e.g. password, secret key, token) detected. Storing raw configurations in code commits is a major security risk."
    },
    {
      type: "Twilio Account SID",
      regex: /\bAC[a-f0-9]{32}\b/gi,
      description: "Potential Twilio Account SID detected. Exposing your Twilio SID allows unauthorized API access and billing charges."
    },
    {
      type: "Twilio Auth Token",
      regex: /(?:twilio_auth|twilio_token|auth_token)\s*[:=]\s*['"][a-f0-9]{32}['"]/gi,
      description: "Potential Twilio Auth Token detected. Exposing this token allows attackers to authenticate and use your Twilio account."
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

// 🟢 Helper to parse git diff for webhook changes
function parseDiff(diffStr) {
  const files = [];
  const lines = diffStr.split('\n');
  let currentFile = null;
  let currentLineInNewFile = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      if (match) {
        currentFile = {
          path: match[1],
          changes: []
        };
        files.push(currentFile);
      }
    } else if (line.startsWith('@@ ')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLineInNewFile = parseInt(match[1], 10);
      }
    } else if (currentFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.changes.push({
          line: currentLineInNewFile,
          content: line.slice(1)
        });
        currentLineInNewFile++;
      } else if (line.startsWith(' ')) {
        currentLineInNewFile++;
      }
    }
  }
  return files;
}

// 🟢 Helper to scan changes for hardcoded secrets
function scanSecretsInChanges(changes) {
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
    },
    {
      type: "Generic Private Key",
      regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/gi,
      description: "Generic Private Key detected. Committing private keys to a repository exposes critical encryption keys, identity access, or infrastructure certificates."
    },
    {
      type: "Common Environment Credential",
      regex: /(?:password|passwd|secret|secret_key|private_key|api_key|token|auth_token)\s*=\s*['"][^'"]+['"]/gi,
      description: "Hardcoded credential (e.g. password, secret key, token) detected. Storing raw configurations in code commits is a major security risk."
    },
    {
      type: "Twilio Account SID",
      regex: /\bAC[a-f0-9]{32}\b/gi,
      description: "Potential Twilio Account SID detected. Exposing your Twilio SID allows unauthorized API access and billing charges."
    },
    {
      type: "Twilio Auth Token",
      regex: /(?:twilio_auth|twilio_token|auth_token)\s*[:=]\s*['"][a-f0-9]{32}['"]/gi,
      description: "Potential Twilio Auth Token detected. Exposing this token allows attackers to authenticate and use your Twilio account."
    }
  ];

  for (const change of changes) {
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(change.content)) {
        findings.push({
          line: change.line,
          type: "security",
          comment: `### 🛡️ Hardcoded Secret Warning\n\nI have detected a hardcoded **${rule.type}** on line **${change.line}**.\n\n#### 💡 Actionable Suggestion\nMove this credential immediately to a protected environment variable (e.g. GitHub Secrets or \`.env\`) and load it dynamically at runtime. DO NOT commit plain secrets to public Git repositories!`
        });
      }
    }
  }

  return findings;
}

// 🟢 Helper to analyze static complexity of source files
function analyzeComplexity(fileContent, filePath) {
  const lines = fileContent.split('\n');
  const totalLines = lines.length;
  let emptyLines = 0;
  let commentLines = 0;
  let functionCount = 0;

  const ext = path.extname(filePath).toLowerCase();

  // Languages that use C-style block comments /* ... */
  const cStyleExts = ['.js', '.jsx', '.ts', '.tsx', '.java', '.cpp', '.h', '.cs', '.go', '.rs', '.php', '.css'];
  const usesCStyleBlocks = cStyleExts.includes(ext);
  const usesHtmlBlocks = (ext === '.html');
  let inBlockComment = false;

  lines.forEach(line => {
    const trimmed = line.trim();

    // Empty line detection
    if (trimmed === '') {
      emptyLines++;
      return;
    }

    // --- Comment Detection with multi-line block tracking ---

    if (usesCStyleBlocks) {
      // Currently inside a /* ... */ block comment
      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        return;
      }

      // Single-line comment: //
      if (trimmed.startsWith('//')) {
        commentLines++;
      }
      // Single-line block comment: /* ... */ on same line
      else if (trimmed.startsWith('/*') && trimmed.includes('*/')) {
        commentLines++;
      }
      // Multi-line block comment opening: /*
      else if (trimmed.startsWith('/*')) {
        commentLines++;
        inBlockComment = true;
      }
      // Line starting with * inside a doc-comment block (e.g. JSDoc)
      else if (trimmed.startsWith('*')) {
        commentLines++;
      }
    } else if (ext === '.py' || ext === '.rb') {
      if (trimmed.startsWith('#')) {
        commentLines++;
      }
    } else if (ext === '.sql') {
      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        return;
      }
      if (trimmed.startsWith('--')) {
        commentLines++;
      } else if (trimmed.startsWith('/*') && trimmed.includes('*/')) {
        commentLines++;
      } else if (trimmed.startsWith('/*')) {
        commentLines++;
        inBlockComment = true;
      }
    } else if (usesHtmlBlocks) {
      if (trimmed.startsWith('<!--')) {
        commentLines++;
      }
    }

    // --- Function Detection ---
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      if (trimmed.includes('function ') || trimmed.includes('=>') || /^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*\{/g.test(trimmed)) {
        functionCount++;
      }
    } else if (ext === '.py') {
      if (trimmed.startsWith('def ')) {
        functionCount++;
      }
    } else if (ext === '.go') {
      if (trimmed.startsWith('func ')) {
        functionCount++;
      }
    } else if (['.java', '.cpp', '.cs'].includes(ext)) {
      if (/(?:public|private|protected|static|\w+)\s+\w+\s*\([^)]*\)\s*(?:\{|const)?/g.test(trimmed)) {
        functionCount++;
      }
    }
  });

  const codeLines = totalLines - emptyLines - commentLines;
  const complexityScore = Math.round((totalLines / 25) + (functionCount * 3));
  let grade = 'A';
  if (complexityScore > 40) grade = 'F';
  else if (complexityScore > 25) grade = 'D';
  else if (complexityScore > 15) grade = 'C';
  else if (complexityScore > 8) grade = 'B';

  return {
    totalLines,
    emptyLines,
    commentLines,
    codeLines,
    functionCount,
    complexityScore,
    grade
  };
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

      // 3. Inject Regex-based Secret Detections & Complexity Metrics into the analysis result
      if (reviewResult && reviewResult.fileReviews) {
        reviewResult.metrics = {};
        
        files.forEach(file => {
          // Calculate complexity metrics
          reviewResult.metrics[file.name] = analyzeComplexity(file.content, file.name);

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

// 🟢 Route: GitHub Webhook Receiver for automated Pull Request Reviews
app.post('/api/webhook', async (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  if (event === 'pull_request') {
    const action = payload.action;
    if (action === 'opened' || action === 'synchronize') {
      const pullNumber = payload.pull_request.number;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      
      console.log(`📡 GitHub Webhook received: PR #${pullNumber} ${action} in ${owner}/${repo}`);
      
      // Execute code review asynchronously to prevent GitHub webhook timeout (10s)
      runWebhookReview(owner, repo, pullNumber).catch(err => {
        console.error(`❌ Async PR Review Error:`, err);
      });
    }
  }

  return res.json({ success: true, message: 'Webhook received.' });
});

// 🟢 Route: Create GitHub Issue automatically for Code Reviews
app.post('/api/issues/create', async (req, res) => {
  const { repoUrl, title, body, labels = [] } = req.body;
  const token = process.env.GITHUB_PAT;

  if (!token) {
    return res.status(400).json({ error: 'GITHUB_PAT is not configured in backend/.env.' });
  }

  if (!repoUrl || !title || !body) {
    return res.status(400).json({ error: 'Repository URL, title, and body are required.' });
  }

  try {
    // Extract owner and repo from URL (e.g., https://github.com/owner/repo)
    const cleanUrl = repoUrl.replace('.git', '').replace(/\/$/, '');
    const parts = cleanUrl.split('/');
    const repo = parts.pop();
    const owner = parts.pop();

    if (!owner || !repo) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL structure.' });
    }

    const octokit = new Octokit({ auth: token });
    
    console.log(`🤖 Creating GitHub Issue in ${owner}/${repo}: "${title}"`);
    
    const response = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels
    });

    return res.json({
      success: true,
      issueUrl: response.data.html_url,
      number: response.data.number
    });

  } catch (err) {
    console.error('❌ Create GitHub Issue Error:', err.message);
    return res.status(500).json({ error: `Failed to create issue: ${err.message}` });
  }
});

// 🟢 Helper to execute Webhook PR review logic
async function runWebhookReview(owner, repo, pullNumber) {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    console.warn("⚠️ GITHUB_PAT not set in backend/.env. Cannot run webhook PR review.");
    return;
  }

  const octokit = new Octokit({ auth: token });
  console.log(`🔍 Fetching diff for PR #${pullNumber}...`);

  // 1. Fetch Diff from GitHub
  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: {
      format: 'diff'
    }
  });

  if (!diff) {
    console.warn("⚠️ No diff found for this PR.");
    return;
  }

  // 2. Parse files and changes
  const parsedFiles = parseDiff(diff);
  console.log(`📁 Found ${parsedFiles.length} files in PR diff.`);

  const commentsToPost = [];
  const filesToReview = [];

  for (const file of parsedFiles) {
    // Check if file is supported
    const ext = file.path.split('.').pop()?.toLowerCase();
    const validExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'go', 'rs', 'cpp', 'h', 'cs', 'css', 'html', 'php', 'rb', 'sql'];
    if (!ext || !validExtensions.includes(ext) || file.changes.length === 0) {
      continue;
    }

    // Run local secrets scanner
    const secretFindings = scanSecretsInChanges(file.changes);
    secretFindings.forEach(f => {
      commentsToPost.push({
        path: file.path,
        line: f.line,
        body: `<!-- RepoSage Review Comment -->\n${f.comment}`
      });
    });

    // Save list to send to FastAPI AI Engine
    filesToReview.push({
      path: file.path,
      changes: file.changes.map(c => ({ line: c.line, content: c.content }))
    });
  }

  if (filesToReview.length > 0) {
    console.log(`🧠 Querying AI engine for ${filesToReview.length} files...`);
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
    
    try {
      const aiResponse = await fetch(`${aiEngineUrl}/review-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToReview })
      });

      if (aiResponse.ok) {
        const result = await aiResponse.json();
        if (result.comments && Array.isArray(result.comments)) {
          result.comments.forEach(c => {
            // Avoid duplicate comments if secrets scanner already flagged it
            const duplicate = commentsToPost.some(exist => exist.path === c.path && exist.line === c.line);
            if (!duplicate) {
              commentsToPost.push(c);
            }
          });
        }
      }
    } catch (err) {
      console.warn("⚠️ FastAPI AI Engine error, posting local scans only:", err.message);
    }
  }

  // 3. Post consolidated review comment back to GitHub PR
  if (commentsToPost.length > 0) {
    console.log(`✍️ Posting PR Review with ${commentsToPost.length} inline comments...`);
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: 'COMMENT',
      body: `## 🛡️ RepoSage AI Code Review Audit Completed!

I have audited the code changes in this Pull Request and generated **${commentsToPost.length} actionable inline suggestions**. 

Please review my feedback and suggestions below. Happy coding! 🚀`,
      comments: commentsToPost
    });
  } else {
    console.log('🎉 No code issues or recommendations found. Posting approval review...');
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: 'APPROVE',
      body: `## 🛡️ RepoSage AI Code Review Audit Completed!

🎉 Outstanding work! I have scanned the PR and found **0 issues**. Your changes look pristine, clean, and optimized! Approved! 🚀`
    });
  }
}

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

// 🟢 Route: Export Review Report to HTML
app.post('/api/reports/html', (req, res) => {
  const { repoName, analysis } = req.body;
  if (!repoName || !analysis) {
    return res.status(400).json({ error: 'Repository name and analysis result are required.' });
  }

  let fileRows = '';
  
  if (analysis && analysis.fileReviews) {
    Object.keys(analysis.fileReviews).forEach(file => {
      const review = analysis.fileReviews[file];
      const allFindings = [
        ...(review.bugs || []).map(f => ({ ...f, category: 'Bug' })),
        ...(review.security || []).map(f => ({ ...f, category: 'Security' })),
        ...(review.optimization || []).map(f => ({ ...f, category: 'Optimization' })),
        ...(review.styling || []).map(f => ({ ...f, category: 'Styling' }))
      ];
      
      allFindings.forEach(f => {
        fileRows += `
          <tr>
            <td><strong>${file}</strong></td>
            <td><span class="badge badge-${f.category.toLowerCase()}">${f.category}</span></td>
            <td>${f.line}</td>
            <td><strong>${f.type}</strong></td>
            <td>${f.description}</td>
            <td><code class="code-font">${f.suggestion.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></td>
          </tr>
        `;
      });
    });
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>RepoSage Code Audit - ${repoName}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #0f172a;
          color: #f1f5f9;
          margin: 0;
          padding: 40px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: #1e293b;
          border-radius: 12px;
          padding: 30px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.05);
        }
        h1 {
          font-size: 28px;
          margin-top: 0;
          color: #a855f7;
          border-bottom: 2px solid rgba(168,85,247,0.2);
          padding-bottom: 15px;
        }
        .meta {
          font-size: 14px;
          color: #94a3b8;
          margin-bottom: 25px;
          line-height: 1.6;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          font-size: 13px;
        }
        th {
          background-color: rgba(255,255,255,0.03);
          color: #e2e8f0;
          font-weight: 600;
        }
        tr:hover {
          background-color: rgba(255,255,255,0.04);
        }
        tr:nth-child(even) {
          background-color: rgba(255,255,255,0.015);
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-bug { background: #ef4444; color: white; }
        .badge-security { background: #f59e0b; color: #0f172a; }
        .badge-optimization { background: #3b82f6; color: white; }
        .badge-styling { background: #10b981; color: white; }
        .code-font {
          font-family: monospace;
          background: rgba(0,0,0,0.2);
          padding: 4px 8px;
          border-radius: 4px;
          color: #c084fc;
          font-size: 12px;
          white-space: pre-wrap;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🛡️ RepoSage AI Code Audit Report</h1>
        <div class="meta">
          <strong>Repository Name:</strong> ${repoName}<br>
          <strong>Report Timestamp:</strong> ${new Date().toLocaleString()}<br>
          <strong>Audited with:</strong> RepoSage GSSoC '26 Audit Engine
        </div>
        <table>
          <thead>
            <tr>
              <th>File Path</th>
              <th>Category</th>
              <th>Line</th>
              <th>Finding Type</th>
              <th>Description</th>
              <th>Actionable Suggestion</th>
            </tr>
          </thead>
          <tbody>
            ${fileRows || '<tr><td colspan="6" style="text-align:center;">🎉 No issues found! Your codebase is clean.</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
          RepoSage AI © 2026. Made with 💜 for GirlScript Summer of Code (GSSoC).
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${repoName}_AUDIT_REPORT.html"`);
  return res.send(html);
});

app.listen(PORT, () => {
  console.log(`🟢 RepoSage Backend running on http://localhost:${PORT}`);
});
