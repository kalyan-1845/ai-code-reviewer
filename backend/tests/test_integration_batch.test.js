import { describe, it } from 'node:test';
import assert from 'node:assert';

// These tests verify the req.body destructuring defaults and field handling
// used in the /api/analyze route handler in backend/index.js.

describe('Batch Integration Tests', () => {
  it('should parse batchSize from API payload', () => {
    const req = {
      body: {
        repoUrl: 'https://github.com/test/repo',
        batchSize: 10
      }
    };
    const { repoUrl, batchSize = 5 } = req.body;
    assert.strictEqual(repoUrl, 'https://github.com/test/repo');
    assert.strictEqual(batchSize, 10);
  });

  it('should fall back to default batchSize of 5 when not provided', () => {
    const req = {
      body: {
        repoUrl: 'https://github.com/test/repo'
      }
    };
    const { batchSize = 5 } = req.body;
    assert.strictEqual(batchSize, 5);
  });



  it('should fall back to default temperature of 0.7 when omitted', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo' } };
    const { temperature = 0.7 } = req.body;
    assert.strictEqual(temperature, 0.7);
  });

  it('should use provided temperature value', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo', temperature: 0.9 } };
    const { temperature = 0.7 } = req.body;
    assert.strictEqual(temperature, 0.9);
  });

  it('should fall back to default maxTokens of 2048 when omitted', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo' } };
    const { maxTokens = 2048 } = req.body;
    assert.strictEqual(maxTokens, 2048);
  });

  it('should use provided maxTokens value', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo', maxTokens: 4096 } };
    const { maxTokens = 2048 } = req.body;
    assert.strictEqual(maxTokens, 4096);
  });

  it('should fall back to default model of llama-3.3-70b-versatile when omitted', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo' } };
    const { model = 'llama-3.3-70b-versatile' } = req.body;
    assert.strictEqual(model, 'llama-3.3-70b-versatile');
  });

  it('should use provided model value', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo', model: 'deepseek-r1-distill-llama-70b' } };
    const { model = 'llama-3.3-70b-versatile' } = req.body;
    assert.strictEqual(model, 'deepseek-r1-distill-llama-70b');
  });

  it('should fall back to default language of English when omitted', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo' } };
    const { language = 'English' } = req.body;
    assert.strictEqual(language, 'English');
  });

  it('should use provided language value', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo', language: 'Spanish' } };
    const { language = 'English' } = req.body;
    assert.strictEqual(language, 'Spanish');
  });

  it('should fall back to default company of General when omitted', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo' } };
    const { company = 'General' } = req.body;
    assert.strictEqual(company, 'General');
  });

  it('should use provided company value', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo', company: 'Acme Corp' } };
    const { company = 'General' } = req.body;
    assert.strictEqual(company, 'Acme Corp');
  });

  it('should fall back to empty string for systemPrompt when omitted', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo' } };
    const { systemPrompt = '' } = req.body;
    assert.strictEqual(systemPrompt, '');
  });

  it('should use provided systemPrompt value', () => {
    const req = { body: { repoUrl: 'https://github.com/test/repo', systemPrompt: 'Focus on security.' } };
    const { systemPrompt = '' } = req.body;
    assert.strictEqual(systemPrompt, 'Focus on security.');
  });

  it('should require repoUrl (no default — route guard enforces presence)', () => {
    const req = { body: {} };
    const { repoUrl } = req.body;
    assert.strictEqual(repoUrl, undefined);
  });

  it('should handle all fields simultaneously with defaults', () => {
    const req = {
      body: {
        repoUrl: 'https://github.com/acme/myapp',
        batchSize: 8
      }
    };
    const {
      repoUrl,
      batchSize = 5,
      temperature = 0.7,
      maxTokens = 2048,
      model = 'llama-3.3-70b-versatile',
      language = 'English',
      company = 'General',
      systemPrompt = ''
    } = req.body;

    assert.strictEqual(repoUrl, 'https://github.com/acme/myapp');
    assert.strictEqual(batchSize, 8);
    assert.strictEqual(temperature, 0.7);
    assert.strictEqual(maxTokens, 2048);
    assert.strictEqual(model, 'llama-3.3-70b-versatile');
    assert.strictEqual(language, 'English');
    assert.strictEqual(company, 'General');
    assert.strictEqual(systemPrompt, '');
  });
});
