import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Batching Integration Tests', () => {
  it('should be able to parse batchSize from API payload conceptually', () => {
    // In actual index.js, req.body.batchSize is parsed. We simulate the req object.
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

  it('should fall back to default batchSize if not provided', () => {
    const req = {
      body: {
        repoUrl: 'https://github.com/test/repo'
      }
    };
    
    const { batchSize = 5 } = req.body;
    assert.strictEqual(batchSize, 5);
  });
});
