/**
 * Email-specific constants
 * These are separate from shared/constants.ts because react-email's dev server
 * doesn't support import.meta.env (Vite-specific)
 */

// For email preview, use the production domain
export const SITE_DOMAIN = "nextjs-saas-template.lubomirgeorgiev.com";
export const EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours
export const PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours
