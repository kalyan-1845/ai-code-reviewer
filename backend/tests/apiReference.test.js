import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import apiRouter from '../routes/apiReference.js';

test('apiReference router exports a valid express Router with /analyze endpoint', () => {
  const app = express();
  app.use('/api', apiRouter);

  assert.equal(typeof apiRouter, 'function');
  assert.ok(apiRouter.stack.some(layer => layer.route && layer.route.path === '/analyze'));
});
import request from 'supertest';

const originalWarn = console.warn;
console.warn = () => {};

const apiRefApp = (await import('../routes/apiReference.js')).default;

test('app is an Express application', () => {
  assert.ok(apiRefApp, 'Default export should be an Express app');
  assert.strictEqual(typeof apiRefApp.listen, 'function');
});

test('app has trust proxy set to 1', () => {
  assert.strictEqual(apiRefApp.get('trust proxy'), 1);
});

test('POST /api/analyze returns 200 with success message', async () => {
  const response = await request(apiRefApp)
    .post('/api/analyze')
    .send({})
    .set('Accept', 'application/json');

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.success, true);
  assert.strictEqual(response.body.message, 'Analysis started.');
});

test('POST /api/analyze returns JSON content-type', async () => {
  const response = await request(apiRefApp)
    .post('/api/analyze')
    .send({ repoUrl: 'https://github.com/example/repo', model: 'gpt-4o' })
    .set('Accept', 'application/json');

  assert.ok(
    response.headers['content-type'].includes('application/json'),
    'Content-Type should be application/json'
  );
});

test('GET /api/analyze returns 404', async () => {
  const response = await request(apiRefApp).get('/api/analyze');
  assert.strictEqual(response.status, 404);
});

test('POST /api/analyze-without-slash returns 404 (no route)', async () => {
  const response = await request(apiRefApp).post('/analyze');
  assert.strictEqual(response.status, 404);
});

console.warn = originalWarn;
