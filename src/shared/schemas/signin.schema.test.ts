import { describe, it, expect } from 'vitest';
import { signInSchema } from './signin.schema';

describe('signInSchema', () => {
  describe('valid inputs', () => {
    it('should accept valid email and password', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
        expect(result.data.password).toBe('password123');
      }
    });

    it('should accept password with exactly 8 characters', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
        password: '12345678',
      });

      expect(result.success).toBe(true);
    });

    it('should accept long passwords', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
        password: 'a'.repeat(100),
      });

      expect(result.success).toBe(true);
    });

    it('should accept special characters in password', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
        password: '!@#$%^&*()_+-=',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject invalid email format', () => {
      const result = signInSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Please enter a valid email address');
      }
    });

    it('should reject password shorter than 8 characters', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
        password: '1234567',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Password must be at least 8 characters');
      }
    });

    it('should reject empty email', () => {
      const result = signInSchema.safeParse({
        email: '',
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
        password: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing email field', () => {
      const result = signInSchema.safeParse({
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing password field', () => {
      const result = signInSchema.safeParse({
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should reject email without domain', () => {
      const result = signInSchema.safeParse({
        email: 'user@',
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should reject email without @', () => {
      const result = signInSchema.safeParse({
        email: 'userexample.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('should handle whitespace in email', () => {
      const result = signInSchema.safeParse({
        email: ' user@example.com ',
        password: 'password123',
      });

      // Zod by default doesn't trim, so this might fail depending on validation
      // This tests current behavior
      expect(result.success).toBe(false);
    });
  });
});
