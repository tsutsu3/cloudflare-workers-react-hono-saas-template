import { useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Users, CheckCircle } from "lucide-react";
import { apiClient } from "@/client/lib/api-client";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface PendingInvitation {
  id: string;
  token: string;
  teamId: string;
  team: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
  roleId: string;
  isSystemRole: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  invitedBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    avatar: string | null;
  };
}

export function PendingInvitations() {
  const queryClient = useQueryClient();
  const [isAccepting, setIsAccepting] = useState<Record<string, boolean>>({});

  const { data: pendingInvitations, isLoading } = useQuery({
    queryKey: ['pending-invitations'],
    queryFn: async () => {
      const response = await apiClient.get('/teams/pending-invitations');
      return response.data.invitations as PendingInvitation[];
    },
  });

  const acceptInvitationMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiClient.post('/teams/accept-invite', { token });
      return response.data;
    },
    onSuccess: () => {
      toast.success("You have successfully joined the team");
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to accept invitation");
    },
  });

  const handleAccept = async (token: string) => {
    setIsAccepting(prev => ({ ...prev, [token]: true }));
    try {
      await acceptInvitationMutation.mutateAsync(token);
    } finally {
      setIsAccepting(prev => ({ ...prev, [token]: false }));
    }
  };

  if (isLoading) {
    return null;
  }

  if (!pendingInvitations || pendingInvitations.length === 0) {
    return null;
  }

  return (
    <Card className="mb-8 border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20">
      <CardHeader>
        <CardTitle className="text-xl">Pending Team Invitations</CardTitle>
        <CardDescription>
          You have been invited to join the following teams
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pendingInvitations.map((invitation) => (
          <div key={invitation.id} className="flex items-center justify-between p-3 bg-background rounded-md border">
            <div className="flex items-center gap-3">
              {invitation.team.avatarUrl ? (
                <div className="h-10 w-10 rounded-md overflow-hidden">
                  <img
                    src={invitation.team.avatarUrl}
                    alt={`${invitation.team.name} logo`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                  <Users className="h-5 w-5" />
                </div>
              )}
              <div>
                <h3 className="font-medium">{invitation.team.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Invited by {invitation.invitedBy.firstName || ''} {invitation.invitedBy.lastName || ''}
                </p>
              </div>
            </div>
            <Button
              onClick={() => handleAccept(invitation.token)}
              disabled={isAccepting[invitation.token]}
              size="sm"
            >
              {isAccepting[invitation.token] ? (
                "Accepting..."
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Accept
                </>
              )}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
