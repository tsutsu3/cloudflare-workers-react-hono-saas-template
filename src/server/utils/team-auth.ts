/**
 * Team Authorization Utilities
 * Adapted from _ref/src/utils/team-auth.ts
 */

import { requireVerifiedEmail, type AuthEnv, type KVSession } from "@/server/services/auth-service";
import type { Context } from "hono";

/**
 * Check if the user has team membership
 */
export async function hasTeamMembership<E extends AuthEnv>(
  c: Context<{ Bindings: E }>,
  teamId: string
): Promise<{ hasAccess: boolean; session?: KVSession }> {
  try {
    const session = await requireVerifiedEmail(c);

    const isMember = session.teams?.some(team => team.id === teamId) || false;

    return {
      hasAccess: isMember,
      session: isMember ? session : undefined
    };
  } catch {
    return { hasAccess: false };
  }
}

/**
 * Check if the user has a specific permission in a team
 */
export async function hasTeamPermission<E extends AuthEnv>(
  c: Context<{ Bindings: E }>,
  teamId: string,
  permission: string
): Promise<boolean> {
  try {
    const session = await requireVerifiedEmail(c);

    const team = session.teams?.find(t => t.id === teamId);

    if (!team) {
      return false;
    }

    // Check if the permission is in the user's permissions for this team
    return team.permissions.includes(permission);
  } catch {
    return false;
  }
}

/**
 * Require team permission (throws if doesn't have permission)
 */
export async function requireTeamPermission<E extends AuthEnv>(
  c: Context<{ Bindings: E }>,
  teamId: string,
  permission: string
): Promise<KVSession> {
  const session = await requireVerifiedEmail(c);

  const hasPermission = await hasTeamPermission(c, teamId, permission);

  if (!hasPermission) {
    throw new Error("You don't have the required permission in this team");
  }

  return session;
}
