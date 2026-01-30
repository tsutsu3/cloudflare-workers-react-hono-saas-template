/**
 * Rate Limiting Middleware
 * Adapted from _ref/src/utils/rate-limit.ts
 */

import * as ipaddr from "ipaddr.js";
import type { Context, MiddlewareHandler } from "hono";

// ============================================================================
// Types
// ============================================================================

export interface RateLimitEnv {
  NEXT_INC_CACHE_KV: KVNamespace;
}

export interface RateLimitOptions {
  // Maximum number of requests allowed within the window
  limit: number;
  // Time window in seconds
  windowInSeconds: number;
  // Unique identifier for the rate limit (e.g., 'api:auth', 'api:upload')
  identifier: string;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // Timestamp when the rate limit resets
  limit: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

// Normalize an IP address for rate limiting
// For IPv6, we use the /64 subnet to prevent rate limit bypassing
function normalizeIP(ip: string): string {
  try {
    const addr = ipaddr.parse(ip);

    if (addr.kind() === 'ipv6') {
      // Get the first 64 bits for IPv6
      const ipv6 = addr as ipaddr.IPv6;
      const bytes = ipv6.toByteArray();
      // Zero out the last 8 bytes (64 bits)
      for (let i = 8; i < 16; i++) {
        bytes[i] = 0;
      }
      return `${ipaddr.fromByteArray(bytes).toString()}/64`;
    } else {
      // For IPv4, return the address as-is without normalization
      return addr.toString();
    }
  } catch {
    // If parsing fails, return the original IP
    return ip;
  }
}

// ============================================================================
// Rate Limiting Functions
// ============================================================================

export async function checkRateLimit(
  env: RateLimitEnv,
  {
    key,
    options,
  }: {
    key: string;
    options: RateLimitOptions;
  }
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);

  if (!env.NEXT_INC_CACHE_KV) {
    throw new Error("Can't connect to KV store");
  }

  // Normalize the key if it looks like an IP address
  const normalizedKey = ipaddr.isValid(key) ? normalizeIP(key) : key;

  const windowKey = `rate-limit:${options.identifier}:${normalizedKey}:${Math.floor(
    now / options.windowInSeconds
  )}`;

  // Get the current count from KV
  const currentCount = parseInt((await env.NEXT_INC_CACHE_KV.get(windowKey)) || "0");
  const reset = (Math.floor(now / options.windowInSeconds) + 1) * options.windowInSeconds;

  if (currentCount >= options.limit) {
    return {
      success: false,
      remaining: 0,
      reset,
      limit: options.limit,
    };
  }

  // Increment the counter
  await env.NEXT_INC_CACHE_KV.put(windowKey, (currentCount + 1).toString(), {
    expirationTtl: options.windowInSeconds,
  });

  return {
    success: true,
    remaining: options.limit - (currentCount + 1),
    reset,
    limit: options.limit,
  };
}

// ============================================================================
// Rate Limit Headers Helper
// ============================================================================

export function setRateLimitHeaders(c: Context, result: RateLimitResult): void {
  c.header("X-RateLimit-Limit", result.limit.toString());
  c.header("X-RateLimit-Remaining", result.remaining.toString());
  c.header("X-RateLimit-Reset", result.reset.toString());

  if (!result.success) {
    c.header("Retry-After", (result.reset - Math.floor(Date.now() / 1000)).toString());
  }
}

// ============================================================================
// Hono Middleware
// ============================================================================

export function rateLimitMiddleware(
  options: RateLimitOptions,
  getKey?: (c: Context) => string
): MiddlewareHandler<{ Bindings: RateLimitEnv }> {
  return async (c, next) => {
    // Default key is the client IP
    const key = getKey
      ? getKey(c)
      : c.req.header('cf-connecting-ip')
        || c.req.header('x-forwarded-for')
        || c.req.header('x-real-ip')
        || 'unknown';

    const result = await checkRateLimit(c.env, { key, options });

    setRateLimitHeaders(c, result);

    if (!result.success) {
      return c.json(
        { error: "Rate limit exceeded", retryAfter: result.reset - Math.floor(Date.now() / 1000) },
        429
      );
    }

    await next();
  };
}
