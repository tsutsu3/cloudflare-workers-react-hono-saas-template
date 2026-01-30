/**
 * Auth Service - Combined from auth.ts and kv-session.ts
 * This file handles all authentication and session management
 */

import { ROLES_ENUM, userTable, teamMembershipTable, SYSTEM_ROLES_ENUM, teamRoleTable, TEAM_PERMISSIONS } from "@/db/schema";
import { init } from "@paralleldrive/cuid2";
import { encodeHexLowerCase } from "@oslojs/encoding";
import ms from "ms";
import { getDB } from "@/db";
import { eq } from "drizzle-orm";
import { isProd } from "@/server/utils/is-prod";
import { SESSION_COOKIE_NAME, MAX_SESSIONS_PER_USER } from "@/shared/constants";
import { getInitials } from "@/server/utils/name-initials";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

// ============================================================================
// Types
// ============================================================================

export interface AuthEnv {
  DB: D1Database;
  NEXT_INC_CACHE_KV: KVNamespace;
  ENVIRONMENT?: string;
}

type KVSessionUser = Exclude<Awaited<ReturnType<typeof getUserFromDB>>, undefined>;

export interface KVSession {
  id: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  user: KVSessionUser & {
    initials?: string;
  };
  country?: string;
  city?: string;
  continent?: string;
  ip?: string | null;
  userAgent?: string | null;
  authenticationType?: "passkey" | "password" | "google-oauth";
  passkeyCredentialId?: string;
  teams?: {
    id: string;
    name: string;
    slug: string;
    role: {
      id: string;
      name: string;
      isSystemRole: boolean;
    };
    permissions: string[];
  }[];
  selectedTeam?: string;
  version?: number;
}

export type SessionValidationResult = KVSession;

export interface CreateKVSessionParams extends Omit<KVSession, "id" | "createdAt" | "expiresAt" | "selectedTeam"> {
  sessionId: string;
  expiresAt: Date;
  selectedTeam?: string;
}

interface CreateSessionParams {
  token: string;
  userId: string;
  authenticationType?: CreateKVSessionParams["authenticationType"];
  passkeyCredentialId?: string;
}

interface CreateSessionContext {
  env: AuthEnv;
  cf?: IncomingRequestCfProperties;
  ip: string | null;
  userAgent: string | null;
}

/**
 * IF YOU MAKE ANY CHANGES TO THE KVSESSION TYPE ABOVE, YOU NEED TO INCREMENT THIS VERSION.
 */
export const CURRENT_SESSION_VERSION = 4;

// ============================================================================
// Helper Functions
// ============================================================================

const SESSION_PREFIX = "session:";

function getSessionKey(userId: string, sessionId: string): string {
  return `${SESSION_PREFIX}${userId}:${sessionId}`;
}

function getKV(env: AuthEnv): KVNamespace {
  if (!env.NEXT_INC_CACHE_KV) {
    throw new Error("Can't connect to KV store");
  }
  return env.NEXT_INC_CACHE_KV;
}

const getSessionLength = () => {
  return ms("30d");
};

const createId = init({
  length: 32,
});

export function generateSessionToken(): string {
  return createId();
}

async function generateSessionId(token: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return encodeHexLowerCase(new Uint8Array(hashBuffer));
}

function encodeSessionCookie(userId: string, token: string): string {
  return `${userId}:${token}`;
}

function decodeSessionCookie(cookie: string): { userId: string; token: string } | null {
  const parts = cookie.split(':');
  if (parts.length !== 2) return null;
  return { userId: parts[0], token: parts[1] };
}

// ============================================================================
// Database Functions
// ============================================================================

export async function getUserFromDB(env: AuthEnv, userId: string) {
  const db = getDB(env.DB);
  return await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
    columns: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      emailVerified: true,
      avatar: true,
      createdAt: true,
      updatedAt: true,
      currentCredits: true,
      lastCreditRefreshAt: true,
    },
  });
}

export async function getUserTeamsWithPermissions(env: AuthEnv, userId: string) {
  const db = getDB(env.DB);

  const userTeamMemberships = await db.query.teamMembershipTable.findMany({
    where: eq(teamMembershipTable.userId, userId),
    with: {
      team: true,
    },
  });

  return Promise.all(
    userTeamMemberships.map(async (membership) => {
      let roleName = '';
      let permissions: string[] = [];

      if (membership.isSystemRole) {
        roleName = membership.roleId;

        if (membership.roleId === SYSTEM_ROLES_ENUM.OWNER || membership.roleId === SYSTEM_ROLES_ENUM.ADMIN) {
          permissions = Object.values(TEAM_PERMISSIONS);
        } else if (membership.roleId === SYSTEM_ROLES_ENUM.MEMBER) {
          permissions = [
            TEAM_PERMISSIONS.ACCESS_DASHBOARD,
            TEAM_PERMISSIONS.CREATE_COMPONENTS,
            TEAM_PERMISSIONS.EDIT_COMPONENTS,
          ];
        } else if (membership.roleId === SYSTEM_ROLES_ENUM.GUEST) {
          permissions = [
            TEAM_PERMISSIONS.ACCESS_DASHBOARD,
          ];
        }
      } else {
        const role = await db.query.teamRoleTable.findFirst({
          where: eq(teamRoleTable.id, membership.roleId),
        });

        if (role) {
          roleName = role.name;
          permissions = role.permissions as string[];
        }
      }

      return {
        id: membership.teamId,
        name: membership.team.name,
        slug: membership.team.slug,
        role: {
          id: membership.roleId,
          name: roleName,
          isSystemRole: !!membership.isSystemRole,
        },
        permissions,
      };
    })
  );
}

// ============================================================================
// KV Session Functions (from kv-session.ts)
// ============================================================================

export async function getAllSessionIdsOfUser(env: AuthEnv, userId: string) {
  const kv = getKV(env);

  const sessions = await kv.list({ prefix: getSessionKey(userId, "") });

  return sessions.keys.map((session) => ({
    key: session.name,
    absoluteExpiration: session.expiration ? new Date(session.expiration * 1000) : undefined
  }));
}

export async function createKVSession(
  ctx: CreateSessionContext,
  params: CreateKVSessionParams
): Promise<KVSession> {
  const {
    sessionId,
    userId,
    expiresAt,
    user,
    authenticationType,
    passkeyCredentialId,
    teams,
    selectedTeam
  } = params;

  const kv = getKV(ctx.env);

  const session: KVSession = {
    id: sessionId,
    userId,
    expiresAt: expiresAt.getTime(),
    createdAt: Date.now(),
    country: ctx.cf?.country as string | undefined,
    city: ctx.cf?.city as string | undefined,
    continent: ctx.cf?.continent as string | undefined,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    user,
    authenticationType,
    passkeyCredentialId,
    teams,
    selectedTeam,
    version: CURRENT_SESSION_VERSION
  };

  // Check if user has reached the session limit
  const existingSessions = await getAllSessionIdsOfUser(ctx.env, userId);

  if (existingSessions.length >= MAX_SESSIONS_PER_USER) {
    const sessionsToDelete = existingSessions.length - MAX_SESSIONS_PER_USER + 1;

    const sortedSessions = [...existingSessions].sort((a, b) => {
      if (!a.absoluteExpiration) return -1;
      if (!b.absoluteExpiration) return 1;
      return a.absoluteExpiration.getTime() - b.absoluteExpiration.getTime();
    });

    for (let i = 0; i < sessionsToDelete; i++) {
      const sessionKey = sortedSessions[i]?.key;
      if (!sessionKey) continue;

      const oldSessionId = sessionKey.split(':')[2];
      if (!oldSessionId) continue;

      await deleteKVSession(ctx.env, oldSessionId, userId);
    }
  }

  await kv.put(
    getSessionKey(userId, sessionId),
    JSON.stringify(session),
    {
      expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    }
  );

  return session;
}

export async function getKVSession(env: AuthEnv, sessionId: string, userId: string): Promise<KVSession | null> {
  const kv = getKV(env);

  const sessionStr = await kv.get(getSessionKey(userId, sessionId));
  if (!sessionStr) return null;

  const session = JSON.parse(sessionStr) as KVSession;

  if (session?.user?.createdAt) {
    session.user.createdAt = new Date(session.user.createdAt);
  }

  if (session?.user?.updatedAt) {
    session.user.updatedAt = new Date(session.user.updatedAt);
  }

  if (session?.user?.lastCreditRefreshAt) {
    session.user.lastCreditRefreshAt = new Date(session.user.lastCreditRefreshAt);
  }

  if (session?.user?.emailVerified) {
    session.user.emailVerified = new Date(session.user.emailVerified);
  }

  return session;
}

export async function updateKVSession(
  env: AuthEnv,
  sessionId: string,
  userId: string,
  expiresAt: Date,
  userData?: KVSessionUser,
  teams?: KVSession['teams']
): Promise<KVSession | null> {
  const session = await getKVSession(env, sessionId, userId);
  if (!session) return null;

  const updatedUser = userData ?? await getUserFromDB(env, userId);

  if (!updatedUser) {
    throw new Error("User not found");
  }

  const teamsWithPermissions = teams ?? await getUserTeamsWithPermissions(env, userId);

  const updatedSession: KVSession = {
    ...session,
    version: CURRENT_SESSION_VERSION,
    expiresAt: expiresAt.getTime(),
    user: updatedUser,
    teams: teamsWithPermissions
  };

  const kv = getKV(env);

  await kv.put(
    getSessionKey(userId, sessionId),
    JSON.stringify(updatedSession),
    {
      expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    }
  );

  return updatedSession;
}

export async function deleteKVSession(env: AuthEnv, sessionId: string, userId: string): Promise<void> {
  const kv = getKV(env);
  await kv.delete(getSessionKey(userId, sessionId));
}

export async function updateKVSessionSelectedTeam(
  env: AuthEnv,
  sessionId: string,
  userId: string,
  selectedTeam: string | undefined
): Promise<KVSession | null> {
  const session = await getKVSession(env, sessionId, userId);
  if (!session) return null;

  const updatedSession: KVSession = {
    ...session,
    selectedTeam,
  };

  const kv = getKV(env);

  const remainingTtl = Math.floor((session.expiresAt - Date.now()) / 1000);

  if (remainingTtl > 0) {
    await kv.put(
      getSessionKey(userId, sessionId),
      JSON.stringify(updatedSession),
      {
        expirationTtl: remainingTtl
      }
    );
  } else {
    return null;
  }

  return updatedSession;
}

export async function updateAllSessionsOfUser(env: AuthEnv, userId: string) {
  const sessions = await getAllSessionIdsOfUser(env, userId);

  const newUserData = await getUserFromDB(env, userId);

  if (!newUserData) return;

  const teamsWithPermissions = await getUserTeamsWithPermissions(env, userId);

  for (const sessionObj of sessions) {
    const sessionId = sessionObj.key.split(':')[2];
    if (!sessionId) continue;

    if (sessionObj.absoluteExpiration && sessionObj.absoluteExpiration.getTime() > Date.now()) {
      await updateKVSession(env, sessionId, userId, sessionObj.absoluteExpiration, newUserData, teamsWithPermissions);
    }
  }
}

// ============================================================================
// Session Management Functions (from auth.ts)
// ============================================================================

export async function createSession(
  ctx: CreateSessionContext,
  params: CreateSessionParams
): Promise<KVSession> {
  const { token, userId, authenticationType, passkeyCredentialId } = params;

  const sessionId = await generateSessionId(token);
  const expiresAt = new Date(Date.now() + getSessionLength());

  const user = await getUserFromDB(ctx.env, userId);

  if (!user) {
    throw new Error("User not found");
  }

  const teamsWithPermissions = await getUserTeamsWithPermissions(ctx.env, userId);

  return createKVSession(ctx, {
    sessionId,
    userId,
    expiresAt,
    user,
    authenticationType,
    passkeyCredentialId,
    teams: teamsWithPermissions,
    selectedTeam: teamsWithPermissions?.length > 0 ? teamsWithPermissions?.[0]?.id : undefined
  });
}

export async function createAndStoreSession(
  c: Context<{ Bindings: AuthEnv }>,
  userId: string,
  authenticationType?: CreateKVSessionParams["authenticationType"],
  passkeyCredentialId?: string
) {
  const sessionToken = generateSessionToken();

  const ctx: CreateSessionContext = {
    env: c.env,
    cf: c.req.raw.cf as IncomingRequestCfProperties | undefined,
    ip: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null,
    userAgent: c.req.header('user-agent') || null,
  };

  const session = await createSession(ctx, {
    token: sessionToken,
    userId,
    authenticationType,
    passkeyCredentialId
  });

  setSessionTokenCookie(c, sessionToken, userId, new Date(session.expiresAt));

  return session;
}

export async function validateSessionToken(
  env: AuthEnv,
  token: string,
  userId: string
): Promise<SessionValidationResult | null> {
  const sessionId = await generateSessionId(token);

  const session = await getKVSession(env, sessionId, userId);

  if (!session) return null;

  if (Date.now() >= session.expiresAt) {
    await deleteKVSession(env, sessionId, userId);
    return null;
  }

  if (!session.version || session.version !== CURRENT_SESSION_VERSION) {
    const updatedSession = await updateKVSession(env, sessionId, userId, new Date(session.expiresAt));

    if (!updatedSession) {
      return null;
    }

    updatedSession.user.initials = getInitials(`${updatedSession.user.firstName} ${updatedSession.user.lastName}`);

    return updatedSession;
  }

  session.user.initials = getInitials(`${session.user.firstName} ${session.user.lastName}`);

  return session;
}

export async function invalidateSession(env: AuthEnv, sessionId: string, userId: string): Promise<void> {
  await deleteKVSession(env, sessionId, userId);
}

// ============================================================================
// Cookie Functions (Hono-based)
// ============================================================================

export function setSessionTokenCookie(
  c: Context<{ Bindings: AuthEnv }>,
  token: string,
  userId: string,
  expiresAt: Date
): void {
  setCookie(c, SESSION_COOKIE_NAME, encodeSessionCookie(userId, token), {
    httpOnly: true,
    sameSite: isProd(c.env) ? "Strict" : "Lax",
    secure: isProd(c.env),
    expires: expiresAt,
    path: "/",
  });
}

export function deleteSessionTokenCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
  });
}

export async function getSessionFromCookie(
  c: Context<{ Bindings: AuthEnv }>
): Promise<SessionValidationResult | null> {
  const sessionCookie = getCookie(c, SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return null;
  }

  const decoded = decodeSessionCookie(sessionCookie);

  if (!decoded || !decoded.token || !decoded.userId) {
    return null;
  }

  return validateSessionToken(c.env, decoded.token, decoded.userId);
}

// ============================================================================
// Authorization Helpers
// ============================================================================

export async function requireAuth(
  c: Context<{ Bindings: AuthEnv }>
): Promise<SessionValidationResult> {
  const session = await getSessionFromCookie(c);

  if (!session) {
    throw new Error("Not authenticated");
  }

  return session;
}

export async function requireVerifiedEmail(
  c: Context<{ Bindings: AuthEnv }>
): Promise<SessionValidationResult> {
  const session = await requireAuth(c);

  if (!session.user.emailVerified) {
    throw new Error("Please verify your email first");
  }

  return session;
}

export async function requireAdmin(
  c: Context<{ Bindings: AuthEnv }>
): Promise<SessionValidationResult> {
  const session = await requireAuth(c);

  if (session.user.role !== ROLES_ENUM.ADMIN) {
    throw new Error("Admin access required");
  }

  return session;
}

// ============================================================================
// Email Validation
// ============================================================================

interface DisposableEmailResponse {
  disposable: string;
}

interface MailcheckResponse {
  status: number;
  email: string;
  domain: string;
  mx: boolean;
  disposable: boolean;
  public_domain: boolean;
  relay_domain: boolean;
  alias: boolean;
  role_account: boolean;
  did_you_mean: string | null;
}

type ValidatorResult = {
  success: boolean;
  isDisposable: boolean;
};

async function checkWithDebounce(email: string): Promise<ValidatorResult> {
  try {
    const response = await fetch(`https://disposable.debounce.io/?email=${encodeURIComponent(email)}`);

    if (!response.ok) {
      console.error("Debounce.io API error:", response.status);
      return { success: false, isDisposable: false };
    }

    const data = await response.json() as DisposableEmailResponse;

    return { success: true, isDisposable: data.disposable === "true" };
  } catch (error) {
    console.error("Failed to check disposable email with debounce.io:", error);
    return { success: false, isDisposable: false };
  }
}

async function checkWithMailcheck(email: string): Promise<ValidatorResult> {
  try {
    const response = await fetch(`https://api.mailcheck.ai/email/${encodeURIComponent(email)}`);

    if (!response.ok) {
      console.error("Mailcheck.ai API error:", response.status);
      return { success: false, isDisposable: false };
    }

    const data = await response.json() as MailcheckResponse;
    return { success: true, isDisposable: data.disposable };
  } catch (error) {
    console.error("Failed to check disposable email with mailcheck.ai:", error);
    return { success: false, isDisposable: false };
  }
}

export async function canSignUp(
  env: AuthEnv,
  {
    email,
    skipDisposableEmailCheck = false
  }: {
    email: string;
    skipDisposableEmailCheck?: boolean;
  }
): Promise<void> {
  if (!isProd(env)) {
    return;
  }

  if (skipDisposableEmailCheck) {
    return;
  }

  const validators = [
    checkWithDebounce,
    checkWithMailcheck,
  ];

  for (const validator of validators) {
    const result = await validator(email);

    if (!result.success) {
      continue;
    }

    if (result.isDisposable) {
      throw new Error("Disposable email addresses are not allowed");
    }

    return;
  }

  throw new Error("Unable to verify email address at this time. Please try again later.");
}
