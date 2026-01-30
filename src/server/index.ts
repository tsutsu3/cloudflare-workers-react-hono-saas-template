/**
 * Hono Server Entry Point
 * Main application file for Cloudflare Workers
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

// Import routes
import authRoutes from "./routes/auth";
import teamsRoutes from "./routes/teams";
import creditsRoutes from "./routes/credits";
import adminRoutes from "./routes/admin";
import billingRoutes from "./routes/billing";

// ============================================================================
// Types
// ============================================================================

export interface Env {
  // Database
  DB: D1Database;
  NEXT_TAG_CACHE_D1: D1Database; // Alias for DB (legacy name)

  // KV Storage
  NEXT_INC_CACHE_KV: KVNamespace;

  // Environment
  ENVIRONMENT?: string;

  // Email Configuration
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_REPLY_TO?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;

  // Google OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // Stripe
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // Turnstile (CAPTCHA)
  TURNSTILE_SECRET_KEY?: string;
}

// ============================================================================
// Create Hono App
// ============================================================================

const app = new Hono<{ Bindings: Env }>();

// ============================================================================
// Middleware
// ============================================================================

// Logging middleware
app.use("*", logger());

// CORS configuration
app.use(
  "*",
  cors({
    origin: (origin) => origin, // Allow same-origin requests
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Add DB alias middleware (map NEXT_TAG_CACHE_D1 to DB for backwards compatibility)
app.use("*", async (c, next) => {
  if (!c.env.DB && c.env.NEXT_TAG_CACHE_D1) {
    (c.env as Env).DB = c.env.NEXT_TAG_CACHE_D1;
  }
  await next();
});

// ============================================================================
// API Routes
// ============================================================================

// Auth routes - /api/auth/*
app.route("/api/auth", authRoutes);

// Teams routes - /api/teams/*
app.route("/api/teams", teamsRoutes);

// Credits routes - /api/credits/*
app.route("/api/credits", creditsRoutes);

// Admin routes - /api/admin/*
app.route("/api/admin", adminRoutes);

// Billing routes - /api/billing/*
app.route("/api/billing", billingRoutes);

// ============================================================================
// Health Check
// ============================================================================

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// Config API (for frontend)
// ============================================================================

app.get("/api/config", (c) => {
  return c.json({
    isGoogleSSOEnabled: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    isTurnstileEnabled: Boolean(c.env.TURNSTILE_SECRET_KEY),
    isCreditBillingEnabled: Boolean(c.env.STRIPE_SECRET_KEY),
  });
});

// ============================================================================
// Static Assets & SPA Fallback
// ============================================================================

// In production, serve static files from the assets directory
// For development, Vite dev server handles this

app.get("*", async (c) => {
  // Return a basic HTML shell for SPA
  // In production, this would serve the built index.html
  return c.html(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SaaS Template</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>`);
});

// ============================================================================
// Export
// ============================================================================

export default app;
