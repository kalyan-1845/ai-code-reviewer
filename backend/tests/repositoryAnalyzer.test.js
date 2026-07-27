import assert from 'assert';
import { buildRepositoryContext } from '../utils/repositoryAnalyzer.js';

async function runTests() {
  console.log('Running repositoryAnalyzer tests...');

  // Test 1: Empty repo
  const ctxEmpty = buildRepositoryContext([]);
  assert.strictEqual(ctxEmpty.frameworks.length, 0);

  // Test 2: React + Express repo
  const files = [
    { name: 'package.json', content: JSON.stringify({ dependencies: { 'react': '^18', 'express': '^4' } }) },
    { name: '.eslintrc', content: '{}' },
    { name: 'docker-compose.yml', content: '' },
    { name: 'src/components/Button.jsx', content: '' },
    { name: 'backend/controllers/auth.js', content: '' }
  ];

  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.frameworks.includes('React'));
  assert.ok(ctx.frameworks.includes('Express.js'));
  assert.ok(ctx.codingStyles.includes('ESLint Configuration Found'));
  assert.ok(ctx.configs.includes('Docker Compose Setup'));
  assert.strictEqual(ctx.architecture.hasFrontend, true);
  assert.strictEqual(ctx.architecture.hasBackend, true);
  assert.ok(ctx.architecture.rootDirectories.includes('src'));
  assert.ok(ctx.architecture.rootDirectories.includes('backend'));

  console.log('✅ All repositoryAnalyzer tests passed!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
