import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";
import { verifyEmailSchema } from "@/shared/schemas/verify-email.schema";
import { Spinner } from "@/client/components/ui/spinner";
import { REDIRECT_AFTER_SIGN_IN } from "@/shared/constants";
import NavFooterLayout from "@/client/layouts/NavFooterLayout";

export const Route = createFileRoute('/verify-email' as const)({
  component: VerifyEmailRoute,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || '',
    };
  },
});

function VerifyEmailRoute() {
  const navigate = useNavigate();
  const { token } = useSearch({ from: '/verify-email' });
  const hasCalledVerification = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const verifyEmailMutation = useMutation({
    mutationFn: async (data: { token: string }) => {
      const response = await apiClient.post('/auth/verify-email', data);
      return response.data;
    },
    onMutate: () => {
      toast.loading("Verifying your email...");
    },
    onError: (err: any) => {
      toast.dismiss();
      const message = err.response?.data?.error || "Failed to verify email";
      toast.error(message);
      setError(message);
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Email verified successfully");

      setTimeout(() => {
        navigate({ to: REDIRECT_AFTER_SIGN_IN as any });
      }, 500);
    },
  });

  useEffect(() => {
    if (token && !hasCalledVerification.current) {
      const result = verifyEmailSchema.safeParse({ token });
      if (result.success) {
        hasCalledVerification.current = true;
        verifyEmailMutation.mutate(result.data);
      } else {
        toast.error("Invalid verification token");
        navigate({ to: "/sign-in" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (verifyEmailMutation.isPending) {
    return (
      <NavFooterLayout renderFooter={false}>
        <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex flex-col items-center space-y-4">
                <Spinner size="large" />
                <CardTitle>Verifying Email</CardTitle>
                <CardDescription>
                  Please wait while we verify your email address...
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
              <CardTitle>Verification failed</CardTitle>
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

  if (!token) {
    return (
      <NavFooterLayout renderFooter={false}>
        <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Invalid verification link</CardTitle>
              <CardDescription>
                The verification link is invalid. Please request a new verification email.
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

  return null;
}

export default VerifyEmailRoute;
