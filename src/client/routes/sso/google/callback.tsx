import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";
import { googleSSOCallbackSchema } from "@/shared/schemas/google-sso-callback.schema";
import { Spinner } from "@/client/components/ui/spinner";
import { REDIRECT_AFTER_SIGN_IN } from "@/shared/constants";
import NavFooterLayout from "@/client/layouts/NavFooterLayout";

export const Route = createFileRoute('/sso/google/callback' as const)({
  component: GoogleCallbackRoute,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      code: (search.code as string) || '',
      state: (search.state as string) || '',
    };
  },
});

function GoogleCallbackRoute() {
  const navigate = useNavigate();
  const { code, state } = useSearch({ from: '/sso/google/callback' });
  const hasCalledCallback = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const googleCallbackMutation = useMutation({
    mutationFn: async (data: { code: string; state: string }) => {
      const response = await apiClient.post('/auth/google/callback', data);
      return response.data;
    },
    onMutate: () => {
      toast.loading("Signing you in with Google...");
    },
    onError: (err: any) => {
      toast.dismiss();
      const message = err.response?.data?.error || "Failed to sign in with Google";
      toast.error(message);
      setError(message);
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Signed in successfully");
      window.location.href = REDIRECT_AFTER_SIGN_IN;
    },
  });

  useEffect(() => {
    if (code && state && !hasCalledCallback.current) {
      const result = googleSSOCallbackSchema.safeParse({ code, state });
      if (result.success) {
        hasCalledCallback.current = true;
        googleCallbackMutation.mutate(result.data);
      } else {
        toast.error("Invalid callback parameters");
        navigate({ to: "/sign-in" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state]);

  if (googleCallbackMutation.isPending) {
    return (
      <NavFooterLayout renderFooter={false}>
        <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex flex-col items-center space-y-4">
                <Spinner size="large" />
                <CardTitle>Signing in with Google</CardTitle>
                <CardDescription>
                  Please wait while we complete your sign in...
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
              <CardTitle>Sign in failed</CardTitle>
              <CardDescription>
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/sign-in" })}
              >
                Back to sign in
              </Button>
            </CardContent>
          </Card>
        </div>
      </NavFooterLayout>
    );
  }

  return (
    <NavFooterLayout renderFooter={false}>
      <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid callback</CardTitle>
            <CardDescription>
              The sign in callback is invalid or has expired. Please try signing in again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate({ to: "/sign-in" })}
            >
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    </NavFooterLayout>
  );
}

export default GoogleCallbackRoute;
