/**
 * Turnstile CAPTCHA Validation
 * Adapted from _ref/src/utils/validate-captcha.ts
 */

import { isTurnstileEnabled, type FlagsEnv } from "./flags";

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

export interface CaptchaEnv extends FlagsEnv {
  TURNSTILE_SECRET_KEY?: string;
}

export async function validateTurnstileToken(env: CaptchaEnv, token: string): Promise<boolean> {
  if (!isTurnstileEnabled(env)) {
    return true;
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn("TURNSTILE_SECRET_KEY is not set");
    return true;
  }

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
      }),
    }
  );

  const data = await response.json() as TurnstileResponse;

  return data.success;
}
