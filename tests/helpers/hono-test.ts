/**
 * Hono Test Helpers
 * Utilities for testing Hono routes
 */

import { Hono } from 'hono';
import type { Env } from '@/server/index';
import { createMockD1, type MockD1Database } from '../mocks/d1';
import { createMockKV, type MockKVNamespace } from '../mocks/kv';

export interface TestEnv extends Env {
  DB: MockD1Database;
  NEXT_TAG_CACHE_D1: MockD1Database;
  NEXT_INC_CACHE_KV: MockKVNamespace;
}

export interface CreateTestAppOptions {
  d1QueryResults?: Map<string, unknown>;
  kvInitialData?: Record<string, string>;
  envOverrides?: Partial<Env>;
}

/**
 * Create a mock environment for testing
 */
export function createMockEnv(options: CreateTestAppOptions = {}): TestEnv {
  const mockD1 = createMockD1(options.d1QueryResults);
  const mockKV = createMockKV(options.kvInitialData);

  return {
    DB: mockD1,
    NEXT_TAG_CACHE_D1: mockD1,
    NEXT_INC_CACHE_KV: mockKV,
    ENVIRONMENT: 'test',
    ...options.envOverrides,
  } as TestEnv;
}

/**
 * Create a test request with default headers
 */
export function createTestRequest(
  path: string,
  options: RequestInit & {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
): Request {
  const url = `http://localhost${path}`;
  const headers = new Headers(options.headers);

  // Set default content-type for JSON bodies
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Add cookies
  if (options.cookies) {
    const cookieString = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headers.set('Cookie', cookieString);
  }

  return new Request(url, {
    ...options,
    headers,
  });
}

/**
 * Helper to make JSON request body
 */
export function jsonBody(data: unknown): string {
  return JSON.stringify(data);
}

/**
 * Helper to extract JSON from response
 */
export async function getJsonResponse<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Test app wrapper with mock environment
 */
export function withTestEnv<E extends Env>(
  app: Hono<{ Bindings: E }>,
  env: E
): (request: Request) => Promise<Response> {
  return (request: Request) => app.fetch(request, env);
}
