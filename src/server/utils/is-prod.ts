/**
 * Check if the environment is production
 * In Cloudflare Workers, we check the ENVIRONMENT variable from wrangler.toml
 */
export function isProd(env: { ENVIRONMENT?: string }): boolean {
  return env.ENVIRONMENT === "production";
}
