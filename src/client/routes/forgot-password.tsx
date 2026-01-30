import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";
import { toast } from "sonner";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/client/components/ui/form";
import { z } from "zod";
import { useSessionStore } from "@/client/state/session";
import { Captcha } from "@/client/components/captcha";
import { forgotPasswordSchema } from "@/shared/schemas/forgot-password.schema";
import { useConfigStore } from "@/client/state/config";
import { useEffect, useState } from "react";
import NavFooterLayout from "@/client/layouts/NavFooterLayout";

export const Route = createFileRoute('/forgot-password' as const)({
  component: ForgotPasswordRoute,
});

type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>;

function ForgotPasswordRoute() {
  const { session } = useSessionStore();
  const { isTurnstileEnabled } = useConfigStore();
  const navigate = useNavigate();
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ForgotPasswordSchema>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  useEffect(() => {
    if (session?.user?.email) {
      form.setValue('email', session?.user?.email);
    }
  }, [form, session?.user?.email]);

  const captchaToken = useWatch({ control: form.control, name: 'captchaToken' });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordSchema) => {
      const response = await apiClient.post('/auth/forgot-password', data);
      return response.data;
    },
    onMutate: () => {
      toast.loading("Sending reset instructions...");
    },
    onError: (error: any) => {
      toast.dismiss();
      toast.error(error.response?.data?.error || "An error occurred");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Reset instructions sent");
      setIsSuccess(true);
    },
  });

  const onSubmit = async (data: ForgotPasswordSchema) => {
    forgotPasswordMutation.mutate({
      ...data,
      email: data.email ?? session?.user?.email,
    });
  };

  if (isSuccess) {
    return (
      <NavFooterLayout renderFooter={false}>
        <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Check your email</CardTitle>
              <CardDescription>
                If an account exists with that email, we&apos;ve sent you instructions to reset your password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/sign-in" })}
              >
                Back to login
              </Button>
            </CardContent>
          </Card>
        </div>
      </NavFooterLayout>
    );
  }

  return (
    <NavFooterLayout renderFooter={false}>
      <div className="container mx-auto px-4 flex flex-col items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              {session ? "Change Password" : "Forgot Password"}
            </CardTitle>
            <CardDescription>
              Enter your email address and we&apos;ll send you instructions to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  disabled={Boolean(session?.user?.email)}
                  defaultValue={session?.user?.email || undefined}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          className="w-full px-3 py-2"
                          placeholder="name@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-col justify-center items-center">
                  <Captcha
                    onSuccess={(token) => form.setValue('captchaToken', token)}
                    validationError={form.formState.errors.captchaToken?.message}
                  />

                  <Button
                    type="submit"
                    className="mt-8 mb-2"
                    disabled={Boolean(isTurnstileEnabled && !captchaToken) || forgotPasswordMutation.isPending}
                  >
                    Send Reset Instructions
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="mt-4 w-full max-w-md">
          {session ? (
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => navigate({ to: "/settings" })}
            >
              Back to settings
            </Button>
          ) : (
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => navigate({ to: "/sign-in" })}
            >
              Back to login
            </Button>
          )}
        </div>
      </div>
    </NavFooterLayout>
  );
}

export default ForgotPasswordRoute;
