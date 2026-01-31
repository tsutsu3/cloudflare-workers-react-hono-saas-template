/**
 * Marketplace Routes
 * Converted from ZSA Server Actions to Hono API routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { getDB } from "@/db";
import { purchasedItemsTable, PURCHASABLE_ITEM_TYPE } from "@/db/schema";
import {
  requireVerifiedEmail,
  updateAllSessionsOfUser,
  type AuthEnv,
} from "@/server/services/auth-service";
import {
  hasEnoughCredits,
  consumeCredits,
  getUserPurchasedItems,
  type CreditEnv,
} from "@/server/services/credits-service";
import { rateLimitMiddleware } from "@/server/middleware/rate-limit";
import { DISABLE_CREDIT_BILLING_SYSTEM } from "@/shared/constants";

// Component catalog for price lookup (must match client-side catalog)
const COMPONENT_PRICES: Record<string, { name: string; credits: number }> = {
  "team-switcher": { name: "Team Switcher", credits: 4 },
  "theme-switch": { name: "Theme Switch", credits: 4 },
  "separator-with-text": { name: "Separator With Text", credits: 3 },
  "nav-user": { name: "User Navigation Dropdown", credits: 10 },
  "page-header": { name: "Page Header with Breadcrumbs", credits: 12 },
  "button": { name: "Button", credits: 8 },
};

// ============================================================================
// Types
// ============================================================================

export interface MarketplaceRoutesEnv extends AuthEnv, CreditEnv {}

// ============================================================================
// Schemas
// ============================================================================

const purchaseSchema = z.object({
  itemId: z.string(),
  itemType: z.enum([PURCHASABLE_ITEM_TYPE.COMPONENT]),
});

// ============================================================================
// Rate Limit Options
// ============================================================================

const RATE_LIMITS = {
  MARKETPLACE: { limit: 30, windowInSeconds: 60, identifier: "marketplace:general" },
  PURCHASE: { limit: 10, windowInSeconds: 60, identifier: "marketplace:purchase" },
};

// ============================================================================
// Marketplace Routes
// ============================================================================

const marketplace = new Hono<{ Bindings: MarketplaceRoutesEnv }>();

// ----------------------------------------------------------------------------
// GET /purchased-items - Get user's purchased items
// ----------------------------------------------------------------------------
marketplace.get(
  "/purchased-items",
  rateLimitMiddleware(RATE_LIMITS.MARKETPLACE),
  async (c) => {
    try {
      const session = await requireVerifiedEmail(c);

      if (!session) {
        return c.json({ purchasedItems: [] });
      }

      const purchasedItems = await getUserPurchasedItems(c.env, session.user.id);

      // Convert Set to array for JSON response
      return c.json({
        purchasedItems: Array.from(purchasedItems),
      });
    } catch (error) {
      console.error("Get purchased items error:", error);
      return c.json({ purchasedItems: [] });
    }
  }
);

// ----------------------------------------------------------------------------
// POST /purchase - Purchase an item
// ----------------------------------------------------------------------------
marketplace.post(
  "/purchase",
  rateLimitMiddleware(RATE_LIMITS.PURCHASE),
  zValidator("json", purchaseSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = getDB(c.env.DB);

    if (DISABLE_CREDIT_BILLING_SYSTEM) {
      return c.json({ error: "Marketplace is not available when credit billing is disabled" }, 400);
    }

    try {
      const session = await requireVerifiedEmail(c);

      if (!session) {
        return c.json({ error: "You must be logged in to make purchases" }, 401);
      }

      // Get item details based on type
      let itemDetails: { name: string; credits: number } | undefined;
      switch (input.itemType) {
        case PURCHASABLE_ITEM_TYPE.COMPONENT:
          itemDetails = COMPONENT_PRICES[input.itemId];
          break;
      }

      if (!itemDetails) {
        return c.json({ error: "Item not found" }, 404);
      }

      // Check if user already owns the item
      const existingPurchase = await db.query.purchasedItemsTable.findFirst({
        where: and(
          eq(purchasedItemsTable.userId, session.user.id),
          eq(purchasedItemsTable.itemType, input.itemType),
          eq(purchasedItemsTable.itemId, input.itemId)
        ),
      });

      if (existingPurchase) {
        return c.json({ error: "You already own this item" }, 409);
      }

      // Check if user has enough credits
      const hasCredits = await hasEnoughCredits(c.env, {
        userId: session.user.id,
        requiredCredits: itemDetails.credits,
      });

      if (!hasCredits) {
        return c.json({ error: "You don't have enough credits to purchase this item" }, 402);
      }

      // Use credits
      await consumeCredits(c.env, {
        userId: session.user.id,
        amount: itemDetails.credits,
        description: `Purchased ${input.itemType.toLowerCase()}: ${itemDetails.name}`,
      });

      // Add item to user's purchased items
      await db.insert(purchasedItemsTable).values({
        userId: session.user.id,
        itemType: input.itemType,
        itemId: input.itemId,
      });

      // Update all sessions to reflect the new credit balance
      await updateAllSessionsOfUser(c.env, session.user.id);

      return c.json({ success: true });
    } catch (error) {
      console.error("Purchase error:", error);
      if (error instanceof Error && error.message.includes("Insufficient credits")) {
        return c.json({ error: "Insufficient credits" }, 402);
      }
      return c.json({ error: "Failed to process purchase" }, 500);
    }
  }
);

export default marketplace;
