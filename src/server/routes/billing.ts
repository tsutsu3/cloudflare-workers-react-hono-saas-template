/**
 * Billing Routes
 * Stripe webhook handling
 */

import { Hono } from "hono";
import ms from "ms";

import { getStripe, type StripeEnv } from "@/server/services/stripe-service";
import {
  addUserCredits,
  logTransaction,
  type CreditEnv,
} from "@/server/services/credits-service";
import { updateAllSessionsOfUser, type AuthEnv } from "@/server/services/auth-service";
import { CREDIT_TRANSACTION_TYPE } from "@/db/schema";
import { CREDITS_EXPIRATION_YEARS } from "@/shared/constants";
import type Stripe from "stripe";

// ============================================================================
// Types
// ============================================================================

export interface BillingRoutesEnv extends AuthEnv, CreditEnv, StripeEnv {
  STRIPE_WEBHOOK_SECRET?: string;
}

// ============================================================================
// Billing Routes
// ============================================================================

const billing = new Hono<{ Bindings: BillingRoutesEnv }>();

// ----------------------------------------------------------------------------
// POST /webhook - Handle Stripe webhooks
// ----------------------------------------------------------------------------
billing.post("/webhook", async (c) => {
  const stripe = getStripe(c.env);
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return c.json({ error: "Webhook secret not configured" }, 500);
  }

  let event: Stripe.Event;

  try {
    const body = await c.req.text();
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return c.json({ error: "Webhook signature verification failed" }, 400);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(c.env, paymentIntent);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`Payment failed for ${paymentIntent.id}:`, paymentIntent.last_payment_error?.message);
        // Could send email notification here
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(c.env, charge);
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`Dispute created: ${dispute.id} for charge ${dispute.charge}`);
        // Could send email notification or freeze account here
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

async function handlePaymentIntentSucceeded(
  env: BillingRoutesEnv,
  paymentIntent: Stripe.PaymentIntent
) {
  const { userId, packageId, credits } = paymentIntent.metadata;

  if (!userId || !packageId || !credits) {
    console.error("Missing metadata in payment intent:", paymentIntent.id);
    return;
  }

  const creditAmount = parseInt(credits, 10);

  if (isNaN(creditAmount) || creditAmount <= 0) {
    console.error("Invalid credit amount in payment intent:", paymentIntent.id);
    return;
  }

  // Add credits to user
  await addUserCredits(env, userId, creditAmount);

  // Log the transaction
  await logTransaction(env, {
    userId,
    amount: creditAmount,
    description: `Purchased ${creditAmount} credits via Stripe`,
    type: CREDIT_TRANSACTION_TYPE.PURCHASE,
    expirationDate: new Date(Date.now() + ms(`${CREDITS_EXPIRATION_YEARS} years`)),
    paymentIntentId: paymentIntent.id,
  });

  // Update user sessions
  await updateAllSessionsOfUser(env, userId);

  console.log(`Successfully added ${creditAmount} credits to user ${userId}`);
}

async function handleChargeRefunded(
  env: BillingRoutesEnv,
  charge: Stripe.Charge
) {
  // Get the payment intent to find user info
  if (!charge.payment_intent) {
    console.error("No payment intent for refunded charge:", charge.id);
    return;
  }

  const stripe = getStripe(env);
  const paymentIntent = await stripe.paymentIntents.retrieve(
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent.id
  );

  const { userId, credits } = paymentIntent.metadata;

  if (!userId || !credits) {
    console.error("Missing metadata for refund:", charge.id);
    return;
  }

  const creditAmount = parseInt(credits, 10);

  if (isNaN(creditAmount) || creditAmount <= 0) {
    console.error("Invalid credit amount for refund:", charge.id);
    return;
  }

  // Calculate refund amount (could be partial)
  const refundedAmount = charge.amount_refunded;
  const totalAmount = charge.amount;
  const refundRatio = refundedAmount / totalAmount;
  const creditsToRemove = Math.floor(creditAmount * refundRatio);

  if (creditsToRemove > 0) {
    // Remove credits from user (negative amount)
    await addUserCredits(env, userId, -creditsToRemove);

    // Log the transaction
    await logTransaction(env, {
      userId,
      amount: -creditsToRemove,
      description: `Refund: Removed ${creditsToRemove} credits`,
      type: CREDIT_TRANSACTION_TYPE.REFUND,
    });

    // Update user sessions
    await updateAllSessionsOfUser(env, userId);

    console.log(`Removed ${creditsToRemove} credits from user ${userId} due to refund`);
  }
}

export default billing;
