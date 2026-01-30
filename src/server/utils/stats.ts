import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { withKVCache, CACHE_KEYS } from "./with-kv-cache";
import { GITHUB_REPO_URL, SITE_DOMAIN } from "@/shared/constants";

interface StatsEnv {
  DB: D1Database;
  NEXT_INC_CACHE_KV: KVNamespace;
  ENVIRONMENT?: string;
}

export async function getTotalUsers(env: StatsEnv) {
  return withKVCache(
    env,
    async () => {
      const db = getDB(env.DB);

      return await db.$count(userTable);
    },
    {
      key: CACHE_KEYS.TOTAL_USERS,
      ttl: "1 hour",
    }
  );
}

export async function getGithubStars(env: StatsEnv) {
  if (!GITHUB_REPO_URL || typeof GITHUB_REPO_URL !== "string") {
    return null;
  }

  // Extract owner and repo from GitHub URL
  const match = (GITHUB_REPO_URL as string)?.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;

  const [, owner, repo] = match;

  if (!owner || !repo) return null;

  return withKVCache(
    env,
    async () => {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          "User-Agent": `cloudflare-workers-nextjs-saas-template (${SITE_DOMAIN})`,
        },
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        stargazers_count: number;
      };

      return data.stargazers_count;
    },
    {
      key: `${CACHE_KEYS.GITHUB_STARS}:${owner}/${repo}`,
      ttl: "1 hour",
    }
  );
}
