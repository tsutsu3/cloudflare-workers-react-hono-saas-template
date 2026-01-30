/**
 * Auth Routes
 * Converted from ZSA Server Actions to Hono API routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { createId, init } from "@paralleldrive/cuid2";
import ms from "ms";

import { getDB } from "@/db";
import { userTable, passKeyCredentialTable } from "@/db/schema";
import {
  createAndStoreSession,
  getSessionFromCookie,
  deleteSessionTokenCookie,
  invalidateSession,
  updateAllSessionsOfUser,
  canSignUp,
  type AuthEnv,
} from "@/server/services/auth-service";
import { hashPassword, verifyPassword } from "@/server/utils/password-hasher";
import { getIP } from "@/server/utils/get-ip";
import { getResetTokenKey, getVerificationTokenKey } from "@/server/utils/auth-utils";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/server/services/email-service";
import { validateTurnstileToken } from "@/server/utils/validate-captcha";
import { isTurnstileEnabled, isGoogleSSOEnabled } from "@/server/utils/flags";
import { getGoogleSSOClient } from "@/server/lib/google-sso";
import { rateLimitMiddleware } from "@/server/middleware/rate-limit";
import {
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
} from "@/server/services/webauthn-service";

import { signInSchema } from "@/shared/schemas/signin.schema";
import { signUpSchema } from "@/shared/schemas/signup.schema";
import { forgotPasswordSchema } from "@/shared/schemas/forgot-password.schema";
import { resetPasswordSchema } from "@/shared/schemas/reset-password.schema";
import { verifyEmailSchema } from "@/shared/schemas/verify-email.schema";
import { passkeyEmailSchema } from "@/shared/schemas/passkey.schema";
import { googleSSOCallbackSchema } from "@/shared/schemas/google-sso-callback.schema";

import {
  EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS,
  PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME,
  REDIRECT_AFTER_SIGN_IN,
} from "@/shared/constants";
import { isProd } from "@/server/utils/is-prod";
import { getConfig } from "@/server/utils/flags";
import { generateState, generateCodeVerifier, decodeIdToken } from "arctic";
import type { RegistrationResponseJSON, AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";

// ============================================================================
// Types
// ============================================================================

export interface AuthRoutesEnv extends AuthEnv {
  TURNSTILE_SECRET_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  EMAIL_REPLY_TO?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
}

// Create a longer ID generator for reset tokens
const createResetId = init({ length: 32 });

// Cookie names for passkey flow
const PASSKEY_CHALLENGE_COOKIE_NAME = "passkey_challenge";
const PASSKEY_USER_ID_COOKIE_NAME = "passkey_user_id";

// Google SSO response type
type GoogleSSOResponse = {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  at_hash: string;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
  iat: number;
  exp: number;
};

// ============================================================================
// Rate Limit Options
// ============================================================================

const RATE_LIMITS = {
  SIGN_IN: { limit: 10, windowInSeconds: 60, identifier: "auth:sign-in" },
  SIGN_UP: { limit: 5, windowInSeconds: 60, identifier: "auth:sign-up" },
  FORGOT_PASSWORD: { limit: 5, windowInSeconds: 60, identifier: "auth:forgot-password" },
  RESET_PASSWORD: { limit: 5, windowInSeconds: 60, identifier: "auth:reset-password" },
  VERIFY_EMAIL: { limit: 10, windowInSeconds: 60, identifier: "auth:verify-email" },
  PASSKEY: { limit: 10, windowInSeconds: 60, identifier: "auth:passkey" },
  GOOGLE_SSO: { limit: 10, windowInSeconds: 60, identifier: "auth:google-sso" },
  SESSION: { limit: 60, windowInSeconds: 60, identifier: "auth:session" },
};

// ============================================================================
// Auth Routes
// ============================================================================

const auth = new Hono<{ Bindings: AuthRoutesEnv }>();

// ----------------------------------------------------------------------------
// POST /sign-in - Sign in with email/password
// ----------------------------------------------------------------------------
auth.post(
  "/sign-in",
  rateLimitMiddleware(RATE_LIMITS.SIGN_IN),
  zValidator("json", signInSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      // Find user by email
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.email, email),
      });

      if (!user) {
        return c.json({ error: "Invalid email or password" }, 401);
      }

      // Check if user has only Google SSO
      if (!user.passwordHash && user.googleAccountId) {
        return c.json({ error: "Please sign in with your Google account instead." }, 403);
      }

      if (!user.passwordHash) {
        return c.json({ error: "Invalid email or password" }, 401);
      }

      // Verify password
      const isValid = await verifyPassword({
        storedHash: user.passwordHash,
        passwordAttempt: password,
      });

      if (!isValid) {
        return c.json({ error: "Invalid email or password" }, 401);
      }

      // Create session
      await createAndStoreSession(c, user.id, "password");

      return c.json({ success: true });
    } catch (error) {
      console.error("Sign in error:", error);
      return c.json({ error: "An unexpected error occurred" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /sign-up - Create new account with email/password
// ----------------------------------------------------------------------------
auth.post(
  "/sign-up",
  rateLimitMiddleware(RATE_LIMITS.SIGN_UP),
  zValidator("json", signUpSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      // Validate captcha if enabled
      if (isTurnstileEnabled(c.env) && input.captchaToken) {
        const success = await validateTurnstileToken(c.env, input.captchaToken);
        if (!success) {
          return c.json({ error: "Please complete the captcha" }, 400);
        }
      }

      // Check if email is disposable
      await canSignUp(c.env, { email: input.email });

      // Check if email is already taken
      const existingUser = await db.query.userTable.findFirst({
        where: eq(userTable.email, input.email),
      });

      if (existingUser) {
        return c.json({ error: "Email already taken" }, 409);
      }

      // Hash the password
      const hashedPassword = await hashPassword({ password: input.password });

      // Get client IP
      const ipAddress = getIP(c);

      // Create the user
      const [user] = await db
        .insert(userTable)
        .values({
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash: hashedPassword,
          signUpIpAddress: ipAddress,
        })
        .returning();

      if (!user || !user.email) {
        return c.json({ error: "Failed to create user" }, 500);
      }

      // Create a session and set cookie
      await createAndStoreSession(c, user.id, "password");

      // Generate verification token
      const verificationToken = createId();
      const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS * 1000);

      // Save verification token in KV with expiration
      await c.env.NEXT_INC_CACHE_KV.put(
        getVerificationTokenKey(verificationToken),
        JSON.stringify({
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
        }),
        {
          expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        }
      );

      // Send verification email
      await sendVerificationEmail(c.env, {
        email: user.email,
        verificationToken,
        username: user.firstName || user.email,
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Sign up error:", error);
      if (error instanceof Error && error.message.includes("disposable")) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: "An unexpected error occurred" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /sign-out - Sign out current session
// ----------------------------------------------------------------------------
auth.post("/sign-out", async (c) => {
  try {
    const session = await getSessionFromCookie(c);

    if (session) {
      await invalidateSession(c.env, session.id, session.user.id);
    }

    deleteSessionTokenCookie(c);

    return c.json({ success: true });
  } catch (error) {
    console.error("Sign out error:", error);
    // Still delete the cookie even if there's an error
    deleteSessionTokenCookie(c);
    return c.json({ success: true });
  }
});

// ----------------------------------------------------------------------------
// GET /session - Get current session
// ----------------------------------------------------------------------------
auth.get(
  "/session",
  rateLimitMiddleware(RATE_LIMITS.SESSION),
  async (c) => {
    const config = getConfig(c.env);

    try {
      const session = await getSessionFromCookie(c);

      if (!session) {
        return c.json({ session: null, config }, 200);
      }

      return c.json({
        session: {
          authenticated: true,
          user: {
            id: session.user.id,
            email: session.user.email,
            firstName: session.user.firstName,
            lastName: session.user.lastName,
            avatar: session.user.avatar,
            emailVerified: session.user.emailVerified,
            role: session.user.role,
            credits: session.user.currentCredits,
          },
          teams: session.teams,
          selectedTeamId: session.selectedTeam,
        },
        config,
      });
    } catch (error) {
      console.error("Session error:", error);
      return c.json({ session: null, config }, 200);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /forgot-password - Request password reset
// ----------------------------------------------------------------------------
auth.post(
  "/forgot-password",
  rateLimitMiddleware(RATE_LIMITS.FORGOT_PASSWORD),
  zValidator("json", forgotPasswordSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      // Validate captcha if enabled
      if (isTurnstileEnabled(c.env) && input.captchaToken) {
        const success = await validateTurnstileToken(c.env, input.captchaToken);
        if (!success) {
          return c.json({ error: "Please complete the captcha" }, 400);
        }
      }

      // Find user by email
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.email, input.email.toLowerCase()),
      });

      // Even if user is not found, return success to prevent email enumeration
      if (!user) {
        return c.json({ success: true });
      }

      // Generate reset token
      const token = createResetId();
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS * 1000);

      // Save reset token in KV with expiration
      await c.env.NEXT_INC_CACHE_KV.put(
        getResetTokenKey(token),
        JSON.stringify({
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
        }),
        {
          expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        }
      );

      // Send reset email
      if (user.email) {
        await sendPasswordResetEmail(c.env, {
          email: user.email,
          resetToken: token,
          username: user.firstName ?? user.email,
        });
      }

      return c.json({ success: true });
    } catch (error) {
      console.error("Forgot password error:", error);
      return c.json({ error: "An unexpected error occurred" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /reset-password - Reset password with token
// ----------------------------------------------------------------------------
auth.post(
  "/reset-password",
  rateLimitMiddleware(RATE_LIMITS.RESET_PASSWORD),
  zValidator("json", resetPasswordSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      // Find valid reset token
      const resetTokenStr = await c.env.NEXT_INC_CACHE_KV.get(getResetTokenKey(input.token));
      if (!resetTokenStr) {
        return c.json({ error: "Invalid or expired reset token" }, 404);
      }

      const resetToken = JSON.parse(resetTokenStr) as {
        userId: string;
        expiresAt: string;
      };

      // Check if token is expired
      if (new Date() > new Date(resetToken.expiresAt)) {
        return c.json({ error: "Reset token has expired" }, 412);
      }

      // Find user
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.id, resetToken.userId),
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      // Update password
      const passwordHash = await hashPassword({ password: input.password });
      await db
        .update(userTable)
        .set({ passwordHash })
        .where(eq(userTable.id, resetToken.userId));

      // Delete the used token
      await c.env.NEXT_INC_CACHE_KV.delete(getResetTokenKey(input.token));

      return c.json({ success: true });
    } catch (error) {
      console.error("Reset password error:", error);
      return c.json({ error: "An unexpected error occurred" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /verify-email - Verify email with token
// ----------------------------------------------------------------------------
auth.post(
  "/verify-email",
  rateLimitMiddleware(RATE_LIMITS.VERIFY_EMAIL),
  zValidator("json", verifyEmailSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      const verificationTokenStr = await c.env.NEXT_INC_CACHE_KV.get(
        getVerificationTokenKey(input.token)
      );

      if (!verificationTokenStr) {
        return c.json({ error: "Verification token not found or expired" }, 404);
      }

      const verificationToken = JSON.parse(verificationTokenStr) as {
        userId: string;
        expiresAt: string;
      };

      // Check if token is expired
      if (new Date() > new Date(verificationToken.expiresAt)) {
        return c.json({ error: "Verification token not found or expired" }, 404);
      }

      // Find user
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.id, verificationToken.userId),
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      // Update user's email verification status
      await db
        .update(userTable)
        .set({ emailVerified: new Date() })
        .where(eq(userTable.id, verificationToken.userId));

      // Update all sessions of the user
      await updateAllSessionsOfUser(c.env, verificationToken.userId);

      // Delete the used token
      await c.env.NEXT_INC_CACHE_KV.delete(getVerificationTokenKey(input.token));

      return c.json({ success: true });
    } catch (error) {
      console.error("Verify email error:", error);
      return c.json({ error: "An unexpected error occurred" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /resend-verification - Resend verification email
// ----------------------------------------------------------------------------
auth.post(
  "/resend-verification",
  rateLimitMiddleware(RATE_LIMITS.VERIFY_EMAIL),
  async (c) => {
    try {
      const session = await getSessionFromCookie(c);

      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      if (session.user.emailVerified) {
        return c.json({ error: "Email already verified" }, 400);
      }

      // Generate new verification token
      const verificationToken = createId();
      const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS * 1000);

      // Save verification token in KV with expiration
      await c.env.NEXT_INC_CACHE_KV.put(
        getVerificationTokenKey(verificationToken),
        JSON.stringify({
          userId: session.user.id,
          expiresAt: expiresAt.toISOString(),
        }),
        {
          expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        }
      );

      // Send verification email
      if (!session.user.email) {
        return c.json({ error: "User email not found" }, 400);
      }
      await sendVerificationEmail(c.env, {
        email: session.user.email,
        verificationToken,
        username: session.user.firstName || session.user.email,
      });

      return c.json({ success: true });
    } catch (error) {
      console.error("Resend verification error:", error);
      return c.json({ error: "An unexpected error occurred" }, 500);
    }
  }
);

// ============================================================================
// Passkey Routes
// ============================================================================

// ----------------------------------------------------------------------------
// POST /passkey/register-options - Generate passkey registration options
// ----------------------------------------------------------------------------
auth.post(
  "/passkey/register-options",
  rateLimitMiddleware(RATE_LIMITS.PASSKEY),
  zValidator("json", z.object({ email: z.string().email() })),
  async (c) => {
    const { email } = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      // Check if user is logged in
      const session = await getSessionFromCookie(c);
      if (!session || !session.user.emailVerified) {
        return c.json({ error: "Email must be verified to register a passkey" }, 403);
      }

      const user = await db.query.userTable.findFirst({
        where: eq(userTable.email, email),
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      // Verify the email matches the logged-in user
      if (user.id !== session.user.id) {
        return c.json({ error: "You can only register passkeys for your own account" }, 403);
      }

      // Check if user has reached the passkey limit
      const existingPasskeys = await db
        .select()
        .from(passKeyCredentialTable)
        .where(eq(passKeyCredentialTable.userId, user.id));

      if (existingPasskeys.length >= 5) {
        return c.json({ error: "You have reached the maximum limit of 5 passkeys" }, 403);
      }

      const options = await generatePasskeyRegistrationOptions(c.env, user.id, email);
      return c.json(options);
    } catch (error) {
      console.error("Passkey register options error:", error);
      return c.json({ error: "Failed to generate registration options" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /passkey/register - Verify passkey registration
// ----------------------------------------------------------------------------
auth.post(
  "/passkey/register",
  rateLimitMiddleware(RATE_LIMITS.PASSKEY),
  zValidator(
    "json",
    z.object({
      email: z.string().email(),
      response: z.any(),
      challenge: z.string(),
    })
  ),
  async (c) => {
    const { email, response, challenge } = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      // Check if user is logged in
      const session = await getSessionFromCookie(c);
      if (!session || !session.user.emailVerified) {
        return c.json({ error: "Email must be verified to register a passkey" }, 403);
      }

      const user = await db.query.userTable.findFirst({
        where: eq(userTable.email, email),
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      // Verify the email matches the logged-in user
      if (user.id !== session.user.id) {
        return c.json({ error: "You can only register passkeys for your own account" }, 403);
      }

      await verifyPasskeyRegistration(c.env, {
        userId: user.id,
        response: response as RegistrationResponseJSON,
        challenge,
        userAgent: c.req.header("user-agent") ?? null,
        ipAddress: getIP(c),
      });

      await createAndStoreSession(c, user.id, "passkey", response.id);

      return c.json({ success: true });
    } catch (error) {
      console.error("Passkey register error:", error);
      return c.json({ error: "Failed to register passkey" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /passkey/authenticate-options - Generate passkey authentication options
// ----------------------------------------------------------------------------
auth.post(
  "/passkey/authenticate-options",
  rateLimitMiddleware(RATE_LIMITS.PASSKEY),
  async (c) => {
    try {
      const options = await generatePasskeyAuthenticationOptions(c.env);
      return c.json(options);
    } catch (error) {
      console.error("Passkey authenticate options error:", error);
      return c.json({ error: "Failed to generate authentication options" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /passkey/authenticate - Verify passkey authentication
// ----------------------------------------------------------------------------
auth.post(
  "/passkey/authenticate",
  rateLimitMiddleware(RATE_LIMITS.PASSKEY),
  zValidator(
    "json",
    z.object({
      response: z.any(),
      challenge: z.string(),
    })
  ),
  async (c) => {
    const { response, challenge } = c.req.valid("json");

    try {
      const { verification, credential } = await verifyPasskeyAuthentication(
        c.env,
        response as AuthenticationResponseJSON,
        challenge
      );

      if (!verification.verified) {
        return c.json({ error: "Passkey authentication failed" }, 403);
      }

      await createAndStoreSession(c, credential.userId, "passkey", response.id);

      return c.json({ success: true });
    } catch (error) {
      console.error("Passkey authenticate error:", error);
      return c.json({ error: "Passkey authentication failed" }, 403);
    }
  }
);

// ----------------------------------------------------------------------------
// DELETE /passkey/:credentialId - Delete a passkey
// ----------------------------------------------------------------------------
auth.delete(
  "/passkey/:credentialId",
  rateLimitMiddleware(RATE_LIMITS.PASSKEY),
  async (c) => {
    const credentialId = c.req.param("credentialId");
    const db = getDB(c.env.DB);

    try {
      const session = await getSessionFromCookie(c);
      if (!session || !session.user.emailVerified) {
        return c.json({ error: "Email must be verified" }, 403);
      }

      // Prevent deletion of the current passkey
      if (session.passkeyCredentialId === credentialId) {
        return c.json({ error: "Cannot delete the current passkey" }, 403);
      }

      // Get all user's passkeys
      const passkeys = await db
        .select()
        .from(passKeyCredentialTable)
        .where(eq(passKeyCredentialTable.userId, session.user.id));

      // Get full user data to check password
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.id, session.user.id),
      });

      // Check if this is the last passkey and if the user has a password
      if (passkeys.length === 1 && !user?.passwordHash) {
        return c.json({ error: "Cannot delete the last passkey when no password is set" }, 403);
      }

      await db
        .delete(passKeyCredentialTable)
        .where(eq(passKeyCredentialTable.credentialId, credentialId));

      return c.json({ success: true });
    } catch (error) {
      console.error("Delete passkey error:", error);
      return c.json({ error: "Failed to delete passkey" }, 500);
    }
  }
);

// ============================================================================
// Passkey Sign-Up Routes
// ============================================================================

// ----------------------------------------------------------------------------
// POST /passkey-signup/start - Start passkey registration for new user
// ----------------------------------------------------------------------------
auth.post(
  "/passkey-signup/start",
  rateLimitMiddleware(RATE_LIMITS.SIGN_UP),
  zValidator("json", passkeyEmailSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      // Validate captcha if enabled
      if (isTurnstileEnabled(c.env) && input.captchaToken) {
        const success = await validateTurnstileToken(c.env, input.captchaToken);
        if (!success) {
          return c.json({ error: "Please complete the captcha" }, 400);
        }
      }

      // Check if email is disposable
      await canSignUp(c.env, { email: input.email });

      const existingUser = await db.query.userTable.findFirst({
        where: eq(userTable.email, input.email),
      });

      if (existingUser) {
        return c.json({ error: "An account with this email already exists" }, 409);
      }

      const ipAddress = getIP(c);

      const [user] = await db
        .insert(userTable)
        .values({
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          signUpIpAddress: ipAddress,
        })
        .returning();

      if (!user) {
        return c.json({ error: "Failed to create user" }, 500);
      }

      // Generate passkey registration options
      const options = await generatePasskeyRegistrationOptions(c.env, user.id, input.email);

      // Store the challenge in a cookie for verification
      setCookie(c, PASSKEY_CHALLENGE_COOKIE_NAME, options.challenge, {
        httpOnly: true,
        secure: isProd(c.env),
        sameSite: "Strict",
        path: "/",
        maxAge: Math.floor(ms("10 minutes") / 1000),
      });

      // Store the user ID in a cookie for verification
      setCookie(c, PASSKEY_USER_ID_COOKIE_NAME, user.id, {
        httpOnly: true,
        secure: isProd(c.env),
        sameSite: "Strict",
        path: "/",
        maxAge: Math.floor(ms("10 minutes") / 1000),
      });

      // Convert options to the expected type
      const optionsJSON: PublicKeyCredentialCreationOptionsJSON = {
        rp: options.rp,
        user: options.user,
        challenge: options.challenge,
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        excludeCredentials: options.excludeCredentials,
        authenticatorSelection: options.authenticatorSelection,
        attestation: options.attestation,
        extensions: options.extensions,
      };

      return c.json({ optionsJSON });
    } catch (error) {
      console.error("Passkey signup start error:", error);
      if (error instanceof Error && error.message.includes("disposable")) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: "An unexpected error occurred" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /passkey-signup/complete - Complete passkey registration for new user
// ----------------------------------------------------------------------------
auth.post(
  "/passkey-signup/complete",
  zValidator("json", z.object({ response: z.any() })),
  async (c) => {
    const { response } = c.req.valid("json");
    const db = getDB(c.env.DB);

    const challenge = getCookie(c, PASSKEY_CHALLENGE_COOKIE_NAME);
    const userId = getCookie(c, PASSKEY_USER_ID_COOKIE_NAME);

    if (!challenge || !userId) {
      return c.json({ error: "Invalid registration session" }, 412);
    }

    try {
      // Verify the registration
      await verifyPasskeyRegistration(c.env, {
        userId,
        response: response as RegistrationResponseJSON,
        challenge,
        userAgent: c.req.header("user-agent") ?? null,
        ipAddress: getIP(c),
      });

      // Get user details for email verification
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.id, userId),
      });

      if (!user || !user.email) {
        return c.json({ error: "User not found" }, 500);
      }

      // Generate verification token
      const verificationToken = createId();
      const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS * 1000);

      // Save verification token in KV with expiration
      await c.env.NEXT_INC_CACHE_KV.put(
        getVerificationTokenKey(verificationToken),
        JSON.stringify({
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
        }),
        {
          expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        }
      );

      // Send verification email
      await sendVerificationEmail(c.env, {
        email: user.email,
        verificationToken,
        username: user.firstName || user.email,
      });

      // Create a session and set cookie
      await createAndStoreSession(c, userId, "passkey", response.id);

      // Clean up cookies
      deleteCookie(c, PASSKEY_CHALLENGE_COOKIE_NAME);
      deleteCookie(c, PASSKEY_USER_ID_COOKIE_NAME);

      return c.json({ success: true });
    } catch (error) {
      console.error("Passkey signup complete error:", error);
      return c.json({ error: "Failed to register passkey" }, 412);
    }
  }
);

// ============================================================================
// Google OAuth Routes
// ============================================================================

// ----------------------------------------------------------------------------
// GET /google - Initiate Google OAuth flow
// ----------------------------------------------------------------------------
auth.get(
  "/google",
  rateLimitMiddleware(RATE_LIMITS.GOOGLE_SSO),
  async (c) => {
    try {
      if (!isGoogleSSOEnabled(c.env)) {
        console.error("Google client ID or secret is not set");
        return c.redirect("/");
      }

      const session = await getSessionFromCookie(c);
      if (session) {
        return c.redirect(REDIRECT_AFTER_SIGN_IN);
      }

      const state = generateState();
      const codeVerifier = generateCodeVerifier();

      const google = getGoogleSSOClient(c.env);
      const ssoRedirectUrl = google.createAuthorizationURL(state, codeVerifier, [
        "openid",
        "profile",
        "email",
      ]);

      const cookieOptions = {
        path: "/",
        httpOnly: true,
        secure: isProd(c.env),
        maxAge: Math.floor(ms("10 minutes") / 1000),
        sameSite: "Lax" as const,
      };

      setCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME, state, cookieOptions);
      setCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME, codeVerifier, cookieOptions);

      return c.redirect(ssoRedirectUrl.toString());
    } catch (error) {
      console.error("Google OAuth error:", error);
      return c.redirect("/");
    }
  }
);

// ----------------------------------------------------------------------------
// POST /google/callback - Handle Google OAuth callback
// ----------------------------------------------------------------------------
auth.post(
  "/google/callback",
  rateLimitMiddleware(RATE_LIMITS.GOOGLE_SSO),
  zValidator("json", googleSSOCallbackSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = getDB(c.env.DB);

    try {
      if (!isGoogleSSOEnabled(c.env)) {
        return c.json({ error: "Google SSO is not enabled" }, 403);
      }

      const cookieState = getCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
      const cookieCodeVerifier = getCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);

      if (!cookieState || !cookieCodeVerifier) {
        return c.json({ error: "Missing required cookies" }, 401);
      }

      if (input.state !== cookieState) {
        return c.json({ error: "Invalid state parameter" }, 401);
      }

      let tokens;
      try {
        const google = getGoogleSSOClient(c.env);
        tokens = await google.validateAuthorizationCode(input.code, cookieCodeVerifier);
      } catch (error) {
        console.error("Google OAuth callback: Error validating authorization code", error);
        return c.json({ error: "Invalid authorization code" }, 401);
      }

      const claims = decodeIdToken(tokens.idToken()) as GoogleSSOResponse;

      const googleAccountId = claims.sub;
      const avatarUrl = claims.picture;
      const email = claims.email;

      await canSignUp(c.env, { email, skipDisposableEmailCheck: true });

      // First check if user exists with this Google account ID
      const existingUserWithGoogle = await db.query.userTable.findFirst({
        where: eq(userTable.googleAccountId, googleAccountId),
      });

      if (existingUserWithGoogle?.id) {
        await createAndStoreSession(c, existingUserWithGoogle.id, "google-oauth");

        // Clean up cookies
        deleteCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
        deleteCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);

        return c.json({ success: true });
      }

      // Then check if user exists with this email
      const existingUserWithEmail = await db.query.userTable.findFirst({
        where: eq(userTable.email, email),
      });

      if (existingUserWithEmail?.id) {
        // User exists but hasn't linked Google - let's link their account
        const [updatedUser] = await db
          .update(userTable)
          .set({
            googleAccountId,
            avatar: existingUserWithEmail.avatar || avatarUrl,
            emailVerified:
              existingUserWithEmail.emailVerified || (claims?.email_verified ? new Date() : null),
          })
          .where(eq(userTable.id, existingUserWithEmail.id))
          .returning();

        await createAndStoreSession(c, updatedUser.id, "google-oauth");

        // Clean up cookies
        deleteCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
        deleteCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);

        return c.json({ success: true });
      }

      // No existing user found - create a new one
      const ipAddress = getIP(c);
      const [user] = await db
        .insert(userTable)
        .values({
          googleAccountId,
          firstName: claims.given_name || claims.name || null,
          lastName: claims.family_name || null,
          avatar: avatarUrl,
          email,
          emailVerified: claims?.email_verified ? new Date() : null,
          signUpIpAddress: ipAddress,
        })
        .returning();

      await createAndStoreSession(c, user.id, "google-oauth");

      // Clean up cookies
      deleteCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
      deleteCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);

      return c.json({ success: true });
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      if (error instanceof Error && error.message.includes("disposable")) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: "An unexpected error occurred" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /google/callback - Handle Google OAuth callback (GET version for redirect)
// ----------------------------------------------------------------------------
auth.get(
  "/google/callback",
  rateLimitMiddleware(RATE_LIMITS.GOOGLE_SSO),
  async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const db = getDB(c.env.DB);

    if (!code || !state) {
      return c.redirect("/sign-in?error=missing_params");
    }

    try {
      if (!isGoogleSSOEnabled(c.env)) {
        return c.redirect("/sign-in?error=google_disabled");
      }

      const cookieState = getCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
      const cookieCodeVerifier = getCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);

      if (!cookieState || !cookieCodeVerifier) {
        return c.redirect("/sign-in?error=missing_cookies");
      }

      if (state !== cookieState) {
        return c.redirect("/sign-in?error=invalid_state");
      }

      let tokens;
      try {
        const google = getGoogleSSOClient(c.env);
        tokens = await google.validateAuthorizationCode(code, cookieCodeVerifier);
      } catch (error) {
        console.error("Google OAuth callback: Error validating authorization code", error);
        return c.redirect("/sign-in?error=invalid_code");
      }

      const claims = decodeIdToken(tokens.idToken()) as GoogleSSOResponse;

      const googleAccountId = claims.sub;
      const avatarUrl = claims.picture;
      const email = claims.email;

      try {
        await canSignUp(c.env, { email, skipDisposableEmailCheck: true });
      } catch {
        return c.redirect("/sign-in?error=email_not_allowed");
      }

      // First check if user exists with this Google account ID
      const existingUserWithGoogle = await db.query.userTable.findFirst({
        where: eq(userTable.googleAccountId, googleAccountId),
      });

      if (existingUserWithGoogle?.id) {
        await createAndStoreSession(c, existingUserWithGoogle.id, "google-oauth");

        // Clean up cookies
        deleteCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
        deleteCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);

        return c.redirect(REDIRECT_AFTER_SIGN_IN);
      }

      // Then check if user exists with this email
      const existingUserWithEmail = await db.query.userTable.findFirst({
        where: eq(userTable.email, email),
      });

      if (existingUserWithEmail?.id) {
        // User exists but hasn't linked Google - let's link their account
        const [updatedUser] = await db
          .update(userTable)
          .set({
            googleAccountId,
            avatar: existingUserWithEmail.avatar || avatarUrl,
            emailVerified:
              existingUserWithEmail.emailVerified || (claims?.email_verified ? new Date() : null),
          })
          .where(eq(userTable.id, existingUserWithEmail.id))
          .returning();

        await createAndStoreSession(c, updatedUser.id, "google-oauth");

        // Clean up cookies
        deleteCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
        deleteCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);

        return c.redirect(REDIRECT_AFTER_SIGN_IN);
      }

      // No existing user found - create a new one
      const ipAddress = getIP(c);
      const [user] = await db
        .insert(userTable)
        .values({
          googleAccountId,
          firstName: claims.given_name || claims.name || null,
          lastName: claims.family_name || null,
          avatar: avatarUrl,
          email,
          emailVerified: claims?.email_verified ? new Date() : null,
          signUpIpAddress: ipAddress,
        })
        .returning();

      await createAndStoreSession(c, user.id, "google-oauth");

      // Clean up cookies
      deleteCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
      deleteCookie(c, GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);

      return c.redirect(REDIRECT_AFTER_SIGN_IN);
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      return c.redirect("/sign-in?error=unknown");
    }
  }
);

export default auth;
