/**
 * WebAuthn Service - Passkey authentication
 * Adapted from _ref/src/utils/webauthn.ts
 */

import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { getDB } from "@/db";
import { passKeyCredentialTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isProd } from "@/server/utils/is-prod";
import { SITE_NAME, SITE_DOMAIN, SITE_URL } from "@/shared/constants";

// ============================================================================
// Types
// ============================================================================

export interface WebAuthnEnv {
  DB: D1Database;
  ENVIRONMENT?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const rpName = SITE_NAME;

function getRpID(env: WebAuthnEnv): string {
  return isProd(env) ? SITE_DOMAIN : "localhost";
}

function getOrigin(env: WebAuthnEnv): string {
  return isProd(env) ? SITE_URL : "http://localhost:3000";
}

// ============================================================================
// WebAuthn Functions
// ============================================================================

export async function generatePasskeyRegistrationOptions(
  env: WebAuthnEnv,
  userId: string,
  email: string
) {
  const db = getDB(env.DB);
  const rpID = getRpID(env);

  const existingCredentials = await db.query.passKeyCredentialTable.findMany({
    where: eq(passKeyCredentialTable.userId, userId),
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: email,
    attestationType: "none",
    excludeCredentials: existingCredentials.map(cred => ({
      id: cred.credentialId,
      type: "public-key",
      transports: cred.transports ? JSON.parse(cred.transports) as AuthenticatorTransport[] : undefined,
    })),
  });

  return options;
}

export async function verifyPasskeyRegistration(
  env: WebAuthnEnv,
  {
    userId,
    response,
    challenge,
    userAgent,
    ipAddress,
  }: {
    userId: string;
    response: RegistrationResponseJSON;
    challenge: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }
) {
  const rpID = getRpID(env);
  const origin = getOrigin(env);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey registration failed");
  }

  const { credential, aaguid } = verification.registrationInfo;

  const db = getDB(env.DB);
  await db.insert(passKeyCredentialTable).values({
    userId,
    credentialId: credential.id,
    credentialPublicKey: uint8ArrayToBase64Url(credential.publicKey),
    counter: 0,
    transports: response.response.transports ? JSON.stringify(response.response.transports) : null,
    aaguid: aaguid || null,
    userAgent,
    ipAddress,
  });

  return verification;
}

export async function generatePasskeyAuthenticationOptions(env: WebAuthnEnv) {
  const db = getDB(env.DB);
  const rpID = getRpID(env);

  const credentials = await db.query.passKeyCredentialTable.findMany();

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map(cred => ({
      id: cred.credentialId,
      type: "public-key",
      transports: cred.transports ? JSON.parse(cred.transports) as AuthenticatorTransport[] : undefined,
    })),
  });

  return options;
}

export async function verifyPasskeyAuthentication(
  env: WebAuthnEnv,
  response: AuthenticationResponseJSON,
  challenge: string
) {
  const credentialId = response.id;
  const rpID = getRpID(env);
  const origin = getOrigin(env);

  const db = getDB(env.DB);
  const credential = await db.query.passKeyCredentialTable.findFirst({
    where: eq(passKeyCredentialTable.credentialId, credentialId),
  });

  if (!credential) {
    throw new Error("Passkey not found");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: credential.credentialId,
      publicKey: base64UrlToUint8Array(credential.credentialPublicKey),
      counter: credential.counter,
      transports: credential.transports ? JSON.parse(credential.transports) : undefined,
    },
  });

  if (!verification.verified) {
    throw new Error("Passkey authentication failed");
  }

  // Update the counter
  await db
    .update(passKeyCredentialTable)
    .set({ counter: verification.authenticationInfo.newCounter })
    .where(eq(passKeyCredentialTable.credentialId, credential.credentialId));

  return {
    verification,
    credential,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function uint8ArrayToBase64Url(uint8Array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...uint8Array));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
