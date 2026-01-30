/**
 * Authentication Middleware
 * Provides middleware for authentication and authorization
 */

import { createMiddleware } from "hono/factory";
import {
  getSessionFromCookie,
  type AuthEnv,
  type SessionValidationResult,
} from "@/server/services/auth-service";
import { ROLES_ENUM } from "@/db/schema";

// ============================================================================
// Types
// ============================================================================

// Extend Hono context variables to include session
declare module "hono" {
  interface ContextVariableMap {
    session: SessionValidationResult;
  }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * Middleware that checks for a valid session cookie and attaches
 * the session to the context. Returns 401 if not authenticated.
 */
export const authMiddleware = createMiddleware<{ Bindings: AuthEnv }>(
  async (c, next) => {
    const session = await getSessionFromCookie(c);

    if (!session) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    // Attach session to context for use in route handlers
    c.set("session", session);
    await next();
  }
);

/**
 * Middleware that checks for a verified email.
 * Must be used after authMiddleware.
 */
export const verifiedEmailMiddleware = createMiddleware<{ Bindings: AuthEnv }>(
  async (c, next) => {
    const session = c.get("session");

    if (!session) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    if (!session.user.emailVerified) {
      return c.json({ error: "Please verify your email first" }, 403);
    }

    await next();
  }
);

/**
 * Middleware that checks for admin role.
 * Must be used after authMiddleware.
 */
export const adminMiddleware = createMiddleware<{ Bindings: AuthEnv }>(
  async (c, next) => {
    const session = c.get("session");

    if (!session) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    if (session.user.role !== ROLES_ENUM.ADMIN) {
      return c.json({ error: "Admin access required" }, 403);
    }

    await next();
  }
);

// ============================================================================
// Combined Middleware Helpers
// ============================================================================

/**
 * Combines auth + verified email middlewares
 */
export const requireVerifiedAuth = [authMiddleware, verifiedEmailMiddleware];

/**
 * Combines auth + admin middlewares
 */
export const requireAdmin = [authMiddleware, adminMiddleware];
