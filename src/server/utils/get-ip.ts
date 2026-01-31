import type { Context } from "hono";

/**
 * Get the client IP address from request headers
 * Supports Cloudflare and common reverse proxy headers
 */
export function getIP(c: Context): string | null {
  const ip = c.req.header('cf-connecting-ip')
    || c.req.header('x-forwarded-for')
    || c.req.header('x-real-ip')
    || c.req.header('true-client-ip')
    || c.req.header('x-client-ip')
    || c.req.header('x-cluster-client-ip')
    || null;

  if (!ip) {
    return null
  }

  return ip;
}
