const fs = require('fs');
const path = require('path');

function replaceFileContent(filePath, replacements) {
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return;
    }
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    for (const r of replacements) {
        if (content.includes(r.search) || r.search instanceof RegExp) {
            content = content.replace(r.search, r.replace);
            modified = true;
        } else {
            console.warn(`Could not find target content in ${filePath} for ${r.search}`);
        }
    }
    
    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

// backend/index.js fixes
const backendIndex = path.join(__dirname, 'backend', 'index.js');
replaceFileContent(backendIndex, [
    {
        search: `const chatLimiter = rateLimit({`,
        replace: `// 494: Add issueLimiter
const issueLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealClientIp,
  message: { error: 'Too many issue creation requests.' }
});

// 495: Add exportLimiter
const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealClientIp,
  message: { error: 'Too many export requests.' }
});

const chatLimiter = rateLimit({`
    },
    {
        search: `app.post('/api/issues/create', async (req, res) => {`,
        replace: `app.post('/api/issues/create', requireApiKey, issueLimiter, async (req, res) => {`
    },
    {
        search: `app.get('/api/export/pdf', async (req, res) => {`,
        replace: `app.get('/api/export/pdf', requireApiKey, exportLimiter, async (req, res) => {`
    },
    {
        search: `app.get('/api/export/html', async (req, res) => {`,
        replace: `app.get('/api/export/html', requireApiKey, exportLimiter, async (req, res) => {`
    },
    {
        search: `app.post('/api/rag/cleanup', async (req, res) => {`,
        replace: `app.post('/api/rag/cleanup', requireApiKey, async (req, res) => {`
    },
    {
        search: `app.post('/api/rag/split', async (req, res) => {`,
        replace: `app.post('/api/rag/split', requireApiKey, async (req, res) => {`
    },
    {
        search: `const scriptRuns = [...new Set([...prompt].map(ch => {`,
        replace: `const scriptRuns = [...new Set([...normalizeHomoglyphs(prompt)].map(ch => {`
    },
    {
        search: `const overallGrade = computeHealthScore(aggregatedTotal, repoContext.files.length);`,
        replace: `const overallGrade = computeHealthScore(aggregatedTotal, repoContext.files.length || 1);`
    }
]);

// ai-engine/app.py fixes
const aiEngineApp = path.join(__dirname, 'ai-engine', 'app.py');
replaceFileContent(aiEngineApp, [
    {
        search: `class ChatRequest(BaseModel):
    message: str
    repo_url: str`,
        replace: `class ChatRequest(BaseModel):
    message: str
    repo_url: str
    system_prompt: str = ""`
    },
    {
        search: `            return {
                "message": "AI Engine Error: Could not process chat.",
                "error": str(e)
            }`,
        replace: `            return {
                "message": "AI Engine Error: Could not process chat.",
                "error": str(e),
                "_mock": True
            }`
    }
]);

// backend/utils/mockAIReview.js fixes
const mockAIReviewPath = path.join(__dirname, 'backend', 'utils', 'mockAIReview.js');
replaceFileContent(mockAIReviewPath, [
    {
        search: `line: 12,`,
        replace: `line: Math.floor(Math.random() * 50) + 1,`
    },
    {
        search: `line: 5,`,
        replace: `line: Math.floor(Math.random() * 20) + 1,`
    },
    {
        search: `line: 25,`,
        replace: `line: Math.floor(Math.random() * 80) + 1,`
    },
    {
        search: `line: 8,`,
        replace: `line: Math.floor(Math.random() * 30) + 1,`
    }
]);

// ai-engine/text_splitter.py fixes
const textSplitter = path.join(__dirname, 'ai-engine', 'text_splitter.py');
replaceFileContent(textSplitter, [
    {
        search: `def split_file_content(`,
        replace: `def split_file_content(
    file_name: str,
    content: str,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
    repo_url: Optional[str] = None,
) -> list[dict]:
    # 501: No File Size Limit on RAG Split
    if len(content) > 10 * 1024 * 1024:
        return []

    if not content or not content.strip():
        return []
`
    }
]);

console.log('Finished applying more fixes.');
