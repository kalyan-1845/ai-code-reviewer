import path from 'path';

// 🟢 Helper to analyze static complexity of source files
export function analyzeComplexity(fileContent, filePath) {
  if (!fileContent || typeof fileContent !== 'string') {
    return {
      totalLines: 0,
      emptyLines: 0,
      commentLines: 0,
      codeLines: 0,
      functionCount: 0,
      complexityScore: 0,
      grade: 'A'
    };
  }

  const lines = fileContent.split('\n');
  const totalLines = lines.length;
  let emptyLines = 0;
  let commentLines = 0;
  let functionCount = 0;

  const ext = path.extname(filePath || '').toLowerCase();

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
      else if (inBlockComment && trimmed.startsWith('*')) {
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
      if (trimmed.includes('function ') || trimmed.includes('=>') || /^\s*(?:async\s+)?(?!(?:if|for|while|switch|catch)\b)\w+\s*\([^)]*\)\s*\{/.test(trimmed)) {
        functionCount++;
      }
    } else if (ext === '.py') {
      if (trimmed.startsWith('def ') || trimmed.startsWith('async def ')) {
        functionCount++;
      }
    } else if (ext === '.go') {
      if (trimmed.startsWith('func ')) {
        functionCount++;
      }
    } else if (['.java', '.cpp', '.cs'].includes(ext)) {
      if (/(?:public|private|protected|static|(?!(?:if|else|for|while|switch|catch)\b)\w+)\s+(?!(?:if|else|for|while|switch|catch)\b)\w+\s*\([^)]*\)\s*(?:\{|const)?/.test(trimmed)) {
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
