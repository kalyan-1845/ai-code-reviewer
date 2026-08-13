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
  let cyclomaticComplexity = 1;
  let operatorsCount = 0;
  let operandsCount = 0;
  const uniqueOperators = new Set();
  const uniqueOperands = new Set();

  const ext = path.extname(filePath || '').toLowerCase();

  // Languages that use C-style block comments /* ... */
  const cStyleExts = ['.js', '.jsx', '.ts', '.tsx', '.java', '.cpp', '.h', '.cs', '.go', '.rs', '.php', '.css'];
  const usesCStyleBlocks = cStyleExts.includes(ext);
  const usesHtmlBlocks = (ext === '.html');
  let inBlockComment = false;
  let inPyBlockComment = false;
  let pyBlockQuoteChar = null;

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
        return;
      }
      // Single-line block comment: /* ... */ on same line
      else if (trimmed.startsWith('/*') && trimmed.includes('*/')) {
        commentLines++;
        return;
      }
      // Multi-line block comment opening: /*
      else if (trimmed.startsWith('/*')) {
        commentLines++;
        inBlockComment = true;
        return;
      }
    } else if (ext === '.py' || ext === '.rb') {
      if (ext === '.py') {
        if (inPyBlockComment) {
          commentLines++;
          if (trimmed.includes(pyBlockQuoteChar)) {
            inPyBlockComment = false;
            pyBlockQuoteChar = null;
          }
          return;
        }
        if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
          commentLines++;
          const quoteChar = trimmed.startsWith('"""') ? '"""' : "'''";
          if (trimmed.slice(3).includes(quoteChar)) {
            // Closed on same line
          } else {
            inPyBlockComment = true;
            pyBlockQuoteChar = quoteChar;
          }
          return;
        }
      }
      if (trimmed.startsWith('#')) {
        commentLines++;
        return;
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
        return;
      } else if (trimmed.startsWith('/*') && trimmed.includes('*/')) {
        commentLines++;
        return;
      } else if (trimmed.startsWith('/*')) {
        commentLines++;
        inBlockComment = true;
        return;
      }
    } else if (usesHtmlBlocks) {
      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('-->')) {
          inBlockComment = false;
        }
        return;
      }
      if (trimmed.startsWith('<!--')) {
        commentLines++;
        if (trimmed.includes('-->')) {
          return;
        }
        inBlockComment = true;
      }
    }

    // --- Function Detection ---
    let codeWithoutStrings = trimmed;
    codeWithoutStrings = codeWithoutStrings
      .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')
      .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''")
      .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, "``");

    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      if (codeWithoutStrings.includes('function ') || codeWithoutStrings.includes('=>') || /^\s*(?:async\s+)?(?!(?:if|for|while|switch|catch)\b)\w+\s*\((?:[^()]|\([^()]*\))*\)\s*\{/.test(codeWithoutStrings)) {
        functionCount++;
      }
    } else if (ext === '.py') {
      if (codeWithoutStrings.startsWith('def ') || codeWithoutStrings.startsWith('async def ')) {
        functionCount++;
      }
    } else if (ext === '.go') {
      if (codeWithoutStrings.startsWith('func ')) {
        functionCount++;
      }
    } else if (['.java', '.cpp', '.cs'].includes(ext)) {
      if (/(?:public|private|protected|static|(?!(?:if|else|for|while|switch|catch)\b)\w+)\s+(?!(?:if|else|for|while|switch|catch)\b)\w+\s*\([^)]*\)\s*(?:\{|const)?/.test(codeWithoutStrings)) {
        functionCount++;
      }
    }

    // --- Complexity Calculation ---
    const decisionRegex = /\b(if|else if|for|while|case|catch)\b|\?|&&|\|\|/g;
    const matchDecisions = codeWithoutStrings.match(decisionRegex);
    if (matchDecisions) cyclomaticComplexity += matchDecisions.length;

    const operatorRegex = /([+\-*/%=!><&|^~?:]+)/g;
    const matchOperators = codeWithoutStrings.match(operatorRegex);
    if (matchOperators) {
      operatorsCount += matchOperators.length;
      for (const op of matchOperators) uniqueOperators.add(op);
    }

    const operandRegex = /\b([a-zA-Z0-9_]+)\b/g;
    const matchOperands = codeWithoutStrings.match(operandRegex);
    const keywords = new Set(['if', 'else', 'for', 'while', 'case', 'catch', 'switch', 'return', 'function', 'class', 'const', 'let', 'var', 'import', 'export', 'default', 'true', 'false', 'null', 'undefined', 'new']);
    if (matchOperands) {
      for (const op of matchOperands) {
        if (!keywords.has(op)) {
          operandsCount++;
          uniqueOperands.add(op);
        }
      }
    }
  });

  const codeLines = Math.max(0, totalLines - emptyLines - commentLines);
  const complexityScore = Math.round((totalLines / 25) + (functionCount * 3));
  
  const N = operatorsCount + operandsCount;
  const n = (uniqueOperators.size || 1) + (uniqueOperands.size || 1);
  const halsteadComplexity = Math.round(N * Math.log2(n) * 0.1) || 0; // scaled down to fit standard score ranges

  let grade = 'A';
  if (cyclomaticComplexity > 100 || complexityScore > 40) grade = 'F';
  else if (cyclomaticComplexity > 50 || complexityScore > 25) grade = 'D';
  else if (cyclomaticComplexity > 20 || complexityScore > 15) grade = 'C';
  else if (cyclomaticComplexity > 10 || complexityScore > 8) grade = 'B';

  return {
    totalLines,
    emptyLines,
    commentLines,
    codeLines,
    functionCount,
    complexityScore,
    cyclomaticComplexity,
    halsteadComplexity,
    grade
  };
}
