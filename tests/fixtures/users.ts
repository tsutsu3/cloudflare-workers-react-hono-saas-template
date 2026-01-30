/**
 * User Test Fixtures
 * Mock user data for testing
 */

import type { KVSession } from '@/server/services/auth-service';

export const mockUser = {
  id: 'user_test123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user' as const,
  emailVerified: true,
  createdAt: new Date('2024-01-01').toISOString(),
  updatedAt: new Date('2024-01-01').toISOString(),
  passwordHash: null,
  currentCredits: 100,
};

export const mockAdminUser = {
  ...mockUser,
  id: 'user_admin123',
  email: 'admin@example.com',
  name: 'Admin User',
  role: 'admin' as const,
};

export const mockUnverifiedUser = {
  ...mockUser,
  id: 'user_unverified123',
  email: 'unverified@example.com',
  emailVerified: false,
};

export const mockSession: KVSession = {
  id: 'session_test123',
  userId: mockUser.id,
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  user: {
    id: mockUser.id,
    email: mockUser.email,
    name: mockUser.name,
    role: mockUser.role,
    emailVerified: mockUser.emailVerified,
  },
  teams: [
    {
      id: 'team_test123',
      name: 'Test Team',
      slug: 'test-team',
      permissions: ['read', 'write'],
    },
  ],
};

export const mockAdminSession: KVSession = {
  ...mockSession,
  id: 'session_admin123',
  userId: mockAdminUser.id,
  user: {
    id: mockAdminUser.id,
    email: mockAdminUser.email,
    name: mockAdminUser.name,
    role: mockAdminUser.role,
    emailVerified: mockAdminUser.emailVerified,
  },
};

export const mockUnverifiedSession: KVSession = {
  ...mockSession,
  id: 'session_unverified123',
  userId: mockUnverifiedUser.id,
  user: {
    id: mockUnverifiedUser.id,
    email: mockUnverifiedUser.email,
    name: mockUnverifiedUser.name,
    role: mockUnverifiedUser.role,
    emailVerified: mockUnverifiedUser.emailVerified,
  },
};

/**
 * Create a session token for testing
 */
export function createSessionToken(sessionId: string): string {
  // In tests, we use a simple format. Real tokens are more complex.
  return `test_token_${sessionId}`;
}

/**
 * Create KV session data for a given session
 */
export function createKVSessionData(session: KVSession): string {
  return JSON.stringify(session);
}
