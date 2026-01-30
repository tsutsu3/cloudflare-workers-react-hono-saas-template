import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/client/lib/api-client';
import { PasskeysList } from "@/client/components/settings/passkeys-list";
import { Skeleton } from "@/client/components/ui/skeleton";
import { useSessionStore } from "@/client/state/session";

export const Route = createFileRoute('/settings/security')({
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
  const { session } = useSessionStore();

  const { data: passkeys, isLoading, error } = useQuery({
    queryKey: ['passkeys'],
    queryFn: async () => {
      const response = await apiClient.get('/auth/passkeys');
      return response.data.passkeys;
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
          Failed to load passkeys. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl space-y-8">
      <PasskeysList
        passkeys={passkeys || []}
        currentPasskeyId={session?.passkeyCredentialId ?? null}
        email={session?.user?.email ?? null}
      />
    </div>
  );
}

export default SecuritySettingsPage;
