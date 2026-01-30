/**
 * Email Service - Email sending with Resend or Brevo
 * Adapted from _ref/src/utils/email.tsx
 */

import { SITE_DOMAIN, SITE_URL } from "@/shared/constants";
import { render } from '@react-email/render';
import { ResetPasswordEmail } from "@/react-email/reset-password";
import { VerifyEmail } from "@/react-email/verify-email";
import { TeamInviteEmail } from "@/react-email/team-invite";
import { isProd } from "@/server/utils/is-prod";

// ============================================================================
// Types
// ============================================================================

export interface EmailEnv {
  ENVIRONMENT?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  EMAIL_REPLY_TO?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_FROM?: string;
}

interface BrevoEmailOptions {
  to: { email: string; name?: string }[];
  subject: string;
  replyTo?: string;
  htmlContent: string;
  textContent?: string;
  templateId?: number;
  params?: Record<string, string>;
  tags?: string[];
}

interface ResendEmailOptions {
  to: string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  text?: string;
  tags?: { name: string; value: string }[];
}

type EmailProvider = "resend" | "brevo" | null;

// ============================================================================
// Helper Functions
// ============================================================================

function getEmailProvider(env: EmailEnv): EmailProvider {
  if (env.RESEND_API_KEY) {
    return "resend";
  }

  if (env.BREVO_API_KEY) {
    return "brevo";
  }

  return null;
}

async function sendResendEmail(
  env: EmailEnv,
  {
    to,
    subject,
    html,
    from,
    replyTo: originalReplyTo,
    text,
    tags,
  }: ResendEmailOptions
) {
  if (!isProd(env)) {
    return;
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const replyTo = originalReplyTo ?? env.EMAIL_REPLY_TO;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from ?? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      tags,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to send email via Resend: ${JSON.stringify(error)}`);
  }

  return response.json();
}

async function sendBrevoEmail(
  env: EmailEnv,
  {
    to,
    subject,
    replyTo: originalReplyTo,
    htmlContent,
    textContent,
    templateId,
    params,
    tags,
  }: BrevoEmailOptions
) {
  if (!isProd(env)) {
    return;
  }

  if (!env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is not set");
  }

  const replyTo = originalReplyTo ?? env.EMAIL_REPLY_TO;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: {
        name: env.EMAIL_FROM_NAME,
        email: env.EMAIL_FROM,
      },
      to,
      htmlContent,
      textContent,
      subject,
      templateId,
      params,
      tags,
      ...(replyTo ? {
        replyTo: {
          email: replyTo,
        }
      } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to send email via Brevo: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// ============================================================================
// Email Sending Functions
// ============================================================================

export async function sendPasswordResetEmail(
  env: EmailEnv,
  {
    email,
    resetToken,
    username
  }: {
    email: string;
    resetToken: string;
    username: string;
  }
) {
  const resetUrl = `${SITE_URL}/reset-password?token=${resetToken}`;

  if (!isProd(env)) {
    console.warn('\n\n\nPassword reset url: ', resetUrl);
    return;
  }

  const html = await render(ResetPasswordEmail({ resetLink: resetUrl, username }));
  const provider = getEmailProvider(env);

  if (!provider && isProd(env)) {
    throw new Error("No email provider configured. Set either RESEND_API_KEY or BREVO_API_KEY in your environment.");
  }

  if (provider === "resend") {
    await sendResendEmail(env, {
      to: [email],
      subject: `Reset your password for ${SITE_DOMAIN}`,
      html,
      tags: [{ name: "type", value: "password-reset" }],
    });
  } else {
    await sendBrevoEmail(env, {
      to: [{ email, name: username }],
      subject: `Reset your password for ${SITE_DOMAIN}`,
      htmlContent: html,
      tags: ["password-reset"],
    });
  }
}

export async function sendVerificationEmail(
  env: EmailEnv,
  {
    email,
    verificationToken,
    username
  }: {
    email: string;
    verificationToken: string;
    username: string;
  }
) {
  const verificationUrl = `${SITE_URL}/verify-email?token=${verificationToken}`;

  if (!isProd(env)) {
    console.warn('\n\n\nVerification url: ', verificationUrl);
    return;
  }

  const html = await render(VerifyEmail({ verificationLink: verificationUrl, username }));
  const provider = getEmailProvider(env);

  if (!provider && isProd(env)) {
    throw new Error("No email provider configured. Set either RESEND_API_KEY or BREVO_API_KEY in your environment.");
  }

  if (provider === "resend") {
    await sendResendEmail(env, {
      to: [email],
      subject: `Verify your email for ${SITE_DOMAIN}`,
      html,
      tags: [{ name: "type", value: "email-verification" }],
    });
  } else {
    await sendBrevoEmail(env, {
      to: [{ email, name: username }],
      subject: `Verify your email for ${SITE_DOMAIN}`,
      htmlContent: html,
      tags: ["email-verification"],
    });
  }
}

export async function sendTeamInvitationEmail(
  env: EmailEnv,
  {
    email,
    invitationToken,
    teamName,
    inviterName
  }: {
    email: string;
    invitationToken: string;
    teamName: string;
    inviterName: string;
  }
) {
  const inviteUrl = `${SITE_URL}/team-invite?token=${invitationToken}`;

  if (!isProd(env)) {
    console.warn('\n\n\nTeam invitation url: ', inviteUrl);
    return;
  }

  const html = await render(TeamInviteEmail({
    inviteLink: inviteUrl,
    recipientEmail: email,
    teamName,
    inviterName
  }));

  const provider = getEmailProvider(env);

  if (!provider && isProd(env)) {
    throw new Error("No email provider configured. Set either RESEND_API_KEY or BREVO_API_KEY in your environment.");
  }

  if (provider === "resend") {
    await sendResendEmail(env, {
      to: [email],
      subject: `You've been invited to join a team on ${SITE_DOMAIN}`,
      html,
      tags: [{ name: "type", value: "team-invitation" }],
    });
  } else {
    await sendBrevoEmail(env, {
      to: [{ email }],
      subject: `You've been invited to join a team on ${SITE_DOMAIN}`,
      htmlContent: html,
      tags: ["team-invitation"],
    });
  }
}
