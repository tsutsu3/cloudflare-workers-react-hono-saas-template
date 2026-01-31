/**
 * Teams Routes
 * Converted from ZSA Server Actions to Hono API routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, count, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

import { getDB } from "@/db";
import {
  teamTable,
  teamMembershipTable,
  teamRoleTable,
  teamInvitationTable,
  userTable,
  SYSTEM_ROLES_ENUM,
  TEAM_PERMISSIONS,
} from "@/db/schema";
import {
  requireVerifiedEmail,
  getSessionFromCookie,
  updateAllSessionsOfUser,
  canSignUp,
  type AuthEnv,
} from "@/server/services/auth-service";
import { sendTeamInvitationEmail, type EmailEnv } from "@/server/services/email-service";
import { requireTeamPermission } from "@/server/utils/team-auth";
import { generateSlug } from "@/server/utils/slugify";
import { rateLimitMiddleware } from "@/server/middleware/rate-limit";
import {
  MAX_TEAMS_CREATED_PER_USER,
  MAX_TEAMS_JOINED_PER_USER,
} from "@/shared/constants";
import { hasTeamMembership, hasTeamPermission } from "@/server/utils/team-auth";

// ============================================================================
// Types
// ============================================================================

export interface TeamsRoutesEnv extends AuthEnv, EmailEnv {}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve a team by slug or ID
 * Returns the team if found, null otherwise
 */
async function resolveTeam(db: ReturnType<typeof getDB>, slugOrId: string) {
  // First try to find by slug
  let team = await db.query.teamTable.findFirst({
    where: eq(teamTable.slug, slugOrId),
  });

  // If not found by slug, try by ID
  if (!team) {
    team = await db.query.teamTable.findFirst({
      where: eq(teamTable.id, slugOrId),
    });
  }

  return team;
}

// ============================================================================
// Schemas
// ============================================================================

const createTeamSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().max(1000, "Description is too long").optional(),
  avatarUrl: z.string().url().optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email("Invalid email").max(255, "Email is too long"),
  roleId: z.string().min(1, "Role is required"),
  isSystemRole: z.boolean().optional().default(true),
});

// Note: updateMemberRoleSchema would be used for PATCH /:teamId/members/:userId endpoint (not implemented yet)

const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
});

// ============================================================================
// Rate Limit Options
// ============================================================================

const RATE_LIMITS = {
  TEAMS: { limit: 30, windowInSeconds: 60, identifier: "teams:general" },
  TEAM_INVITE: { limit: 10, windowInSeconds: 60, identifier: "teams:invite" },
};

// ============================================================================
// Teams Routes
// ============================================================================

const teams = new Hono<{ Bindings: TeamsRoutesEnv }>();

// ----------------------------------------------------------------------------
// GET / - List user's teams
// ----------------------------------------------------------------------------
teams.get(
  "/",
  rateLimitMiddleware(RATE_LIMITS.TEAMS),
  async (c) => {
    try {
      const session = await requireVerifiedEmail(c);
      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      const db = getDB(c.env.DB);

      const userTeams = await db.query.teamMembershipTable.findMany({
        where: eq(teamMembershipTable.userId, session.user.id),
        with: {
          team: true,
        },
      });

      return c.json({
        teams: userTeams.map(membership => membership.team),
      });
    } catch (error) {
      console.error("Get teams error:", error);
      return c.json({ error: "Failed to get teams" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST / - Create new team
// ----------------------------------------------------------------------------
teams.post(
  "/",
  rateLimitMiddleware(RATE_LIMITS.TEAMS),
  zValidator("json", createTeamSchema),
  async (c) => {
    const input = c.req.valid("json");

    try {
      const session = await requireVerifiedEmail(c);
      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      const userId = session.user.id;
      const db = getDB(c.env.DB);

      // Check if user has reached their team creation limit
      const ownedTeamsCount = await db
        .select({ value: count() })
        .from(teamMembershipTable)
        .where(
          and(
            eq(teamMembershipTable.userId, userId),
            eq(teamMembershipTable.roleId, SYSTEM_ROLES_ENUM.OWNER),
            eq(teamMembershipTable.isSystemRole, 1)
          )
        );

      const teamsOwned = ownedTeamsCount[0]?.value || 0;

      if (teamsOwned >= MAX_TEAMS_CREATED_PER_USER) {
        return c.json(
          { error: `You have reached the limit of ${MAX_TEAMS_CREATED_PER_USER} teams you can create.` },
          403
        );
      }

      // Generate unique slug for the team
      let slug = generateSlug(input.name);
      let slugIsUnique = false;
      let attempts = 0;

      while (!slugIsUnique && attempts < 5) {
        const existingTeam = await db.query.teamTable.findFirst({
          where: eq(teamTable.slug, slug),
        });

        if (!existingTeam) {
          slugIsUnique = true;
        } else {
          slug = `${generateSlug(input.name)}-${createId().substring(0, 4)}`;
          attempts++;
        }
      }

      if (!slugIsUnique) {
        return c.json({ error: "Could not generate a unique slug for the team" }, 500);
      }

      // Insert the team
      const newTeam = await db
        .insert(teamTable)
        .values({
          name: input.name,
          slug,
          description: input.description,
          avatarUrl: input.avatarUrl,
          creditBalance: 0,
        })
        .returning();

      const team = newTeam?.[0];

      if (!team) {
        return c.json({ error: "Could not create team" }, 500);
      }

      const teamId = team.id;

      // Add the creator as an owner
      await db.insert(teamMembershipTable).values({
        teamId,
        userId,
        roleId: SYSTEM_ROLES_ENUM.OWNER,
        isSystemRole: 1,
        invitedBy: userId,
        invitedAt: new Date(),
        joinedAt: new Date(),
        isActive: 1,
      });

      // Create default custom role for the team
      await db.insert(teamRoleTable).values({
        teamId,
        name: "Editor",
        description: "Can edit team content",
        permissions: [
          TEAM_PERMISSIONS.ACCESS_DASHBOARD,
          TEAM_PERMISSIONS.CREATE_COMPONENTS,
          TEAM_PERMISSIONS.EDIT_COMPONENTS,
        ],
        isEditable: 1,
      });

      // Update the user's session to include the new team
      await updateAllSessionsOfUser(c.env, userId);

      return c.json({
        success: true,
        data: {
          teamId,
          name: input.name,
          slug,
        },
      });
    } catch (error) {
      console.error("Create team error:", error);
      return c.json({ error: "Failed to create team" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /:teamIdOrSlug - Get team details (accepts both team ID and slug)
// ----------------------------------------------------------------------------
teams.get(
  "/:teamIdOrSlug",
  rateLimitMiddleware(RATE_LIMITS.TEAMS),
  async (c) => {
    const teamIdOrSlug = c.req.param("teamIdOrSlug");

    try {
      const db = getDB(c.env.DB);

      // First resolve the team by slug or ID
      const team = await resolveTeam(db, teamIdOrSlug);

      if (!team) {
        return c.json({ error: "Team not found" }, 404);
      }

      const teamId = team.id;

      // Check if user has access to the team
      const { hasAccess, session } = await hasTeamMembership(c, teamId);

      if (!hasAccess || !session) {
        return c.json({ error: `You don't have permission to access team "${team.name}"` }, 403);
      }

      // Get user's role and permissions for this team
      const userTeam = session.teams?.find(t => t.id === teamId);
      const userRole = userTeam?.role.name || "Member";

      // Check specific permissions
      const canInviteMembers = await hasTeamPermission(c, teamId, TEAM_PERMISSIONS.INVITE_MEMBERS);
      const canRemoveMembers = await hasTeamPermission(c, teamId, TEAM_PERMISSIONS.REMOVE_MEMBERS);
      const canEditTeam = await hasTeamPermission(c, teamId, TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS);

      // Get team members with user details
      const members = await db.query.teamMembershipTable.findMany({
        where: eq(teamMembershipTable.teamId, teamId),
        with: {
          user: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
        },
      });

      // Get all team roles for this team
      const teamRoles = await db.query.teamRoleTable.findMany({
        where: eq(teamRoleTable.teamId, teamId),
      });

      const roleMap = new Map(teamRoles.map(role => [role.id, role.name]));

      const formattedMembers = members.map(member => {
        let roleName = "Unknown";

        if (member.isSystemRole) {
          roleName = member.roleId.charAt(0).toUpperCase() + member.roleId.slice(1);
        } else {
          roleName = roleMap.get(member.roleId) || "Custom Role";
        }

        return {
          id: member.id,
          userId: member.userId,
          roleId: member.roleId,
          roleName,
          isSystemRole: Boolean(member.isSystemRole),
          isActive: Boolean(member.isActive),
          joinedAt: member.joinedAt ? new Date(member.joinedAt).toISOString() : null,
          user: member.user,
        };
      });

      return c.json({
        team,
        members: formattedMembers,
        permissions: {
          canInviteMembers,
          canRemoveMembers,
          canEditTeam,
        },
        userRole,
      });
    } catch (error) {
      console.error("Get team error:", error);
      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          return c.json({ error: error.message }, 403);
        }
        if (error.message.includes("authenticated")) {
          return c.json({ error: error.message }, 401);
        }
      }
      return c.json({ error: "Failed to get team" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /:teamId/members - Get team members
// ----------------------------------------------------------------------------
teams.get(
  "/:teamId/members",
  rateLimitMiddleware(RATE_LIMITS.TEAMS),
  async (c) => {
    const teamId = c.req.param("teamId");

    try {
      await requireTeamPermission(c, teamId, TEAM_PERMISSIONS.ACCESS_DASHBOARD);

      const db = getDB(c.env.DB);

      const members = await db.query.teamMembershipTable.findMany({
        where: eq(teamMembershipTable.teamId, teamId),
        with: {
          user: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
        },
      });

      // Get all team roles for this team
      const teamRoles = await db.query.teamRoleTable.findMany({
        where: eq(teamRoleTable.teamId, teamId),
      });

      const roleMap = new Map(teamRoles.map(role => [role.id, role.name]));

      const formattedMembers = members.map(member => {
        let roleName = "Unknown";

        if (member.isSystemRole) {
          roleName = member.roleId.charAt(0).toUpperCase() + member.roleId.slice(1);
        } else {
          roleName = roleMap.get(member.roleId) || "Custom Role";
        }

        return {
          id: member.id,
          userId: member.userId,
          roleId: member.roleId,
          roleName,
          isSystemRole: Boolean(member.isSystemRole),
          isActive: Boolean(member.isActive),
          joinedAt: member.joinedAt ? new Date(member.joinedAt) : null,
          user: member.user,
        };
      });

      return c.json({ members: formattedMembers });
    } catch (error) {
      console.error("Get team members error:", error);
      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          return c.json({ error: error.message }, 403);
        }
        if (error.message.includes("authenticated")) {
          return c.json({ error: error.message }, 401);
        }
      }
      return c.json({ error: "Failed to get team members" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /:teamId/invite - Invite user to team
// ----------------------------------------------------------------------------
teams.post(
  "/:teamId/invite",
  rateLimitMiddleware(RATE_LIMITS.TEAM_INVITE),
  zValidator("json", inviteUserSchema),
  async (c) => {
    const teamId = c.req.param("teamId");
    const input = c.req.valid("json");

    try {
      const session = await requireTeamPermission(c, teamId, TEAM_PERMISSIONS.INVITE_MEMBERS);

      // Validate email
      try {
        await canSignUp(c.env, { email: input.email });
      } catch {
        return c.json({ error: "Invalid or disposable email address" }, 400);
      }

      const db = getDB(c.env.DB);

      // Get team name for email
      const team = await db.query.teamTable.findFirst({
        where: eq(teamTable.id, teamId),
      });

      if (!team) {
        return c.json({ error: "Team not found" }, 404);
      }

      const teamName = team.name || "Team";

      // Get inviter's name
      const inviterName = `${session.user.firstName || ""} ${session.user.lastName || ""}`.trim() || session.user.email || "A team member";

      // Check if user is already a member
      const existingUser = await db.query.userTable.findFirst({
        where: eq(userTable.email, input.email),
      });

      if (existingUser) {
        const existingMembership = await db.query.teamMembershipTable.findFirst({
          where: and(
            eq(teamMembershipTable.teamId, teamId),
            eq(teamMembershipTable.userId, existingUser.id)
          ),
        });

        if (existingMembership) {
          return c.json({ error: "User is already a member of this team" }, 409);
        }

        // Check if user has reached their team joining limit
        const teamsCountResult = await db
          .select({ value: count() })
          .from(teamMembershipTable)
          .where(eq(teamMembershipTable.userId, existingUser.id));

        const teamsJoined = teamsCountResult[0]?.value || 0;

        if (teamsJoined >= MAX_TEAMS_JOINED_PER_USER) {
          return c.json(
            { error: `This user has reached the limit of ${MAX_TEAMS_JOINED_PER_USER} teams they can join.` },
            403
          );
        }

        // User exists but is not a member, add them directly
        await db.insert(teamMembershipTable).values({
          teamId,
          userId: existingUser.id,
          roleId: input.roleId,
          isSystemRole: input.isSystemRole ? 1 : 0,
          invitedBy: session.user.id,
          invitedAt: new Date(),
          joinedAt: new Date(),
          isActive: 1,
        });

        // Update the user's session
        await updateAllSessionsOfUser(c.env, existingUser.id);

        return c.json({
          success: true,
          userJoined: true,
          userId: existingUser.id,
        });
      }

      // User doesn't exist, create an invitation
      const token = createId();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Check if there's an existing invitation
      const existingInvitation = await db.query.teamInvitationTable.findFirst({
        where: and(
          eq(teamInvitationTable.teamId, teamId),
          eq(teamInvitationTable.email, input.email)
        ),
      });

      if (existingInvitation) {
        // Update the existing invitation
        await db
          .update(teamInvitationTable)
          .set({
            roleId: input.roleId,
            isSystemRole: input.isSystemRole ? 1 : 0,
            token,
            expiresAt,
            invitedBy: session.user.id,
            acceptedAt: null,
            acceptedBy: null,
            updatedAt: new Date(),
          })
          .where(eq(teamInvitationTable.id, existingInvitation.id));

        // Send invitation email
        await sendTeamInvitationEmail(c.env, {
          email: input.email,
          invitationToken: token,
          teamName,
          inviterName,
        });

        return c.json({
          success: true,
          invitationSent: true,
          invitationId: existingInvitation.id,
        });
      }

      const newInvitation = await db
        .insert(teamInvitationTable)
        .values({
          teamId,
          email: input.email,
          roleId: input.roleId,
          isSystemRole: input.isSystemRole ? 1 : 0,
          token,
          invitedBy: session.user.id,
          expiresAt,
        })
        .returning();

      const invitation = newInvitation?.[0];

      if (!invitation) {
        return c.json({ error: "Could not create invitation" }, 500);
      }

      // Send invitation email
      await sendTeamInvitationEmail(c.env, {
        email: input.email,
        invitationToken: token,
        teamName,
        inviterName,
      });

      return c.json({
        success: true,
        invitationSent: true,
        invitationId: invitation.id,
      });
    } catch (error) {
      console.error("Invite user error:", error);
      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          return c.json({ error: error.message }, 403);
        }
        if (error.message.includes("authenticated")) {
          return c.json({ error: error.message }, 401);
        }
      }
      return c.json({ error: "Failed to invite user" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// DELETE /:teamId/members/:userId - Remove member from team
// ----------------------------------------------------------------------------
teams.delete(
  "/:teamId/members/:userId",
  rateLimitMiddleware(RATE_LIMITS.TEAMS),
  async (c) => {
    const teamId = c.req.param("teamId");
    const userId = c.req.param("userId");

    try {
      await requireTeamPermission(c, teamId, TEAM_PERMISSIONS.REMOVE_MEMBERS);

      const db = getDB(c.env.DB);

      // Verify membership exists
      const membership = await db.query.teamMembershipTable.findFirst({
        where: and(
          eq(teamMembershipTable.teamId, teamId),
          eq(teamMembershipTable.userId, userId)
        ),
      });

      if (!membership) {
        return c.json({ error: "Team membership not found" }, 404);
      }

      // Don't allow removing an owner
      if (membership.roleId === SYSTEM_ROLES_ENUM.OWNER && membership.isSystemRole) {
        return c.json({ error: "Cannot remove the team owner" }, 403);
      }

      // Delete the membership
      await db
        .delete(teamMembershipTable)
        .where(
          and(
            eq(teamMembershipTable.teamId, teamId),
            eq(teamMembershipTable.userId, userId)
          )
        );

      // Update the user's session
      await updateAllSessionsOfUser(c.env, userId);

      return c.json({ success: true });
    } catch (error) {
      console.error("Remove team member error:", error);
      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          return c.json({ error: error.message }, 403);
        }
        if (error.message.includes("authenticated")) {
          return c.json({ error: error.message }, 401);
        }
      }
      return c.json({ error: "Failed to remove team member" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// POST /invitations/accept - Accept team invitation
// ----------------------------------------------------------------------------
teams.post(
  "/invitations/accept",
  rateLimitMiddleware(RATE_LIMITS.TEAMS),
  zValidator("json", acceptInvitationSchema),
  async (c) => {
    const { token } = c.req.valid("json");

    try {
      const session = await getSessionFromCookie(c);

      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      const db = getDB(c.env.DB);

      // Find the invitation by token
      const invitation = await db.query.teamInvitationTable.findFirst({
        where: eq(teamInvitationTable.token, token),
      });

      if (!invitation) {
        return c.json({ error: "Invitation not found" }, 404);
      }

      // Check if invitation has expired
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        return c.json({ error: "Invitation has expired" }, 400);
      }

      // Check if invitation was already accepted
      if (invitation.acceptedAt) {
        return c.json({ error: "Invitation has already been accepted" }, 409);
      }

      // Check if user's email matches the invitation email
      if (session.user.email !== invitation.email) {
        return c.json({ error: "This invitation is for a different email address" }, 403);
      }

      // Check if user is already a member
      const existingMembership = await db.query.teamMembershipTable.findFirst({
        where: and(
          eq(teamMembershipTable.teamId, invitation.teamId),
          eq(teamMembershipTable.userId, session.user.id)
        ),
      });

      if (existingMembership) {
        // Mark invitation as accepted
        await db
          .update(teamInvitationTable)
          .set({
            acceptedAt: new Date(),
            acceptedBy: session.user.id,
            updatedAt: new Date(),
          })
          .where(eq(teamInvitationTable.id, invitation.id));

        return c.json({ error: "You are already a member of this team" }, 409);
      }

      // Check if user has reached their team joining limit
      const teamsCountResult = await db
        .select({ value: count() })
        .from(teamMembershipTable)
        .where(eq(teamMembershipTable.userId, session.user.id));

      const teamsJoined = teamsCountResult[0]?.value || 0;

      if (teamsJoined >= MAX_TEAMS_JOINED_PER_USER) {
        return c.json(
          { error: `You have reached the limit of ${MAX_TEAMS_JOINED_PER_USER} teams you can join.` },
          403
        );
      }

      // Add user to the team
      await db.insert(teamMembershipTable).values({
        teamId: invitation.teamId,
        userId: session.user.id,
        roleId: invitation.roleId,
        isSystemRole: Number(invitation.isSystemRole),
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt ? new Date(invitation.createdAt) : new Date(),
        joinedAt: new Date(),
        isActive: 1,
      });

      // Mark invitation as accepted
      await db
        .update(teamInvitationTable)
        .set({
          acceptedAt: new Date(),
          acceptedBy: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(teamInvitationTable.id, invitation.id));

      // Update the user's session
      await updateAllSessionsOfUser(c.env, session.user.id);

      return c.json({
        success: true,
        teamId: invitation.teamId,
      });
    } catch (error) {
      console.error("Accept invitation error:", error);
      return c.json({ error: "Failed to accept invitation" }, 500);
    }
  }
);

// ----------------------------------------------------------------------------
// GET /invitations/pending - Get pending invitations for current user
// ----------------------------------------------------------------------------
teams.get(
  "/invitations/pending",
  rateLimitMiddleware(RATE_LIMITS.TEAMS),
  async (c) => {
    try {
      const session = await getSessionFromCookie(c);

      if (!session) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      const db = getDB(c.env.DB);

      // Get invitations for the user's email that have not been accepted
      // Note: session.user.email is nullable, so we need to handle that case
      if (!session.user.email) {
        return c.json({ invitations: [] });
      }

      const invitations = await db.query.teamInvitationTable.findMany({
        where: and(
          eq(teamInvitationTable.email, session.user.email),
          isNull(teamInvitationTable.acceptedAt)
        ),
        with: {
          team: {
            columns: {
              id: true,
              name: true,
              slug: true,
              avatarUrl: true,
            },
          },
          invitedByUser: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
        },
      });

      const formattedInvitations = invitations.map(invitation => ({
        id: invitation.id,
        token: invitation.token,
        teamId: invitation.teamId,
        team: invitation.team,
        roleId: invitation.roleId,
        isSystemRole: Boolean(invitation.isSystemRole),
        createdAt: new Date(invitation.createdAt),
        expiresAt: invitation.expiresAt ? new Date(invitation.expiresAt) : null,
        invitedBy: invitation.invitedByUser,
      }));

      return c.json({ invitations: formattedInvitations });
    } catch (error) {
      console.error("Get pending invitations error:", error);
      return c.json({ error: "Failed to get pending invitations" }, 500);
    }
  }
);

export default teams;
