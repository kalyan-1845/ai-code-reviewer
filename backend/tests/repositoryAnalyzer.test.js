import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepositoryContext } from '../utils/repositoryAnalyzer.js';

/**
 * Unit tests for the repositoryAnalyzer utility.
 * Verifies buildRepositoryContext extracts frameworks, dependencies, coding styles,
 * configs, and architecture metadata from repository files.
 *
 * Refs: Issue #3780 — test : add unit tests for buildRepositoryContext
 */

test('buildRepositoryContext: returns empty arrays for empty file list', () => {
  const ctx = buildRepositoryContext([]);
  assert.equal(ctx.frameworks.length, 0);
  assert.deepEqual(ctx.dependencies, {});
  assert.deepEqual(ctx.devDependencies, {});
  assert.equal(ctx.codingStyles.length, 0);
  assert.equal(ctx.configs.length, 0);
  assert.equal(ctx.architecture.hasFrontend, false);
  assert.equal(ctx.architecture.hasBackend, false);
  assert.equal(ctx.architecture.hasDatabase, false);
  assert.deepEqual(ctx.architecture.rootDirectories, []);
});

test('buildRepositoryContext: detects React and Express from package.json dependencies', () => {
  const files = [
    { name: 'package.json', content: JSON.stringify({ dependencies: { 'react': '^18', 'express': '^4' } }) }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.frameworks.includes('React'));
  assert.ok(ctx.frameworks.includes('Express.js'));
});

test('buildRepositoryContext: detects Next.js and Tailwind CSS from dependencies', () => {
  const files = [
    { name: 'package.json', content: JSON.stringify({ dependencies: { 'next': '^14', 'tailwindcss': '^3' } }) }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.frameworks.includes('Next.js'));
  assert.ok(ctx.frameworks.includes('Tailwind CSS'));
});

test('buildRepositoryContext: detects Django and FastAPI from requirements.txt', () => {
  const files = [
    { name: 'requirements.txt', content: 'django==4.2\nfastapi==0.100.0\nrequests==2.31.0' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.frameworks.includes('Django'));
  assert.ok(ctx.frameworks.includes('FastAPI'));
  assert.equal(ctx.dependencies.django, 'latest');
  assert.equal(ctx.dependencies.fastapi, 'latest');
});

test('buildRepositoryContext: detects ESLint from .eslintrc file', () => {
  const files = [
    { name: '.eslintrc', content: '{"rules": {}}' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.codingStyles.includes('ESLint Configuration Found'));
});

test('buildRepositoryContext: detects Prettier from .prettierrc', () => {
  const files = [
    { name: '.prettierrc', content: '{"semi": false}' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.codingStyles.includes('Prettier Configuration Found'));
});

test('buildRepositoryContext: detects Docker Compose from docker-compose.yml', () => {
  const files = [
    { name: 'docker-compose.yml', content: 'version: "3"\nservices:\n  web:\n    image: nginx' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.configs.includes('Docker Compose Setup'));
});

test('buildRepositoryContext: detects TypeScript from tsconfig.json', () => {
  const files = [
    { name: 'tsconfig.json', content: '{"compilerOptions": {}}' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.configs.includes('TypeScript Configuration'));
});

test('buildRepositoryContext: detects Jest from jest.config.js', () => {
  const files = [
    { name: 'jest.config.js', content: 'module.exports = {}' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.configs.includes('Jest Testing Framework'));
});

test('buildRepositoryContext: sets hasFrontend when JSX/TSX files present', () => {
  const files = [
    { name: 'src/components/Button.jsx', content: '' },
    { name: 'src/pages/Index.tsx', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.equal(ctx.architecture.hasFrontend, true);
});

test('buildRepositoryContext: sets hasBackend for server-side file patterns', () => {
  const files = [
    { name: 'backend/controllers/auth.js', content: '' },
    { name: 'routes/api.js', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.equal(ctx.architecture.hasBackend, true);
});

test('buildRepositoryContext: sets hasDatabase for schema.prisma and /models/', () => {
  const files = [
    { name: 'prisma/schema.prisma', content: 'model User {}' },
    { name: 'models/Session.js', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.equal(ctx.architecture.hasDatabase, true);
});

test('buildRepositoryContext: extracts root directories from file paths', () => {
  const files = [
    { name: 'src/app.js', content: '' },
    { name: 'backend/server.js', content: '' },
    { name: 'docs/readme.md', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.architecture.rootDirectories.includes('src'));
  assert.ok(ctx.architecture.rootDirectories.includes('backend'));
  assert.ok(ctx.architecture.rootDirectories.includes('docs'));
});

test('buildRepositoryContext: deduplicates root directories', () => {
  const files = [
    { name: 'src/a.js', content: '' },
    { name: 'src/b.js', content: '' },
    { name: 'src/nested/deep/c.js', content: '' }
  ];
  const ctx = buildRepositoryContext(files);
  // Only top-level directories should appear
  assert.ok(ctx.architecture.rootDirectories.includes('src'));
  assert.equal(ctx.architecture.rootDirectories.filter(d => d === 'src').length, 1);
});

test('buildRepositoryContext: ignores invalid JSON in package.json gracefully', () => {
  const files = [
    { name: 'package.json', content: 'not valid json {{{{' }
  ];
  // Should not throw
  const ctx = buildRepositoryContext(files);
  assert.deepEqual(ctx.dependencies, {});
  assert.deepEqual(ctx.devDependencies, {});
  assert.equal(ctx.frameworks.length, 0);
});

test('buildRepositoryContext: detects Mongoose and Prisma frameworks', () => {
  const files = [
    { name: 'package.json', content: JSON.stringify({ dependencies: { 'mongoose': '^7', 'prisma': '^5' } }) }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.frameworks.includes('Mongoose (MongoDB)'));
  assert.ok(ctx.frameworks.includes('Prisma ORM'));
});

test('buildRepositoryContext: extracts devDependencies separately from dependencies', () => {
  const files = [
    { name: 'package.json', content: JSON.stringify({
      dependencies: { 'react': '^18' },
      devDependencies: { 'jest': '^29' }
    }) }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.dependencies.react);
  assert.ok(ctx.devDependencies.jest);
  assert.ok(ctx.frameworks.includes('React'));
  assert.ok(ctx.frameworks.includes('Jest'));
});

test('buildRepositoryContext: case-insensitive framework detection', () => {
  const files = [
    { name: 'package.json', content: JSON.stringify({ dependencies: { 'REACT': '^18', 'EXPRESS': '^4' } }) }
  ];
  const ctx = buildRepositoryContext(files);
  assert.ok(ctx.frameworks.includes('React'));
  assert.ok(ctx.frameworks.includes('Express.js'));
});
