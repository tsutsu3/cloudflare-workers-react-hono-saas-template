import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Spinner } from "@/client/components/ui/spinner";
import NavFooterLayout from "@/client/layouts/NavFooterLayout";

export const Route = createFileRoute('/sso/google/' as const)({
  component: GoogleSSORedirect,
});

function GoogleSSORedirect() {
  useEffect(() => {
    // Redirect to the backend Google OAuth endpoint
    window.location.href = '/api/auth/google';
  }, []);

  return (
    <NavFooterLayout renderFooter={false}>
      <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex flex-col items-center space-y-4">
              <Spinner size="large" />
              <CardTitle>Redirecting to Google</CardTitle>
              <CardDescription>
                Please wait while we redirect you to Google for authentication...
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>
    </NavFooterLayout>
  );
}

export default GoogleSSORedirect;
