/**
 * Rate Limit Middleware Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createMockKV } from '../../mocks/kv';
import { rateLimitMiddleware, checkRateLimit, setRateLimitHeaders } from '@/server/middleware/rate-limit';
import { getJsonResponse } from '../../helpers/hono-test';

describe('Rate Limit Middleware', () => {
  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const mockKV = createMockKV();
      const env = { NEXT_INC_CACHE_KV: mockKV };

      const result = await checkRateLimit(env, {
        key: '127.0.0.1',
        options: {
          limit: 10,
          windowInSeconds: 60,
          identifier: 'test',
        },
      });

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9);
      expect(result.limit).toBe(10);
    });

    it('should deny requests over limit', async () => {
      const mockKV = createMockKV();
      const env = { NEXT_INC_CACHE_KV: mockKV };
      const options = {
        limit: 2,
        windowInSeconds: 60,
        identifier: 'test',
      };

      // Make 2 requests (within limit)
      await checkRateLimit(env, { key: '127.0.0.1', options });
      await checkRateLimit(env, { key: '127.0.0.1', options });

      // 3rd request should be denied
      const result = await checkRateLimit(env, { key: '127.0.0.1', options });

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle different keys independently', async () => {
      const mockKV = createMockKV();
      const env = { NEXT_INC_CACHE_KV: mockKV };
      const options = {
        limit: 1,
        windowInSeconds: 60,
        identifier: 'test',
      };

      // First IP
      await checkRateLimit(env, { key: '127.0.0.1', options });
      const result1 = await checkRateLimit(env, { key: '127.0.0.1', options });

      // Second IP
      const result2 = await checkRateLimit(env, { key: '192.168.1.1', options });

      expect(result1.success).toBe(false);
      expect(result2.success).toBe(true);
    });

    it('should throw error without KV namespace', async () => {
      const env = { NEXT_INC_CACHE_KV: undefined as never };

      await expect(
        checkRateLimit(env, {
          key: '127.0.0.1',
          options: {
            limit: 10,
            windowInSeconds: 60,
            identifier: 'test',
          },
        })
      ).rejects.toThrow("Can't connect to KV store");
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should allow requests within limit', async () => {
      const mockKV = createMockKV();
      const app = new Hono<{ Bindings: { NEXT_INC_CACHE_KV: typeof mockKV } }>();

      app.use(
        '/test',
        rateLimitMiddleware({
          limit: 10,
          windowInSeconds: 60,
          identifier: 'test',
        })
      );
      app.get('/test', (c) => c.json({ success: true }));

      const res = await app.request('/test', {}, { NEXT_INC_CACHE_KV: mockKV });
      const data = await getJsonResponse<{ success: boolean }>(res);

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
    });

    it('should return 429 when rate limited', async () => {
      const mockKV = createMockKV();
      const app = new Hono<{ Bindings: { NEXT_INC_CACHE_KV: typeof mockKV } }>();

      app.use(
        '/test',
        rateLimitMiddleware({
          limit: 1,
          windowInSeconds: 60,
          identifier: 'test',
        })
      );
      app.get('/test', (c) => c.json({ success: true }));

      // First request
      await app.request('/test', {}, { NEXT_INC_CACHE_KV: mockKV });

      // Second request should be rate limited
      const res = await app.request('/test', {}, { NEXT_INC_CACHE_KV: mockKV });
      const data = await getJsonResponse<{ error: string }>(res);

      expect(res.status).toBe(429);
      expect(data.error).toBe('Rate limit exceeded');
      expect(res.headers.get('Retry-After')).not.toBeNull();
    });

    it('should use custom key function', async () => {
      const mockKV = createMockKV();
      const app = new Hono<{ Bindings: { NEXT_INC_CACHE_KV: typeof mockKV } }>();

      app.use(
        '/test',
        rateLimitMiddleware(
          {
            limit: 1,
            windowInSeconds: 60,
            identifier: 'test',
          },
          () => 'custom-key'
        )
      );
      app.get('/test', (c) => c.json({ success: true }));

      // First request
      await app.request('/test', {}, { NEXT_INC_CACHE_KV: mockKV });

      // Second request with same custom key should be rate limited
      const res = await app.request('/test', {}, { NEXT_INC_CACHE_KV: mockKV });

      expect(res.status).toBe(429);
    });
  });

  describe('setRateLimitHeaders', () => {
    it('should set rate limit headers', async () => {
      const app = new Hono();
      app.get('/test', (c) => {
        setRateLimitHeaders(c, {
          success: true,
          remaining: 5,
          reset: 1234567890,
          limit: 10,
        });
        return c.json({ ok: true });
      });

      const res = await app.request('/test');
      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('5');
      expect(res.headers.get('X-RateLimit-Reset')).toBe('1234567890');
    });

    it('should set Retry-After header when rate limited', async () => {
      const app = new Hono();
      const futureReset = Math.floor(Date.now() / 1000) + 60;

      app.get('/test', (c) => {
        setRateLimitHeaders(c, {
          success: false,
          remaining: 0,
          reset: futureReset,
          limit: 10,
        });
        return c.json({ ok: true });
      });

      const res = await app.request('/test');
      expect(res.headers.get('Retry-After')).not.toBeNull();
      const retryAfter = parseInt(res.headers.get('Retry-After') || '0');
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });
  });
});
