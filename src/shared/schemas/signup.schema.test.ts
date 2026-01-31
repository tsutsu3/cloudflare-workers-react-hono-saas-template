import { describe, it, expect } from 'vitest';
import { signUpSchema } from './signup.schema';

describe('signUpSchema', () => {
  const validCaptchaToken = 'valid-captcha-token-12345';

  describe('valid inputs', () => {
    it('should accept valid sign up data', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
        expect(result.data.firstName).toBe('John');
        expect(result.data.lastName).toBe('Doe');
        expect(result.data.password).toBe('password123');
      }
    });

    it('should accept minimum length names', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'Jo',
        lastName: 'Do',
        password: 'password',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(true);
    });

    it('should accept maximum length names', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'a'.repeat(255),
        lastName: 'b'.repeat(255),
        password: 'password',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(true);
    });

    it('should accept minimum password length (6 characters)', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: '123456',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('should reject invalid email', () => {
      const result = signUpSchema.safeParse({
        email: 'not-an-email',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(false);
    });

    it('should reject firstName shorter than 2 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'J',
        lastName: 'Doe',
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(false);
    });

    it('should reject lastName shorter than 2 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'D',
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(false);
    });

    it('should reject firstName longer than 255 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'a'.repeat(256),
        lastName: 'Doe',
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(false);
    });

    it('should reject lastName longer than 255 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'b'.repeat(256),
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(false);
    });

    it('should reject password shorter than 6 characters', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: '12345',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty email', () => {
      const result = signUpSchema.safeParse({
        email: '',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(false);
    });

    it('should handle missing captchaToken based on environment', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
      });

      // captchaToken is optional when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set
      // In test environment, it's typically not set, so this should pass
      // In production with Turnstile enabled, it would fail
      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle unicode characters in names', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: '太郎',
        lastName: '山田',
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(true);
    });

    it('should handle names with spaces', () => {
      const result = signUpSchema.safeParse({
        email: 'user@example.com',
        firstName: 'John Paul',
        lastName: 'van Der Berg',
        password: 'password123',
        captchaToken: validCaptchaToken,
      });

      expect(result.success).toBe(true);
    });
  });
});
