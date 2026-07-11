import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Intercept mongoose.model before Analytics is imported.
// The real Analytics.js uses mongoose.model('Analytics', analyticsSchema).
// We replace the factory so we get a test double that wraps the real schema.
// ---------------------------------------------------------------------------
const originalModel = mongoose.model.bind(mongoose);

mongoose.model = (name, schema) => {
  if (name === 'Analytics') {
    // Capture the schema so we can query its definition
    const realSchema = schema;

    const TestAnalytics = function (data) {
      // Apply schema defaults before merging user data
      const defaults = {};
      const paths = realSchema.paths || {};
      for (const [field, pathDef] of Object.entries(paths)) {
        if (pathDef.options && 'default' in pathDef.options) {
          defaults[field] =
            typeof pathDef.options.default === 'function'
              ? pathDef.options.default()
              : pathDef.options.default;
        }
      }
      Object.assign(this, defaults, data);
    };

    TestAnalytics.create = async (doc) => new TestAnalytics(doc);
    TestAnalytics.aggregate = async () => [];
    TestAnalytics.schema = realSchema;
    return TestAnalytics;
  }
  return originalModel(name, schema);
};

const { default: Analytics } = await import('../models/Analytics.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('Analytics model is exported and callable', () => {
  assert.ok(typeof Analytics === 'function', 'Analytics should be a constructor function');
});

test('Analytics.create is available as a static method', () => {
  assert.ok(typeof Analytics.create === 'function', 'Analytics.create should be a function');
});

test('Analytics.aggregate is available as a static method', () => {
  assert.ok(typeof Analytics.aggregate === 'function', 'Analytics.aggregate should be a function');
});

test('Analytics instances accept repoUrl, repoName, and filesReviewedCount', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 10,
  });
  assert.equal(record.repoUrl, 'https://github.com/test/repo');
  assert.equal(record.repoName, 'test-repo');
  assert.equal(record.filesReviewedCount, 10);
});

test('Analytics defaults totalBugs to 0 when not provided', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 5,
  });
  assert.equal(record.totalBugs, 0);
});

test('Analytics defaults totalSecurityIssues to 0 when not provided', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 5,
  });
  assert.equal(record.totalSecurityIssues, 0);
});

test('Analytics defaults totalOptimizations to 0 when not provided', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 5,
  });
  assert.equal(record.totalOptimizations, 0);
});

test('Analytics defaults totalStylingIssues to 0 when not provided', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 5,
  });
  assert.equal(record.totalStylingIssues, 0);
});

test('Analytics defaults totalFindings to 0 when not provided', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 5,
  });
  assert.equal(record.totalFindings, 0);
});

test('Analytics defaults healthScore to 100 when not provided', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 5,
  });
  assert.equal(record.healthScore, 100);
});

test('Analytics defaults language to General when not provided', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 5,
  });
  assert.equal(record.language, 'General');
});

test('Analytics defaults model to llama-3.3-70b-versatile when not provided', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 5,
  });
  assert.equal(record.model, 'llama-3.3-70b-versatile');
});

test('Analytics accepts and stores all finding count fields', () => {
  const record = new Analytics({
    repoUrl: 'https://github.com/test/repo',
    repoName: 'test-repo',
    filesReviewedCount: 20,
    totalBugs: 3,
    totalSecurityIssues: 5,
    totalOptimizations: 7,
    totalStylingIssues: 2,
    totalFindings: 17,
    healthScore: 65,
    language: 'Python',
    model: 'deepseek-r1',
    analyzedAt: new Date('2026-01-01'),
  });
  assert.equal(record.totalBugs, 3);
  assert.equal(record.totalSecurityIssues, 5);
  assert.equal(record.totalOptimizations, 7);
  assert.equal(record.totalStylingIssues, 2);
  assert.equal(record.totalFindings, 17);
  assert.equal(record.healthScore, 65);
  assert.equal(record.language, 'Python');
  assert.equal(record.model, 'deepseek-r1');
  assert.ok(record.analyzedAt instanceof Date);
});

test('Analytics.create returns a populated instance', async () => {
  const result = await Analytics.create({
    repoUrl: 'https://github.com/acme/project',
    repoName: 'acme-project',
    filesReviewedCount: 15,
  });
  assert.equal(result.repoName, 'acme-project');
  assert.equal(result.filesReviewedCount, 15);
  assert.equal(result.totalBugs, 0, 'create should apply schema defaults');
});

test('Analytics schema definition contains expected fields', () => {
  const schema = Analytics.schema;
  assert.ok(schema, 'Analytics should have schema attached');
  const paths = schema.paths || {};
  assert.ok('repoUrl' in paths, 'schema should have repoUrl path');
  assert.ok('repoName' in paths, 'schema should have repoName path');
  assert.ok('filesReviewedCount' in paths, 'schema should have filesReviewedCount path');
  assert.ok('totalBugs' in paths, 'schema should have totalBugs path');
  assert.ok('totalSecurityIssues' in paths, 'schema should have totalSecurityIssues path');
  assert.ok('totalOptimizations' in paths, 'schema should have totalOptimizations path');
  assert.ok('totalStylingIssues' in paths, 'schema should have totalStylingIssues path');
  assert.ok('totalFindings' in paths, 'schema should have totalFindings path');
  assert.ok('healthScore' in paths, 'schema should have healthScore path');
  assert.ok('prSummary.overallPurpose' in paths, 'schema should have nested prSummary.overallPurpose path');
  assert.ok('dependencyReport' in paths, 'schema should have top-level dependencyReport path');
  assert.ok('language' in paths, 'schema should have language path');
  assert.ok('model' in paths, 'schema should have model path');
  assert.ok('analyzedAt' in paths, 'schema should have analyzedAt path');
});

test('Analytics schema marks required fields correctly', () => {
  const schema = Analytics.schema;
  const paths = schema.paths || {};
  assert.equal(paths.repoUrl?.isRequired, true, 'repoUrl should be required');
  assert.equal(paths.repoName?.isRequired, true, 'repoName should be required');
  assert.equal(paths.filesReviewedCount?.isRequired, true, 'filesReviewedCount should be required');
});

test('Analytics schema sets correct defaults on field definitions', () => {
  const schema = Analytics.schema;
  const paths = schema.paths || {};
  assert.equal(paths.totalBugs?.options?.default, 0, 'totalBugs default should be 0');
  assert.equal(paths.totalSecurityIssues?.options?.default, 0, 'totalSecurityIssues default should be 0');
  assert.equal(paths.totalOptimizations?.options?.default, 0, 'totalOptimizations default should be 0');
  assert.equal(paths.totalStylingIssues?.options?.default, 0, 'totalStylingIssues default should be 0');
  assert.equal(paths.totalFindings?.options?.default, 0, 'totalFindings default should be 0');
  assert.equal(paths.healthScore?.options?.default, 100, 'healthScore default should be 100');
  assert.equal(paths.language?.options?.default, 'General', 'language default should be General');
  assert.equal(
    paths.model?.options?.default,
    'llama-3.3-70b-versatile',
    'model default should be llama-3.3-70b-versatile'
  );
});

test('Analytics schema defines two indexes', () => {
  const schema = Analytics.schema;
  const indexes = schema.indexes ? schema.indexes() : [];
  assert.ok(indexes.length >= 2, 'schema should define at least 2 indexes');
  const hasAnalyzedAt = indexes.some(
    (idx) => idx[0] && idx[0].analyzedAt === -1
  );
  const hasCompound = indexes.some(
    (idx) =>
      idx[0] && idx[0].repoName === 1 && idx[0].analyzedAt === -1
  );
  assert.ok(hasAnalyzedAt, 'schema should have index on analyzedAt');
  assert.ok(hasCompound, 'schema should have compound index on repoName+analyzedAt');
});
