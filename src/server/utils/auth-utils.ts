/**
 * Auth Utility Functions
 * Adapted from _ref/src/utils/auth-utils.ts
 */

export const getResetTokenKey = (token: string) => `password-reset:${token}`;
export const getVerificationTokenKey = (token: string) => `email-verification:${token}`;
