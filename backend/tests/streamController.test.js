import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { streamReview } from '../controllers/streamController.js';

describe('streamReview', () => {
  it('sets SSE headers on the response', async () => {
    const writtenData = [];
    const req = { on: () => {} };
    const res = {
      setHeader: (key, value) => {
        if (key === 'Content-Type') assert.equal(value, 'text/event-stream');
        if (key === 'Cache-Control') assert.equal(value, 'no-cache');
        if (key === 'Connection') assert.equal(value, 'keep-alive');
      },
      write: (data) => writtenData.push(data),
      end: () => {}
    };

    await streamReview(req, res);
  });

  it('streams mock token data events and ends', async () => {
    const writtenData = [];
    const req = { on: () => {} };
    const res = {
      setHeader: () => {},
      write: (data) => writtenData.push(data),
      end: () => {}
    };

    await streamReview(req, res);

    assert.ok(writtenData.length > 0, 'should have written data');
    assert.ok(writtenData.some(d => d.includes('data:')), 'all writes should be SSE data events');
    assert.ok(writtenData.some(d => d.includes('[DONE]')), 'should end with [DONE]');
    assert.ok(writtenData[writtenData.length - 1].includes('[DONE]'), 'last write should be [DONE]');
  });

  it('aborts and does not write error on req close', async () => {
    let abortCalled = false;
    let writeCount = 0;
    const req = {
      on: (event, handler) => {
        if (event === 'close') {
          // Simulate immediate close
          handler();
        }
      }
    };
    const res = {
      setHeader: () => {},
      write: (data) => { writeCount++; },
      end: () => {}
    };

    await streamReview(req, res);
    assert.equal(writeCount, 0, 'no writes should occur after abort');
  });
});
