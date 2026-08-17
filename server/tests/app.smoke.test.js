import './env.js';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

/**
 * Wiring checks that need no database.
 *
 * These catch the failures that would otherwise only show up when the app is
 * started for real: a module that does not import, a route registered against
 * a handler that does not exist, middleware ordering that swallows errors, or
 * an error handler that never returns a response. They run everywhere, so
 * even in a sandbox with no MongoDB the app is proven to boot and respond.
 */

let app;
beforeAll(() => {
  app = createApp();
});

describe('application wiring', () => {
  it('builds the app and every route module imports cleanly', () => {
    expect(typeof app).toBe('function');
  });

  it('serves the health endpoint', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('identifies itself at the root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('ExamRoute API');
  });

  it('sets security headers via helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('advertises rate limiting', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['ratelimit-limit'] ?? res.headers['ratelimit']).toBeDefined();
  });
});

describe('error handling without a database', () => {
  it('returns 404 for an unknown route rather than hanging', async () => {
    const res = await request(app).get('/api/no-such-thing');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/No route/);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JSON/i);
  });

  it('rejects an oversized body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(200_000) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('authentication guards (no DB reached)', () => {
  it('requires a token on protected routes', async () => {
    for (const path of ['/api/auth/me', '/api/bookings/mine']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a malformed bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed driver link before touching the database', async () => {
    const res = await request(app)
      .post('/api/driver/short-token/location')
      .send({ lng: 75, lat: 26 });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/driver link/i);
  });

  it('validates input before authentication side effects', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'nope', password: 'password123' });
    expect(res.status).toBe(400);
  });
});
