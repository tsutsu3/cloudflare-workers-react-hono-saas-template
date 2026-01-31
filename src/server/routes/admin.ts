/**
 * Admin Routes
 * Converted from ZSA Server Actions to Hono API routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";

import { getDB } from "@/db";
import {
  userTable,
  creditTransactionTable,
  passKeyCredentialTable,
} from "@/db/schema";
import {
  requireAdmin,
  updateAllSessionsOfUser,
  type AuthEnv,
} from "@/server/services/auth-service";
import {
  addUserCredits,
  logTransaction,
  type CreditEnv,
} from "@/server/services/credits-service";
import { rateLimitMiddleware } from "@/server/middleware/rate-limit";
import { CREDIT_TRANSACTION_TYPE } from "@/db/schema";

// ============================================================================
// Types
// ============================================================================

export interface AdminRoutesEnv extends AuthEnv, CreditEnv {}

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ============================================================================
// Schemas
// ============================================================================

const getUsersSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(Math.max(...PAGE_SIZE_OPTIONS)).default(PAGE_SIZE_OPTIONS[0]),
  emailFilter: z.string().optional(),
});

const adjustCreditsSchema = z.object({
  amount: z.number().int(),
  description: z.string().min(1, "Description is required").max(500),
});

// ============================================================================
// Rate Limit Options
// ============================================================================

const RATE_LIMITS = {
  ADMIN: { limit: 60, windowInSeconds: 60, identifier: "admin:general" },
};

// ============================================================================
// Admin Routes
// ============================================================================

const admin = new Hono<{ Bindings: AdminRoutesEnv }>();

// ----------------------------------------------------------------------------
// GET /users - List all users (paginated)
// ----------------------------------------------------------------------------
admin.get(
  "/users",
  rateLimitMiddleware(RATE_LIMITS.ADMIN),
  zValidator("query", getUsersSchema),
  async (c) => {
    const { page, pageSize, emailFilter } = c.req.valid("query");

    try {
      await requireAdmin(c);

      const db = getDB(c.env.DB);
      const offset = (page - 1) * pageSize;

      // Build where clause
      const whereClause = emailFilter
        ? sql`${userTable.email} LIKE ${`%${emailFilter}%`}`
        : undefined;

      // Fetch total count
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userTable)
        .where(whereClause);

      // Fetch paginated users
      const users = await db.query.userTable.findMany({
        columns: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
        where: whereClause,
        orderBy: (users, { desc }) => [desc(users.createdAt)],
        limit: pageSize,
        offset,
      });

      // Transform the data
      const transformedUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        name: user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : null,
        role: user.role,
        status: user.emailVerified ? "active" as const : "inactive" as const,
        createdAt: user.createdAt,
      }));

      return c.json({
        users: transformedUsers,
        totalCount: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
      });
    } catch (error) {
      console.error("Get users error:", error);
      if (error instanceof Error) {
        if (error.message.includes("admin")) {
          return c.json({ error: "Admin access required" }, 403);
        }
        if (error.message.includes("authenticated")) {
          return c.json({ error: error.message }, 401);
        }
      }
      return c.json({ error: "Failed to get users" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /users/:userId - Get user details
// ----------------------------------------------------------------------------
admin.get(
  "/users/:userId",
  rateLimitMiddleware(RATE_LIMITS.ADMIN),
  async (c) => {
    const userId = c.req.param("userId");

    try {
      await requireAdmin(c);

      const db = getDB(c.env.DB);

      // Fetch user with all details
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.id, userId),
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      // Fetch user's credit transactions (last 10)
      const transactions = await db.query.creditTransactionTable.findMany({
        where: eq(creditTransactionTable.userId, userId),
        orderBy: [desc(creditTransactionTable.createdAt)],
        limit: 10,
      });

      // Fetch user's passkey credentials
      const passkeys = await db.query.passKeyCredentialTable.findMany({
        where: eq(passKeyCredentialTable.userId, userId),
        orderBy: [desc(passKeyCredentialTable.createdAt)],
      });

      return c.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          credits: user.currentCredits,
          emailVerified: user.emailVerified,
          googleAccountId: user.googleAccountId,
          avatar: user.avatar,
          signUpIpAddress: user.signUpIpAddress,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        transactions,
        passkeys: passkeys.map(pk => ({
          id: pk.id,
          credentialId: pk.credentialId,
          aaguid: pk.aaguid,
          userAgent: pk.userAgent,
          createdAt: pk.createdAt,
          updatedAt: pk.updatedAt,
        })),
      });
    } catch (error) {
      console.error("Get user error:", error);
      if (error instanceof Error) {
        if (error.message.includes("admin")) {
          return c.json({ error: "Admin access required" }, 403);
        }
        if (error.message.includes("authenticated")) {
          return c.json({ error: error.message }, 401);
        }
      }
      return c.json({ error: "Failed to get user" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// PUT /users/:userId/credits - Adjust user credits
// ----------------------------------------------------------------------------
admin.put(
  "/users/:userId/credits",
  rateLimitMiddleware(RATE_LIMITS.ADMIN),
  zValidator("json", adjustCreditsSchema),
  async (c) => {
    const userId = c.req.param("userId");
    const { amount, description } = c.req.valid("json");

    try {
      const session = await requireAdmin(c);

      const db = getDB(c.env.DB);

      // Verify user exists
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.id, userId),
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      // Add or remove credits
      await addUserCredits(c.env, userId, amount);

      // Log the transaction
      await logTransaction(c.env, {
        userId,
        amount,
        description: `[Admin: ${session.user.email}] ${description}`,
        type: amount > 0 ? CREDIT_TRANSACTION_TYPE.ADMIN_ADJUSTMENT : CREDIT_TRANSACTION_TYPE.ADMIN_ADJUSTMENT,
      });

      // Update user's sessions
      await updateAllSessionsOfUser(c.env, userId);

      return c.json({ success: true });
    } catch (error) {
      console.error("Adjust credits error:", error);
      if (error instanceof Error) {
        if (error.message.includes("admin")) {
          return c.json({ error: "Admin access required" }, 403);
        }
        if (error.message.includes("authenticated")) {
          return c.json({ error: error.message }, 401);
        }
      }
      return c.json({ error: "Failed to adjust credits" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /transactions - List all transactions (paginated)
// ----------------------------------------------------------------------------
admin.get(
  "/transactions",
  rateLimitMiddleware(RATE_LIMITS.ADMIN),
  zValidator("query", getUsersSchema),
  async (c) => {
    const { page, pageSize } = c.req.valid("query");

    try {
      await requireAdmin(c);

      const db = getDB(c.env.DB);
      const offset = (page - 1) * pageSize;

      // Fetch total count
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(creditTransactionTable);

      // Fetch paginated transactions
      const transactions = await db.query.creditTransactionTable.findMany({
        orderBy: [desc(creditTransactionTable.createdAt)],
        limit: pageSize,
        offset,
        with: {
          user: {
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return c.json({
        transactions: transactions.map(tx => ({
          id: tx.id,
          userId: tx.userId,
          user: tx.user,
          amount: tx.amount,
          description: tx.description,
          type: tx.type,
          paymentIntentId: tx.paymentIntentId,
          createdAt: tx.createdAt,
        })),
        totalCount: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
      });
    } catch (error) {
      console.error("Get transactions error:", error);
      if (error instanceof Error) {
        if (error.message.includes("admin")) {
          return c.json({ error: "Admin access required" }, 403);
        }
        if (error.message.includes("authenticated")) {
          return c.json({ error: error.message }, 401);
        }
      }
      return c.json({ error: "Failed to get transactions" }, 500);
    }
  }
);

export default admin;
