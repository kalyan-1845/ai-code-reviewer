import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

const config = readJSON(path.join(rootDir, 'shared-safety-config.json'));
const configPhrases = [...config.dangerous_phrases].sort();

const implementations = {
  'backend/shared/dangerousPhrases.js': path.join(rootDir, 'backend/shared/dangerousPhrases.js'),
  'github-action/index.js': path.join(rootDir, 'github-action/index.js'),
  'ai-engine/app.py': path.join(rootDir, 'ai-engine/app.py'),
};

let allSynced = true;

for (const [name, filePath] of Object.entries(implementations)) {
  const content = readFileSync(filePath, 'utf-8');
  const phraseMatches = content.match(/['"]([^'"]+)['"]/g) || [];
  const filePhrases = phraseMatches
    .map(p => p.slice(1, -1))
    .filter(p =>
      p.length > 3 &&
      !p.startsWith('__NEUTRALIZED_') &&
      !p.startsWith('http') &&
      !p.includes('/') &&
      !p.includes('\\')
    )
    .filter(p => configPhrases.includes(p) || configPhrases.some(cp => cp === p))
    .sort();

  const onlyInFile = filePhrases.filter(p => !configPhrases.includes(p));
  const onlyInConfig = configPhrases.filter(p => !filePhrases.includes(p));

  if (onlyInFile.length > 0 || onlyInConfig.length > 0) {
    allSynced = false;
    console.log(`❌ ${name} is out of sync:`);
    if (onlyInConfig.length > 0) {
      console.log(`   Missing from file: ${onlyInConfig.join(', ')}`);
    }
    if (onlyInFile.length > 0) {
      console.log(`   Extra in file: ${onlyInFile.join(', ')}`);
    }
  } else {
    console.log(`✅ ${name} is in sync`);
  }
}

if (allSynced) {
  console.log('\n✅ All dangerous phrase copies are in sync with shared-safety-config.json');
  process.exit(0);
} else {
  console.log('\n❌ Some copies are out of sync. Update them from shared-safety-config.json');
  process.exit(1);
}
