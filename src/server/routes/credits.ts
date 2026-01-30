/**
 * Credits Routes
 * Converted from ZSA Server Actions to Hono API routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import ms from "ms";

import {
  requireVerifiedEmail,
  updateAllSessionsOfUser,
  type AuthEnv,
} from "@/server/services/auth-service";
import {
  getCreditTransactions,
  addUserCredits,
  logTransaction,
  getCreditPackage,
  type CreditEnv,
} from "@/server/services/credits-service";
import { getStripe, type StripeEnv } from "@/server/services/stripe-service";
import { rateLimitMiddleware } from "@/server/middleware/rate-limit";
import { CREDIT_TRANSACTION_TYPE } from "@/db/schema";
import {
  MAX_TRANSACTIONS_PER_PAGE,
  CREDITS_EXPIRATION_YEARS,
  DISABLE_CREDIT_BILLING_SYSTEM,
} from "@/shared/constants";

// ============================================================================
// Types
// ============================================================================

export interface CreditsRoutesEnv extends AuthEnv, CreditEnv, StripeEnv {}

// ============================================================================
// Schemas
// ============================================================================

const getTransactionsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(MAX_TRANSACTIONS_PER_PAGE).default(MAX_TRANSACTIONS_PER_PAGE),
});

const createPaymentIntentSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
});

const confirmPaymentSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentIntentId: z.string().min(1, "Payment intent ID is required"),
});

// ============================================================================
// Rate Limit Options
// ============================================================================

const RATE_LIMITS = {
  CREDITS: { limit: 30, windowInSeconds: 60, identifier: "credits:general" },
  PURCHASE: { limit: 10, windowInSeconds: 60, identifier: "credits:purchase" },
};

// ============================================================================
// Credits Routes
// ============================================================================

const credits = new Hono<{ Bindings: CreditsRoutesEnv }>();

// ----------------------------------------------------------------------------
// GET /balance - Get user's credit balance
// ----------------------------------------------------------------------------
credits.get(
  "/balance",
  rateLimitMiddleware(RATE_LIMITS.CREDITS),
  async (c) => {
    try {
      const session = await requireVerifiedEmail(c);

      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      return c.json({
        balance: session.user.currentCredits,
      });
    } catch (error) {
      console.error("Get balance error:", error);
      return c.json({ error: "Failed to get balance" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /transactions - Get credit transactions
// ----------------------------------------------------------------------------
credits.get(
  "/transactions",
  rateLimitMiddleware(RATE_LIMITS.CREDITS),
  zValidator("query", getTransactionsSchema),
  async (c) => {
    const { page, limit } = c.req.valid("query");

    try {
      const session = await requireVerifiedEmail(c);

      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      const result = await getCreditTransactions(c.env, {
        userId: session.user.id,
        page,
        limit,
      });

      return c.json({
        transactions: result.transactions,
        pagination: {
          total: result.pagination.total,
          pages: result.pagination.pages,
          current: result.pagination.current,
        },
      });
    } catch (error) {
      console.error("Get transactions error:", error);
      return c.json({ error: "Failed to get transactions" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /payment-intent - Create Stripe payment intent
// ----------------------------------------------------------------------------
credits.post(
  "/payment-intent",
  rateLimitMiddleware(RATE_LIMITS.PURCHASE),
  zValidator("json", createPaymentIntentSchema),
  async (c) => {
    const { packageId } = c.req.valid("json");

    if (DISABLE_CREDIT_BILLING_SYSTEM) {
      return c.json({ error: "Credit billing system is disabled" }, 400);
    }

    try {
      const session = await requireVerifiedEmail(c);

      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      const creditPackage = getCreditPackage(packageId);
      if (!creditPackage) {
        return c.json({ error: "Invalid package" }, 400);
      }

      const stripe = getStripe(c.env);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: creditPackage.price * 100,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
        metadata: {
          userId: session.user.id,
          packageId: creditPackage.id,
          credits: creditPackage.credits.toString(),
        },
      });

      return c.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error("Payment intent creation error:", error);
      return c.json({ error: "Failed to create payment intent" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /confirm-payment - Confirm payment and add credits
// ----------------------------------------------------------------------------
credits.post(
  "/confirm-payment",
  rateLimitMiddleware(RATE_LIMITS.PURCHASE),
  zValidator("json", confirmPaymentSchema),
  async (c) => {
    const { packageId, paymentIntentId } = c.req.valid("json");

    if (DISABLE_CREDIT_BILLING_SYSTEM) {
      return c.json({ error: "Credit billing system is disabled" }, 400);
    }

    try {
      const session = await requireVerifiedEmail(c);

      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      const creditPackage = getCreditPackage(packageId);
      if (!creditPackage) {
        return c.json({ error: "Invalid package" }, 400);
      }

      // Verify the payment intent
      const stripe = getStripe(c.env);
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== "succeeded") {
        return c.json({ error: "Payment not completed" }, 400);
      }

      // Verify the payment intent metadata matches
      if (
        paymentIntent.metadata.userId !== session.user.id ||
        paymentIntent.metadata.packageId !== packageId ||
        parseInt(paymentIntent.metadata.credits) !== creditPackage.credits
      ) {
        return c.json({ error: "Invalid payment intent" }, 400);
      }

      // Add credits and log transaction
      await addUserCredits(c.env, session.user.id, creditPackage.credits);
      await logTransaction(c.env, {
        userId: session.user.id,
        amount: creditPackage.credits,
        description: `Purchased ${creditPackage.credits} credits`,
        type: CREDIT_TRANSACTION_TYPE.PURCHASE,
        expirationDate: new Date(Date.now() + ms(`${CREDITS_EXPIRATION_YEARS} years`)),
        paymentIntentId: paymentIntent.id,
      });

      // Update all KV sessions to reflect the new credit balance
      await updateAllSessionsOfUser(c.env, session.user.id);

      return c.json({ success: true });
    } catch (error) {
      console.error("Purchase error:", error);
      return c.json({ error: "Failed to process payment" }, 500);
    }
  }
);

export default credits;
