/**
 * Mock D1 Database for Testing
 */

import { vi } from 'vitest';

export interface MockD1Result {
  success: boolean;
  results: unknown[];
  meta: { changes: number; last_row_id: number };
}

export interface MockPreparedStatement {
  bind: (...values: unknown[]) => MockPreparedStatement;
  first: <T = unknown>(column?: string) => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  run: () => Promise<MockD1Result>;
}

export interface MockD1Database {
  prepare: (query: string) => MockPreparedStatement;
  batch: <T = unknown>(statements: MockPreparedStatement[]) => Promise<MockD1Result[]>;
  exec: (query: string) => Promise<MockD1Result>;
  dump: () => Promise<ArrayBuffer>;
}

/**
 * Create a mock D1 database with customizable query results
 */
export function createMockD1(queryResults: Map<string, unknown> = new Map()): MockD1Database {
  const createPreparedStatement = (query: string): MockPreparedStatement => {
    let boundValues: unknown[] = [];

    const statement: MockPreparedStatement = {
      bind: (...values: unknown[]) => {
        boundValues = values;
        return statement;
      },
      first: async <T = unknown>(column?: string): Promise<T | null> => {
        const key = `${query}:${JSON.stringify(boundValues)}`;
        const result = queryResults.get(key) ?? queryResults.get(query);
        if (column && result && typeof result === 'object') {
          return (result as Record<string, T>)[column] ?? null;
        }
        return (result as T) ?? null;
      },
      all: async <T = unknown>(): Promise<{ results: T[] }> => {
        const key = `${query}:${JSON.stringify(boundValues)}`;
        const result = queryResults.get(key) ?? queryResults.get(query);
        if (Array.isArray(result)) {
          return { results: result as T[] };
        }
        return { results: result ? [result as T] : [] };
      },
      run: async (): Promise<MockD1Result> => {
        return {
          success: true,
          results: [],
          meta: { changes: 1, last_row_id: 1 },
        };
      },
    };

    return statement;
  };

  return {
    prepare: vi.fn((query: string) => createPreparedStatement(query)),
    batch: vi.fn(async () => [{ success: true, results: [], meta: { changes: 1, last_row_id: 1 } }]),
    exec: vi.fn(async () => ({ success: true, results: [], meta: { changes: 0, last_row_id: 0 } })),
    dump: vi.fn(async () => new ArrayBuffer(0)),
  };
}
