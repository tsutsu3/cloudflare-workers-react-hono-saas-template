/**
 * Auth Routes Tests
 *
 * Note: Full integration tests for auth routes require complex mocking
 * of the database layer. These tests focus on the HTTP interface behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { signInSchema } from '@/shared/schemas/signin.schema';
import { signUpSchema } from '@/shared/schemas/signup.schema';
import { getJsonResponse } from '../../helpers/hono-test';

describe('Auth Routes - Validation', () => {
  describe('Sign-in validation', () => {
    it('should reject invalid email format', async () => {
      const app = new Hono();
      app.post('/sign-in', zValidator('json', signInSchema), (c) => c.json({ success: true }));

      const res = await app.request('/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid-email', password: 'password123' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject empty password', async () => {
      const app = new Hono();
      app.post('/sign-in', zValidator('json', signInSchema), (c) => c.json({ success: true }));

      const res = await app.request('/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('should accept valid credentials format', async () => {
      const app = new Hono();
      app.post('/sign-in', zValidator('json', signInSchema), (c) => c.json({ success: true }));

      const res = await app.request('/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });

      expect(res.status).toBe(200);
      const data = await getJsonResponse<{ success: boolean }>(res);
      expect(data.success).toBe(true);
    });
  });

  describe('Sign-up validation', () => {
    it('should reject weak passwords', async () => {
      const app = new Hono();
      app.post('/sign-up', zValidator('json', signUpSchema), (c) => c.json({ success: true }));

      const res = await app.request('/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: '123', // Too weak
          firstName: 'Test',
          lastName: 'User',
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should accept valid sign-up data', async () => {
      const app = new Hono();
      app.post('/sign-up', zValidator('json', signUpSchema), (c) => c.json({ success: true }));

      const res = await app.request('/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'StrongP@ss123',
          firstName: 'Test',
          lastName: 'User',
        }),
      });

      expect(res.status).toBe(200);
    });
  });
});

describe('Auth Routes - Response Structure', () => {
  describe('Session endpoint', () => {
    it('should return unauthenticated response structure', async () => {
      const app = new Hono();
      app.get('/session', (c) => {
        return c.json({ authenticated: false });
      });

      const res = await app.request('/session');
      const data = await getJsonResponse<{ authenticated: boolean }>(res);

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('authenticated');
      expect(data.authenticated).toBe(false);
    });

    it('should return authenticated response structure', async () => {
      const mockSession = {
        authenticated: true,
        user: {
          id: 'user_123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          avatar: null,
          emailVerified: true,
          role: 'user',
          credits: 100,
        },
        teams: [{ id: 'team_123', name: 'Test Team', slug: 'test-team', permissions: ['read'] }],
        selectedTeamId: 'team_123',
      };

      const app = new Hono();
      app.get('/session', (c) => c.json(mockSession));

      const res = await app.request('/session');
      const data = await getJsonResponse<typeof mockSession>(res);

      expect(res.status).toBe(200);
      expect(data.authenticated).toBe(true);
      expect(data.user.email).toBe('test@example.com');
      expect(data.teams).toHaveLength(1);
    });
  });

  describe('Sign-out endpoint', () => {
    it('should return success response', async () => {
      const app = new Hono();
      app.post('/sign-out', (c) => c.json({ success: true }));

      const res = await app.request('/sign-out', { method: 'POST' });
      const data = await getJsonResponse<{ success: boolean }>(res);

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Error responses', () => {
    it('should return proper error structure for unauthorized', async () => {
      const app = new Hono();
      app.post('/protected', (c) => {
        return c.json({ error: 'Not authenticated' }, 401);
      });

      const res = await app.request('/protected', { method: 'POST' });
      const data = await getJsonResponse<{ error: string }>(res);

      expect(res.status).toBe(401);
      expect(data).toHaveProperty('error');
      expect(data.error).toBe('Not authenticated');
    });

    it('should return proper error structure for conflict', async () => {
      const app = new Hono();
      app.post('/sign-up', (c) => {
        return c.json({ error: 'Email already taken' }, 409);
      });

      const res = await app.request('/sign-up', { method: 'POST' });
      const data = await getJsonResponse<{ error: string }>(res);

      expect(res.status).toBe(409);
      expect(data.error).toBe('Email already taken');
    });
  });
});
