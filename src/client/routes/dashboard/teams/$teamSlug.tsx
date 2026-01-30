import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/client/lib/api-client';
import { PageHeader } from "@/client/components/page-header";
import { Button } from "@/client/components/ui/button";
import { InviteMemberModal } from "@/client/components/teams/invite-member-modal";
import { RemoveMemberButton } from "@/client/components/teams/remove-member-button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/client/components/ui/avatar";

interface TeamMember {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  isSystemRole: boolean;
  isActive: boolean;
  joinedAt: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    avatar: string | null;
  };
}

interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  creditBalance: number;
  createdAt: string;
}

interface TeamData {
  team: Team;
  members: TeamMember[];
  permissions: {
    canInviteMembers: boolean;
    canRemoveMembers: boolean;
    canEditTeam: boolean;
  };
  userRole: string;
}

export const Route = createFileRoute('/dashboard/teams/$teamSlug')({
  component: TeamDetailPage,
});

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Not joined';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function TeamDetailPage() {
  const { teamSlug } = Route.useParams();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['team', teamSlug],
    queryFn: async () => {
      const response = await apiClient.get(`/teams/${teamSlug}`);
      return response.data as TeamData;
    },
  });

  if (isLoading) {
    return (
      <>
        <PageHeader
          items={[
            { href: "/dashboard/teams", label: "Teams" }
          ]}
        />
        <div className="container mx-auto px-5 pb-12">
          <div className="flex justify-between items-start mb-8">
            <div className="space-y-2">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-5 w-72" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    const errorMessage = (error as any)?.response?.data?.error || 'Failed to load team';
    const isAccessDenied = (error as any)?.response?.status === 403;

    return (
      <>
        <PageHeader
          items={[
            { href: "/dashboard/teams", label: "Teams" }
          ]}
        />
        <div className="container mx-auto px-5 py-12">
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{isAccessDenied ? "Access Denied" : "Error"}</AlertTitle>
            <AlertDescription>
              {isAccessDenied
                ? "You don't have permission to access this team. Please contact the team owner to request access."
                : errorMessage}
            </AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link to="/dashboard/teams">
              Return to Teams
            </Link>
          </Button>
        </div>
      </>
    );
  }

  if (!data) {
    return null;
  }

  const { team, members, permissions, userRole } = data;

  return (
    <>
      <PageHeader
        items={[
          { href: "/dashboard/teams", label: "Teams" },
          { href: `/dashboard/teams/${teamSlug}`, label: team.name }
        ]}
      />
      <div className="container mx-auto px-5 pb-12">
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold mt-4">{team.name}</h1>
              {team.description && (
                <p className="text-muted-foreground mt-2">{team.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {permissions.canInviteMembers && (
              <InviteMemberModal
                teamId={team.id}
                trigger={<Button>Invite Members</Button>}
                onInviteSuccess={() => refetch()}
              />
            )}

            {team.avatarUrl && (
              <div className="h-16 w-16 rounded-md overflow-hidden">
                <img
                  src={team.avatarUrl}
                  alt={`${team.name} avatar`}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Quick stats */}
          <div className="col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 border rounded-lg bg-card flex flex-col">
              <span className="text-sm font-medium text-muted-foreground">Team Credits</span>
              <span className="text-2xl font-bold">{team.creditBalance || 0}</span>
            </div>

            <div className="p-6 border rounded-lg bg-card flex flex-col">
              <span className="text-sm font-medium text-muted-foreground">Your Role</span>
              <span className="text-2xl font-bold capitalize">{userRole || "Member"}</span>
            </div>

            <div className="p-6 border rounded-lg bg-card flex flex-col">
              <span className="text-sm font-medium text-muted-foreground">Created</span>
              <span className="text-2xl font-bold">
                {new Date(team.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Team Members Table */}
          <div className="col-span-3 border rounded-lg p-6 bg-card">
            <h2 className="text-xl font-semibold mb-4">Team Members</h2>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  {permissions.canRemoveMembers && <TableHead className="text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={permissions.canRemoveMembers ? 6 : 5} className="text-center py-6 text-muted-foreground">
                      No members found
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={member.user.avatar || ''}
                            alt={`${member.user.firstName || ''} ${member.user.lastName || ''}`}
                          />
                          <AvatarFallback>
                            {member.user.firstName?.[0]}{member.user.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {member.user.firstName} {member.user.lastName}
                        </span>
                      </TableCell>
                      <TableCell>{member.user.email}</TableCell>
                      <TableCell className="capitalize">
                        {member.roleName}
                      </TableCell>
                      <TableCell>
                        {formatDate(member.joinedAt)}
                      </TableCell>
                      <TableCell>
                        {member.isActive
                          ? <span className="text-green-600 dark:text-green-400">Active</span>
                          : <span className="text-red-600 dark:text-red-400">Inactive</span>}
                      </TableCell>
                      {permissions.canRemoveMembers && (
                        <TableCell className="text-right">
                          <RemoveMemberButton
                            teamId={team.id}
                            userId={member.userId}
                            memberName={`${member.user.firstName || ''} ${member.user.lastName || ''}`.trim() || member.user.email || ''}
                            isDisabled={member.isSystemRole && member.roleId === 'owner'}
                            tooltipText="Team owners cannot be removed"
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </>
  );
}

export default TeamDetailPage;
