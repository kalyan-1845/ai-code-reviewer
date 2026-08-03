import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { streamReview } from '../controllers/streamController.js';

describe('streamReview', () => {
  it('fails closed with 404 when the preview stub is not explicitly enabled', async () => {
    const statusCalls = [];
    const req = { on: () => {} };
    const res = {
      setHeader: () => { throw new Error('should not set SSE headers when disabled'); },
      write: () => { throw new Error('should not stream when disabled'); },
      end: () => { throw new Error('should not end stream when disabled'); },
      status(code) {
        statusCalls.push(code);
        return this;
      },
      json(data) {
        assert.equal(statusCalls[0], 404);
        assert.ok(data.error.includes('preview-only'), 'should explain that the endpoint is a preview-only stub');
      },
    };

    await streamReview(req, res);
  });

  it('sets SSE headers on the response when enabled', async () => {
    process.env.ENABLE_STREAM_PREVIEW = 'true';
    try {
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
    } finally {
      delete process.env.ENABLE_STREAM_PREVIEW;
    }
  });

  it('streams mock token data events marked as _mock and ends', async () => {
    process.env.ENABLE_STREAM_PREVIEW = 'true';
    try {
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
      assert.ok(writtenData.some(d => d.includes('_mock')), 'every streamed event should be explicitly marked as mock');
      assert.ok(writtenData[0].includes('_mockWarning'), 'first event should carry a preview-only warning');
    } finally {
      delete process.env.ENABLE_STREAM_PREVIEW;
    }
  });

  it('aborts and does not write error on req close', async () => {
    process.env.ENABLE_STREAM_PREVIEW = 'true';
    try {
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
    } finally {
      delete process.env.ENABLE_STREAM_PREVIEW;
    }
  });
});
