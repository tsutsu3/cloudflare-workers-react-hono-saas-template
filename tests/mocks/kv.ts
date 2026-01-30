/**
 * Mock KV Namespace for Testing
 */

import { vi } from 'vitest';

export interface MockKVNamespace {
  get: (key: string, options?: { type?: string }) => Promise<string | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number; expiration?: number; metadata?: unknown }) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string; limit?: number; cursor?: string }) => Promise<{
    keys: { name: string; expiration?: number; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  getWithMetadata: <T = unknown>(key: string, options?: { type?: string }) => Promise<{
    value: string | null;
    metadata: T | null;
  }>;
}

/**
 * Create a mock KV namespace with in-memory storage
 */
export function createMockKV(initialData: Record<string, string> = {}): MockKVNamespace {
  const store = new Map<string, { value: string; metadata?: unknown; expiration?: number }>();

  // Initialize with provided data
  for (const [key, value] of Object.entries(initialData)) {
    store.set(key, { value });
  }

  return {
    get: vi.fn(async (key: string): Promise<string | null> => {
      const entry = store.get(key);
      if (!entry) return null;

      // Check expiration
      if (entry.expiration && Date.now() / 1000 > entry.expiration) {
        store.delete(key);
        return null;
      }

      return entry.value;
    }),

    put: vi.fn(async (
      key: string,
      value: string,
      options?: { expirationTtl?: number; expiration?: number; metadata?: unknown }
    ): Promise<void> => {
      const entry: { value: string; metadata?: unknown; expiration?: number } = { value };

      if (options?.metadata) {
        entry.metadata = options.metadata;
      }

      if (options?.expiration) {
        entry.expiration = options.expiration;
      } else if (options?.expirationTtl) {
        entry.expiration = Math.floor(Date.now() / 1000) + options.expirationTtl;
      }

      store.set(key, entry);
    }),

    delete: vi.fn(async (key: string): Promise<void> => {
      store.delete(key);
    }),

    list: vi.fn(async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
      const keys: { name: string; expiration?: number; metadata?: unknown }[] = [];
      const prefix = options?.prefix ?? '';
      const limit = options?.limit ?? 1000;

      for (const [key, entry] of store) {
        if (key.startsWith(prefix)) {
          // Check expiration
          if (entry.expiration && Date.now() / 1000 > entry.expiration) {
            store.delete(key);
            continue;
          }

          keys.push({
            name: key,
            expiration: entry.expiration,
            metadata: entry.metadata,
          });

          if (keys.length >= limit) break;
        }
      }

      return {
        keys,
        list_complete: keys.length < limit,
        cursor: undefined,
      };
    }),

    getWithMetadata: vi.fn(async <T = unknown>(key: string) => {
      const entry = store.get(key);
      if (!entry) return { value: null, metadata: null };

      // Check expiration
      if (entry.expiration && Date.now() / 1000 > entry.expiration) {
        store.delete(key);
        return { value: null, metadata: null };
      }

      return {
        value: entry.value,
        metadata: (entry.metadata as T) ?? null,
      };
    }),
  };
}
