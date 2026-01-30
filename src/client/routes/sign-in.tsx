import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { type SignInSchema, signInSchema } from "@/shared/schemas/signin.schema";
import { type ReactNode, useState } from "react";

import { Form, FormControl, FormField, FormItem, FormMessage } from "@/client/components/ui/form";
import { Input } from "@/client/components/ui/input";
import { Button } from "@/client/components/ui/button";
import SeparatorWithText from "@/client/components/separator-with-text";
import NavFooterLayout from "@/client/layouts/NavFooterLayout";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";
import SSOButtons from "@/client/components/auth/sso-buttons";
import { KeyIcon } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { REDIRECT_AFTER_SIGN_IN } from "@/shared/constants";

export const Route = createFileRoute('/sign-in' as const)({
  component: SignInRoute,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      redirect: (search.redirect as string) || REDIRECT_AFTER_SIGN_IN,
    };
  },
});

interface PasskeyAuthenticationButtonProps {
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
  redirectPath: string;
}

function PasskeyAuthenticationButton({ className, disabled, children, redirectPath }: PasskeyAuthenticationButtonProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const generateOptionsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/auth/passkey/authenticate-options');
      return response.data;
    },
  });

  const verifyAuthenticationMutation = useMutation({
    mutationFn: async (data: { response: unknown; challenge: string }) => {
      const response = await apiClient.post('/auth/passkey/authenticate', data);
      return response.data;
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Authentication successful");
      window.location.href = redirectPath;
    },
    onError: (error: any) => {
      toast.dismiss();
      toast.error(error.response?.data?.error || "Authentication failed");
    },
  });

  const handleAuthenticate = async () => {
    try {
      setIsAuthenticating(true);
      toast.loading("Authenticating with passkey...");

      // Get authentication options from the server
      const options = await generateOptionsMutation.mutateAsync();

      if (!options) {
        throw new Error("Failed to get authentication options");
      }

      // Start the authentication process in the browser
      const authenticationResponse = await startAuthentication({
        optionsJSON: options,
      });

      // Send the response back to the server for verification
      await verifyAuthenticationMutation.mutateAsync({
        response: authenticationResponse,
        challenge: options.challenge,
      });
    } catch (error) {
      console.error("Passkey authentication error:", error);
      toast.dismiss();
      toast.error("Authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <Button
      onClick={handleAuthenticate}
      disabled={isAuthenticating || disabled}
      className={className}
    >
      {isAuthenticating ? "Authenticating..." : children || "Sign in with a Passkey"}
    </Button>
  );
}

function SignInRoute() {
  const { redirect: redirectPath } = useSearch({ from: '/sign-in' });

  const signInMutation = useMutation({
    mutationFn: async (data: SignInSchema) => {
      const response = await apiClient.post('/auth/sign-in', data);
      return response.data;
    },
    onMutate: () => {
      toast.loading("Signing you in...");
    },
    onError: (error: any) => {
      toast.dismiss();
      toast.error(error.response?.data?.error || "An error occurred");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Signed in successfully");
      window.location.href = redirectPath;
    },
  });

  const form = useForm<SignInSchema>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInSchema) => {
    signInMutation.mutate(data);
  };

  return (
    <NavFooterLayout renderFooter={false}>
      <div className="min-h-[90vh] flex flex-col items-center px-4 justify-center bg-background my-6 md:my-10">
        <div className="w-full max-w-md space-y-8 p-6 md:p-10 bg-card rounded-xl shadow-lg border border-border">
          <div className="text-center">
            <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Sign in to your account
            </h2>
            <p className="mt-2 text-muted-foreground">
              Or{" "}
              <Link to="/sign-up" search={{ redirect: redirectPath }} className="font-medium text-primary hover:text-primary/90 underline">
                create a new account
              </Link>
            </p>
          </div>

          <div className="space-y-4">
            <SSOButtons isSignIn />

            <PasskeyAuthenticationButton className="w-full" redirectPath={redirectPath}>
              <KeyIcon className="w-5 h-5 mr-2" />
              Sign in with a Passkey
            </PasskeyAuthenticationButton>
          </div>

          <SeparatorWithText>
            <span className="uppercase text-muted-foreground">Or</span>
          </SeparatorWithText>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Email address"
                        type="email"
                        className="w-full px-3 py-2"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Password"
                        className="w-full px-3 py-2"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full flex justify-center py-2.5"
                disabled={signInMutation.isPending}
              >
                Sign In with Password
              </Button>
            </form>
          </Form>
        </div>

        <div className="mt-6">
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/forgot-password" className="font-medium text-primary hover:text-primary/90">
              Forgot your password?
            </Link>
          </p>
        </div>
      </div>
    </NavFooterLayout>
  );
}

export default SignInRoute;
