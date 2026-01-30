/**
 * Stripe Service - Payment processing
 * Adapted from _ref/src/lib/stripe.ts
 */

import Stripe from "stripe";

// ============================================================================
// Types
// ============================================================================

export interface StripeEnv {
  STRIPE_SECRET_KEY: string;
}

// ============================================================================
// Stripe Instance Management
// ============================================================================

// In Cloudflare Workers, we create a new instance per request
// since the worker may be terminated between requests
export function getStripe(env: StripeEnv): Stripe {
  const stripeSecretKey = env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
    httpClient: Stripe.createFetchHttpClient()
  });
}
