import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/client/lib/api-client';
import type { SessionValidationResult } from '@/shared/types';

export function useSession() {
  const { data: session, isLoading, error, refetch } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const response = await apiClient.get('/auth/session');
      return response.data.session as SessionValidationResult;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  return { session, isLoading, error, refetch };
}
