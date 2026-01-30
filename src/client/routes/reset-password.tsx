import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/client/components/ui/form";
import { Input } from "@/client/components/ui/input";
import { resetPasswordSchema } from "@/shared/schemas/reset-password.schema";
import type { ResetPasswordSchema } from "@/shared/schemas/reset-password.schema";
import { useEffect, useState } from "react";
import NavFooterLayout from "@/client/layouts/NavFooterLayout";

export const Route = createFileRoute('/reset-password' as const)({
  component: ResetPasswordRoute,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || '',
    };
  },
});

function ResetPasswordRoute() {
  const navigate = useNavigate();
  const { token } = useSearch({ from: '/reset-password' });
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<ResetPasswordSchema>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: token || "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (token) {
      form.setValue("token", token);
    }
  }, [token, form]);

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordSchema) => {
      const response = await apiClient.post('/auth/reset-password', data);
      return response.data;
    },
    onMutate: () => {
      toast.loading("Resetting password...");
    },
    onError: (error: any) => {
      toast.dismiss();
      toast.error(error.response?.data?.error || "An error occurred");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Password reset successfully");
      setIsSuccess(true);
    },
  });

  const onSubmit = async (data: ResetPasswordSchema) => {
    resetPasswordMutation.mutate(data);
  };

  if (isSuccess) {
    return (
      <NavFooterLayout renderFooter={false}>
        <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Password Reset Successfully</CardTitle>
              <CardDescription>
                Your password has been reset. You can now log in with your new password.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/sign-in" })}
              >
                Go to Login
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
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              Enter your new password below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetPasswordMutation.isPending}
                >
                  Reset Password
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </NavFooterLayout>
  );
}

export default ResetPasswordRoute;
