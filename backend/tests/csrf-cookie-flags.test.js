import express from 'express';
import request from 'supertest';
import assert from 'assert';
import { describe, it, beforeEach } from 'node:test';

describe('CSRF token cookie security flags', () => {
  let app;

  beforeEach(() => {
    app = express();
    
    // Middleware that sets CSRF token cookie with secure flags
    app.use((req, res, next) => {
      res.cookie('csrf_token', 'test_token_value_123', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000, // 1 hour
        path: '/',
      });
      next();
    });

    app.get('/api/csrf-test', (req, res) => {
      res.json({ message: 'csrf_token cookie set' });
    });
  });

  it('csrf_token cookie should have httpOnly flag', async () => {
    const response = await request(app).get('/api/csrf-test');
    const setCookieHeader = response.headers['set-cookie'][0];
    assert(setCookieHeader.includes('HttpOnly'), 'csrf_token cookie must have HttpOnly flag');
  });

  it('csrf_token cookie should have Secure flag in production', async () => {
    process.env.NODE_ENV = 'production';
    const testApp = express();
    
    testApp.use((req, res, next) => {
      res.cookie('csrf_token', 'test_token_value_123', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600000,
        path: '/',
      });
      next();
    });

    testApp.get('/api/csrf-test', (req, res) => {
      res.json({ message: 'csrf_token cookie set' });
    });

    const response = await request(testApp).get('/api/csrf-test');
    const setCookieHeader = response.headers['set-cookie'][0];
    assert(setCookieHeader.includes('Secure'), 'csrf_token cookie must have Secure flag in production');
    
    delete process.env.NODE_ENV;
  });

  it('csrf_token cookie should have SameSite=Strict', async () => {
    const response = await request(app).get('/api/csrf-test');
    const setCookieHeader = response.headers['set-cookie'][0];
    assert(setCookieHeader.includes('SameSite=Strict'), 'csrf_token cookie must have SameSite=Strict');
  });

  it('csrf_token cookie should have appropriate expiration', async () => {
    const response = await request(app).get('/api/csrf-test');
    const setCookieHeader = response.headers['set-cookie'][0];
    assert(setCookieHeader.includes('Max-Age') || setCookieHeader.includes('Expires'), 
           'csrf_token cookie must have Max-Age or Expires');
  });

  it('csrf_token cookie should be set on root path', async () => {
    const response = await request(app).get('/api/csrf-test');
    const setCookieHeader = response.headers['set-cookie'][0];
    assert(setCookieHeader.includes('Path=/'), 'csrf_token cookie must have Path=/');
  });

  it('CSRF token value should not be exposed to JavaScript', async () => {
    const response = await request(app).get('/api/csrf-test');
    const setCookieHeader = response.headers['set-cookie'][0];
    
    // Verify httpOnly prevents client-side access
    assert(setCookieHeader.toLowerCase().includes('httponly'), 
           'httpOnly flag prevents JavaScript from accessing cookie value');
  });
});
