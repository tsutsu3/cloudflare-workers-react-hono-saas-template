import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";
import { teamInviteSchema } from "@/shared/schemas/team-invite.schema";
import { Spinner } from "@/client/components/ui/spinner";
import NavFooterLayout from "@/client/layouts/NavFooterLayout";

export const Route = createFileRoute('/team-invite' as const)({
  component: TeamInviteRoute,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || '',
    };
  },
});

function TeamInviteRoute() {
  const navigate = useNavigate();
  const { token } = useSearch({ from: '/team-invite' });
  const hasCalledAcceptInvite = useRef(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const acceptInviteMutation = useMutation({
    mutationFn: async (data: { token: string }) => {
      const response = await apiClient.post('/teams/accept-invite', data);
      return response.data;
    },
    onMutate: () => {
      toast.loading("Processing your invitation...");
    },
    onError: (err: any) => {
      toast.dismiss();
      const message = err.response?.data?.error || "Failed to accept team invitation";
      const code = err.response?.data?.code;
      toast.error(message);
      setError({ message, code });
    },
    onSuccess: (data) => {
      toast.dismiss();
      toast.success("You've successfully joined the team!");

      // Redirect to the team dashboard, with fallback to general dashboard
      setTimeout(() => {
        if (data && typeof data === 'object' && 'teamId' in data) {
          navigate({ to: `/dashboard/teams/${data.teamId}` as any });
        } else if (data && typeof data === 'object' && data.data && 'teamId' in data.data) {
          navigate({ to: `/dashboard/teams/${data.data.teamId}` as any });
        } else {
          // Fallback to dashboard if teamId is not found
          navigate({ to: '/dashboard' });
        }
      }, 500);
    },
  });

  useEffect(() => {
    if (token && !hasCalledAcceptInvite.current) {
      const result = teamInviteSchema.safeParse({ token });
      if (result.success) {
        hasCalledAcceptInvite.current = true;
        acceptInviteMutation.mutate(result.data);
      } else {
        toast.error("Invalid invitation token");
        navigate({ to: "/sign-in" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (acceptInviteMutation.isPending) {
    return (
      <NavFooterLayout renderFooter={false}>
        <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex flex-col items-center space-y-4">
                <Spinner size="large" />
                <CardTitle>Accepting Invitation</CardTitle>
                <CardDescription>
                  Please wait while we process your team invitation...
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>
      </NavFooterLayout>
    );
  }

  if (error) {
    return (
      <NavFooterLayout renderFooter={false}>
        <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Invitation Error</CardTitle>
              <CardDescription>
                {error.message}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {error.code === "CONFLICT"
                  ? "You are already a member of this team."
                  : error.code === "FORBIDDEN" && error.message.includes("limit")
                  ? "You've reached the maximum number of teams you can join."
                  : "The invitation may have expired or been revoked."}
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/dashboard" })}
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </NavFooterLayout>
    );
  }

  if (!token) {
    return (
      <NavFooterLayout renderFooter={false}>
        <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Invalid Invitation Link</CardTitle>
              <CardDescription>
                The invitation link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/dashboard" })}
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </NavFooterLayout>
    );
  }

  return null;
}

export default TeamInviteRoute;
