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
            console.warn(`Could not find target content in ${filePath}`);
        }
    }
    
    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

// 1. Fix backend/config/db.js
replaceFileContent(path.join(__dirname, 'backend', 'config', 'db.js'), [
    {
        search: `      await connectDatabase();`,
        replace: `      connectionPromise = null;\n      await connectDatabase();`
    }
]);

// 2. Fix backend/models/Analytics.js
replaceFileContent(path.join(__dirname, 'backend', 'models', 'Analytics.js'), [
    {
        search: `  analyzedAt: {
    type: Date,
    default: Date.now,
  },`,
        replace: `  analyzedAt: {
    type: Date,
    default: Date.now,
    expires: 2592000,
  },`
    }
]);

// 3. Fix backend/utils/urlValidator.js
replaceFileContent(path.join(__dirname, 'backend', 'utils', 'urlValidator.js'), [
    {
        search: `  return GITHUB_URL_PATTERN.test(url) || GITHUB_URL_WITH_DOT_GIT.test(url);`,
        replace: `  try {
    const parsed = new URL(url);
    const cleanUrl = parsed.origin + parsed.pathname;
    return GITHUB_URL_PATTERN.test(cleanUrl) || GITHUB_URL_WITH_DOT_GIT.test(cleanUrl);
  } catch (e) {
    return false;
  }`
    }
]);

// 4. Fix backend/utils/repoReader.js
replaceFileContent(path.join(__dirname, 'backend', 'utils', 'repoReader.js'), [
    {
        search: `const list = input ?? DEFAULT_EXTENSIONS;`,
        replace: `const list = Array.isArray(input) ? input : DEFAULT_EXTENSIONS;`
    }
]);

// 5. Fix backend/utils/ignoreHelper.js
replaceFileContent(path.join(__dirname, 'backend', 'utils', 'ignoreHelper.js'), [
    {
        search: `const escaped = pattern.replace(/[.+^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*/g, '[^/]*');`,
        replace: `const escaped = pattern.replace(/[.+^\${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*\\*/g, '.*').replace(/\\*/g, '[^/]*');`
    }
]);

// 6. Fix ai-engine/rag.py
replaceFileContent(path.join(__dirname, 'ai-engine', 'rag.py'), [
    {
        search: `    all_results = collection.get(include=["metadatas"])`,
        replace: `    # Using pagination to avoid OOM
    offset = 0
    batch_size = 1000
    stored_paths = set()
    while True:
        results = collection.get(include=["metadatas"], limit=batch_size, offset=offset)
        metadatas = results.get("metadatas")
        if not metadatas:
            break
        for m in metadatas:
            if m and m.get("source_file"):
                stored_paths.add(m.get("source_file"))
        if len(metadatas) < batch_size:
            break
        offset += batch_size
    
    stale_paths = stored_paths - current_files`
    },
    {
        search: `    stored_paths = {
        m.get("source_file")
        for m in (all_results.get("metadatas") or [])
        if m.get("source_file")
    }
    stale_paths = stored_paths - current_files`,
        replace: ``
    }
]);

// 7. Fix backend/utils/complexityAnalyzer.js
replaceFileContent(path.join(__dirname, 'backend', 'utils', 'complexityAnalyzer.js'), [
    {
        search: `    } else if (usesHtmlBlocks) {
      if (trimmed.startsWith('<!--')) {
        commentLines++;
      }
    }`,
        replace: `    } else if (usesHtmlBlocks) {
      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('-->')) {
          inBlockComment = false;
        }
        return;
      }
      if (trimmed.startsWith('<!--') && trimmed.includes('-->')) {
        commentLines++;
      } else if (trimmed.startsWith('<!--')) {
        commentLines++;
        inBlockComment = true;
      }
    }`
    }
]);

// 8. Fix frontend/src/layouts/SidebarLayout.tsx
replaceFileContent(path.join(__dirname, 'frontend', 'src', 'layouts', 'SidebarLayout.tsx'), [
    {
        search: `background: 'rgba(15, 23, 42, 0.6)'`,
        replace: `background: 'var(--panel-bg)'`
    },
    {
        search: `color: '#f3f4f6'`,
        replace: `color: 'var(--title-color)'`
    }
]);

// 9. Fix frontend/src/RepositoryOverview.tsx
replaceFileContent(path.join(__dirname, 'frontend', 'src', 'RepositoryOverview.tsx'), [
    {
        search: `const RepositoryOverview: React.FC<Props> = ({ files }) => {`,
        replace: `const RepositoryOverview: React.FC<Props> = ({ files = [] }) => {`
    }
]);

// 10. Fix frontend/src/App.tsx
replaceFileContent(path.join(__dirname, 'frontend', 'src', 'App.tsx'), [
    {
        search: `  const handleApply = () => {
    onApply(text);
    setApplied(true);
    setOpen(false);
    setTimeout(() => setApplied(false), 2000);
  };`,
        replace: `  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleApply = () => {
    onApply(text);
    setApplied(true);
    setOpen(false);
    timeoutRef.current = setTimeout(() => setApplied(false), 2000);
  };`
    }
]);
