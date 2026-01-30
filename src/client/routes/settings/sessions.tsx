import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/client/lib/api-client';
import { SessionsList } from "@/client/components/settings/sessions-list";
import { Skeleton } from "@/client/components/ui/skeleton";

export const Route = createFileRoute('/settings/sessions')({
  component: SessionsSettingsPage,
});

function SessionsSettingsPage() {
  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const response = await apiClient.get('/auth/sessions');
      return response.data.sessions;
    },
  });

  if (isLoading) {
    return (
      <div className="container max-w-4xl space-y-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[70px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-4xl space-y-8">
        <div className="text-center text-red-500">
          Failed to load sessions. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl space-y-8">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Active Sessions</h2>
          <p className="text-sm text-muted-foreground">
            Manage your active sessions across different devices.
          </p>
        </div>
        <SessionsList sessions={sessions || []} />
      </div>
    </div>
  );
}

export default SessionsSettingsPage;
