import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepositoryContext } from '../utils/repositoryAnalyzer.js';

test('empty file list returns empty context', () => {
  const ctx = buildRepositoryContext([]);
  assert.strictEqual(ctx.frameworks.length, 0);
  assert.deepStrictEqual(ctx.dependencies, {});
  assert.strictEqual(ctx.architecture.hasFrontend, false);
  assert.strictEqual(ctx.architecture.hasBackend, false);
});

test('detects React and Express from package.json', () => {
  const files = [
    { name: 'package.json', content: JSON.stringify({ dependencies: { react: '^18', express: '^4' } }) },
    { name: 'src/components/Button.jsx', content: '' },
    { name: 'backend/controllers/auth.js', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.frameworks.includes('React'));
  assert.ok(ctx.frameworks.includes('Express.js'));
  assert.strictEqual(ctx.architecture.hasFrontend, true);
  assert.strictEqual(ctx.architecture.hasBackend, true);
});

test('parses Python requirements.txt', () => {
  const files = [
    { name: 'requirements.txt', content: 'flask==2.3.0\nrequests==2.31.0\n' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.strictEqual(ctx.dependencies['flask'], 'latest');
  assert.strictEqual(ctx.dependencies['requests'], 'latest');
  assert.ok(ctx.frameworks.includes('Flask'));
});

test('extracts root directories', () => {
  const files = [
    { name: 'src/app.js', content: '' },
    { name: 'backend/server.js', content: '' },
    { name: 'tests/unit.test.js', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.architecture.rootDirectories.includes('src'));
  assert.ok(ctx.architecture.rootDirectories.includes('backend'));
  assert.ok(ctx.architecture.rootDirectories.includes('tests'));
});

test('deduplicates root directories', () => {
  const files = [
    { name: 'src/a.js', content: '' },
    { name: 'src/b.js', content: '' },
    { name: 'src/c.js', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  const dirs = ctx.architecture.rootDirectories;
  assert.strictEqual(dirs.filter(d => d === 'src').length, 1);
});

test('detects coding styles', () => {
  const files = [
    { name: '.prettierrc', content: '{}' },
    { name: '.eslintrc', content: '{}' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.codingStyles.includes('Prettier Configuration Found'));
  assert.ok(ctx.codingStyles.includes('ESLint Configuration Found'));
});

test('detects configs', () => {
  const files = [
    { name: 'docker-compose.yml', content: '' },
    { name: 'tsconfig.json', content: '{}' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.configs.includes('Docker Compose Setup'));
  assert.ok(ctx.configs.includes('TypeScript Configuration'));
});

test('detects database from file paths', () => {
  const files = [
    { name: 'src/models/User.js', content: '' },
    { name: 'prisma/schema.prisma', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.strictEqual(ctx.architecture.hasDatabase, true);
});

test('handles invalid JSON in package.json gracefully', () => {
  const files = [
    { name: 'package.json', content: '{invalid json' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.strictEqual(ctx.frameworks.length, 0);
});

test('extracts rootDirectories from architecture', () => {
  const files = [
    { name: 'src/index.js', content: '' },
    { name: 'backend/server.js', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(Array.isArray(ctx.architecture.rootDirectories));
  assert.ok(ctx.architecture.rootDirectories.includes('src'));
  assert.ok(ctx.architecture.rootDirectories.includes('backend'));
});
