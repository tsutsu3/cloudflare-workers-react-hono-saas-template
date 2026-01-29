import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Get a Drizzle instance for the D1 database
 * @param d1 - D1 database instance from Cloudflare Workers environment
 * @returns Drizzle instance configured with the schema
 */
export function getDB(d1: D1Database) {
  if (!d1) {
    throw new Error("D1 database not found");
  }

  return drizzle(d1, { schema, logger: true });
}

export type DB = ReturnType<typeof getDB>;
