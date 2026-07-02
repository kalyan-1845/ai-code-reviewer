import fs from 'fs';
import path from 'path';

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes('console.')) return;
  
  // Calculate relative path to logger.js
  const dirParts = path.dirname(filePath).split(path.sep);
  const depth = dirParts.length === 1 && dirParts[0] === '.' ? 0 : dirParts.length;
  let prefix = '';
  if (depth === 0) {
    prefix = './utils/logger.js';
  } else {
    prefix = '../'.repeat(depth) + 'utils/logger.js';
  }
  
  if (filePath.endsWith('logger.js')) return;
  
  // Add import if not present
  if (!content.includes('import logger from')) {
    // Add import statement at the top of the file
    // Handle cases where the first line might be a shebang or something else
    content = `import logger from '${prefix.replace(/\\/g, '/')}';\n` + content;
  }
  
  content = content.replace(/console\.log/g, 'logger.info');
  content = content.replace(/console\.error/g, 'logger.error');
  content = content.replace(/console\.warn/g, 'logger.warn');
  
  fs.writeFileSync(filePath, content);
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('tests')) {
         walkDir(fullPath);
      }
    } else if (fullPath.endsWith('.js')) {
      replaceInFile(fullPath);
    }
  }
}

walkDir('.');
