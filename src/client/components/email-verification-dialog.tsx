import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { useSessionStore } from "@/client/state/session";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/client/lib/api-client";
import { toast } from "sonner";
import { useState } from "react";
import { EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS } from "@/shared/constants";
import { Alert } from "@heroui/react"
import { useLocation } from "@tanstack/react-router";

const pagesToBypass: string[] = [
  "/verify-email",
  "/sign-in",
  "/sign-up",
  "/",
  "/privacy",
  "/terms",
  "/reset-password",
  "/forgot-password"
];

export function EmailVerificationDialog() {
  const { session } = useSessionStore();
  const [lastResendTime, setLastResendTime] = useState<number | null>(null);
  const { pathname } = useLocation();

  const resendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/auth/resend-verification');
      return response.data;
    },
    onMutate: () => {
      toast.loading("Sending verification email...");
    },
    onError: (error: any) => {
      toast.dismiss();
      toast.error(error.response?.data?.error || "Failed to send verification email");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Verification email sent");
      setLastResendTime(Date.now());
    },
  });

  // Don't show the dialog if the user is not logged in, if their email is already verified,
  // or if we're on the verify-email page
  if (
    !session
    || session.user.emailVerified
    || pagesToBypass.includes(pathname)
  ) {
    return null;
  }

  const canResend = !lastResendTime || Date.now() - lastResendTime > 60000; // 1 minute cooldown
  const isLoading = resendMutation.isPending;
  const isDev = import.meta.env.DEV;

  return (
    <Dialog open modal onOpenChange={(newState) => {
      if (newState === false) {
        toast.warning("Please verify your email before you continue");
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify your email</DialogTitle>
          <DialogDescription>
            Please verify your email address to access all features. We sent a verification link to {session.user.email}.
            The verification link will expire in {Math.floor(EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS / 3600)} hours.
          </DialogDescription>
          {isDev && (
            <Alert
              color="warning"
              title="Development mode"
              description="You can find the verification link in the console."
              className="mt-4 mb-2"
            />
          )}
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Button
            onClick={() => resendMutation.mutate()}
            disabled={isLoading || !canResend}
          >
            {isLoading
              ? "Sending..."
              : !canResend
                ? "Please wait 1 minute before resending"
                : "Resend verification email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
