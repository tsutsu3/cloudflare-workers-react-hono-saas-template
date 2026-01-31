/**
 * Error Handler Middleware Tests
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { ZodError, z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import {
  errorHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
} from '@/server/middleware/error-handler';
import { getJsonResponse } from '../../helpers/hono-test';

describe('Error Handler Middleware', () => {
  function createTestApp() {
    const app = new Hono();
    app.onError(errorHandler);
    return app;
  }

  describe('Custom Error Classes', () => {
    it('should create AppError with default values', () => {
      const error = new AppError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.name).toBe('AppError');
    });

    it('should create AppError with custom values', () => {
      const error = new AppError('Custom error', 400, 'CUSTOM_CODE', { foo: 'bar' });
      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.details).toEqual({ foo: 'bar' });
    });

    it('should create ValidationError', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should create AuthenticationError', () => {
      const error = new AuthenticationError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Not authenticated');
    });

    it('should create AuthorizationError', () => {
      const error = new AuthorizationError();
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.message).toBe('Not authorized');
    });

    it('should create NotFoundError', () => {
      const error = new NotFoundError();
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
    });

    it('should create RateLimitError', () => {
      const error = new RateLimitError('Too many requests', 60);
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.details).toEqual({ retryAfter: 60 });
    });
  });

  describe('errorHandler', () => {
    it('should handle ZodError', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        const schema = z.object({ email: z.string().email() });
        schema.parse({ email: 'invalid' });
      });

      const res = await app.request('/test');
      const data = await getJsonResponse<{ error: string; code: string; details: unknown[] }>(res);

      expect(res.status).toBe(400);
      expect(data.error).toBe('Validation error');
      expect(data.code).toBe('VALIDATION_ERROR');
      expect(data.details).toBeInstanceOf(Array);
    });

    it('should handle HTTPException', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new HTTPException(403, { message: 'Forbidden' });
      });

      const res = await app.request('/test');
      const data = await getJsonResponse<{ error: string }>(res);

      expect(res.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should handle AppError', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new AppError('Custom app error', 422, 'CUSTOM_ERROR', { field: 'test' });
      });

      const res = await app.request('/test');
      const data = await getJsonResponse<{ error: string; code: string; details: unknown }>(res);

      expect(res.status).toBe(422);
      expect(data.error).toBe('Custom app error');
      expect(data.code).toBe('CUSTOM_ERROR');
      expect(data.details).toEqual({ field: 'test' });
    });

    it('should handle AuthenticationError', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new AuthenticationError('Please sign in');
      });

      const res = await app.request('/test');
      const data = await getJsonResponse<{ error: string; code: string }>(res);

      expect(res.status).toBe(401);
      expect(data.error).toBe('Please sign in');
      expect(data.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should handle standard Error with authentication message', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new Error('Not authenticated');
      });

      const res = await app.request('/test');
      const data = await getJsonResponse<{ error: string }>(res);

      expect(res.status).toBe(401);
      expect(data.error).toBe('Not authenticated');
    });

    it('should handle standard Error with permission message', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new Error('Admin access required');
      });

      const res = await app.request('/test');
      const data = await getJsonResponse<{ error: string }>(res);

      expect(res.status).toBe(403);
      expect(data.error).toBe('Admin access required');
    });

    it('should handle standard Error with not found message', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new Error('Resource not found');
      });

      const res = await app.request('/test');
      const data = await getJsonResponse<{ error: string }>(res);

      expect(res.status).toBe(404);
      expect(data.error).toBe('Resource not found');
    });

    it('should handle generic errors with 500', async () => {
      const app = createTestApp();
      app.get('/test', () => {
        throw new Error('Something went wrong');
      });

      const res = await app.request('/test');
      const data = await getJsonResponse<{ error: string }>(res);

      expect(res.status).toBe(500);
      expect(data.error).toBe('An unexpected error occurred');
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with route info', async () => {
      const app = new Hono();
      app.all('*', notFoundHandler);

      const res = await app.request('/api/unknown');
      const data = await getJsonResponse<{ error: string; message: string }>(res);

      expect(res.status).toBe(404);
      expect(data.error).toBe('Not found');
      expect(data.message).toBe('Route GET /api/unknown not found');
    });

    it('should include HTTP method in message', async () => {
      const app = new Hono();
      app.all('*', notFoundHandler);

      const res = await app.request('/api/test', { method: 'POST' });
      const data = await getJsonResponse<{ message: string }>(res);

      expect(data.message).toBe('Route POST /api/test not found');
    });
  });
});
