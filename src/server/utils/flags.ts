/**
 * Feature Flags
 * Adapted from _ref/src/flags.ts
 */

export interface FlagsEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export function isGoogleSSOEnabled(env: FlagsEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function isTurnstileEnabled(env: FlagsEnv): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

export function getConfig(env: FlagsEnv) {
  return {
    isGoogleSSOEnabled: isGoogleSSOEnabled(env),
    isTurnstileEnabled: isTurnstileEnabled(env),
  };
}
