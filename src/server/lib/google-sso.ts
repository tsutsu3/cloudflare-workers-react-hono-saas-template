/**
 * Google SSO Client
 * Adapted from _ref/src/lib/sso/google-sso.ts
 */

import { SITE_URL } from "@/shared/constants";
import { Google } from "arctic";

export interface GoogleSSOEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export function getGoogleSSOClient(env: GoogleSSOEnv): Google {
  return new Google(
    env.GOOGLE_CLIENT_ID ?? "",
    env.GOOGLE_CLIENT_SECRET ?? "",
    `${SITE_URL}/sso/google/callback`
  );
}
