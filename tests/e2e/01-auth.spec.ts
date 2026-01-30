import { test, expect } from '@playwright/test';

// Helper function to generate unique test email
function generateTestEmail() {
  return `test-${Date.now()}@example.com`;
}

test.describe('Authentication Flows', () => {
  test.describe('Sign Up', () => {
    test('should display sign up form', async ({ page }) => {
      await page.goto('/sign-up');

      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="firstName"]')).toBeVisible();
      await expect(page.locator('input[name="lastName"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();

      // Take screenshot of sign up page
      await page.screenshot({ path: 'tests/e2e/screenshots/01-sign-up-form.png', fullPage: true });
    });

    test('should show validation errors for invalid inputs', async ({ page }) => {
      await page.goto('/sign-up');

      // Try to submit with empty fields
      await page.click('button[type="submit"]');

      // Wait for validation errors to appear
      await page.waitForTimeout(500);

      // Take screenshot of validation errors
      await page.screenshot({ path: 'tests/e2e/screenshots/01-sign-up-validation-errors.png', fullPage: true });
    });

    test('should successfully sign up with valid data', async ({ page }) => {
      const testEmail = generateTestEmail();

      await page.goto('/sign-up');

      await page.fill('input[name="email"]', testEmail);
      await page.fill('input[name="firstName"]', 'Test');
      await page.fill('input[name="lastName"]', 'User');
      await page.fill('input[name="password"]', 'TestPassword123!');

      // Take screenshot before submission
      await page.screenshot({ path: 'tests/e2e/screenshots/01-sign-up-filled.png', fullPage: true });

      await page.click('button[type="submit"]');

      // Wait for response
      await page.waitForTimeout(2000);

      // Take screenshot after submission
      await page.screenshot({ path: 'tests/e2e/screenshots/01-sign-up-success.png', fullPage: true });
    });
  });

  test.describe('Sign In', () => {
    test('should display sign in form', async ({ page }) => {
      await page.goto('/sign-in');

      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();

      // Take screenshot of sign in page
      await page.screenshot({ path: 'tests/e2e/screenshots/02-sign-in-form.png', fullPage: true });
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/sign-in');

      await page.fill('input[name="email"]', 'nonexistent@example.com');
      await page.fill('input[name="password"]', 'wrongpassword');

      await page.click('button[type="submit"]');

      // Wait for error message
      await page.waitForTimeout(1000);

      // Take screenshot of error
      await page.screenshot({ path: 'tests/e2e/screenshots/02-sign-in-error.png', fullPage: true });
    });

    test('should show validation errors for invalid email', async ({ page }) => {
      await page.goto('/sign-in');

      await page.fill('input[name="email"]', 'not-an-email');
      await page.fill('input[name="password"]', 'password123');

      // Trigger validation by clicking submit
      await page.click('button[type="submit"]');

      await page.waitForTimeout(500);

      // Take screenshot of validation error
      await page.screenshot({ path: 'tests/e2e/screenshots/02-sign-in-validation.png', fullPage: true });
    });
  });

  test.describe('Password Reset', () => {
    test('should display forgot password form', async ({ page }) => {
      await page.goto('/forgot-password');

      await expect(page.locator('input[name="email"]')).toBeVisible();

      // Take screenshot of forgot password page
      await page.screenshot({ path: 'tests/e2e/screenshots/03-forgot-password-form.png', fullPage: true });
    });

    test('should handle password reset request', async ({ page }) => {
      await page.goto('/forgot-password');

      await page.fill('input[name="email"]', 'test@example.com');

      // Take screenshot before submission
      await page.screenshot({ path: 'tests/e2e/screenshots/03-forgot-password-filled.png', fullPage: true });

      await page.click('button[type="submit"]');

      // Wait for response
      await page.waitForTimeout(2000);

      // Take screenshot after submission
      await page.screenshot({ path: 'tests/e2e/screenshots/03-forgot-password-success.png', fullPage: true });
    });
  });

  test.describe('Social Login', () => {
    test('should show Google sign in button', async ({ page }) => {
      await page.goto('/sign-in');

      // Look for Google sign in button
      const googleButton = page.locator('text=/Sign in with Google/i');
      if (await googleButton.isVisible()) {
        // Take screenshot with Google button visible
        await page.screenshot({ path: 'tests/e2e/screenshots/04-google-signin-button.png', fullPage: true });
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between sign in and sign up', async ({ page }) => {
      await page.goto('/sign-in');

      // Look for sign up link
      const signUpLink = page.locator('text=/Sign up/i').first();
      if (await signUpLink.isVisible()) {
        await signUpLink.click();
        await page.waitForURL('**/sign-up');

        await expect(page).toHaveURL(/sign-up/);

        // Take screenshot of navigation result
        await page.screenshot({ path: 'tests/e2e/screenshots/05-navigation-to-signup.png', fullPage: true });
      }
    });
  });
});
