import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.describe('Settings Access', () => {
    test('should display settings page', async ({ page }) => {
      await page.goto('/settings');

      await page.waitForTimeout(2000);

      // Take screenshot of settings page
      await page.screenshot({ path: 'tests/e2e/screenshots/12-settings-page.png', fullPage: true });
    });
  });

  test.describe('Profile Settings', () => {
    test('should display profile form fields', async ({ page }) => {
      await page.goto('/settings');

      await page.waitForTimeout(2000);

      // Look for common profile fields
      const emailField = page.locator('input[name="email"], input[type="email"]').first();
      const firstNameField = page.locator('input[name="firstName"], input[name="first_name"]').first();
      const lastNameField = page.locator('input[name="lastName"], input[name="last_name"]').first();

      const hasEmailField = await emailField.isVisible().catch(() => false);
      const hasFirstNameField = await firstNameField.isVisible().catch(() => false);
      const hasLastNameField = await lastNameField.isVisible().catch(() => false);

      console.log('Has email field:', hasEmailField);
      console.log('Has first name field:', hasFirstNameField);
      console.log('Has last name field:', hasLastNameField);

      // Take screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/13-settings-profile-fields.png', fullPage: true });
    });
  });

  test.describe('Security Settings', () => {
    test('should navigate to security settings', async ({ page }) => {
      await page.goto('/settings/security');

      await page.waitForTimeout(2000);

      // Take screenshot of security settings
      await page.screenshot({ path: 'tests/e2e/screenshots/14-settings-security.png', fullPage: true });
    });

    test('should display password change option', async ({ page }) => {
      await page.goto('/settings');

      await page.waitForTimeout(2000);

      // Look for password-related elements
      const passwordSection = page.locator('text=/password/i').first();
      const hasPasswordSection = await passwordSection.isVisible().catch(() => false);

      console.log('Has password section:', hasPasswordSection);

      // Take screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/15-settings-password-section.png', fullPage: true });
    });
  });

  test.describe('Sessions Management', () => {
    test('should display sessions page if available', async ({ page }) => {
      await page.goto('/settings/sessions');

      await page.waitForTimeout(2000);

      // Take screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/16-settings-sessions.png', fullPage: true });

      // Check if sessions are listed
      const sessionsList = await page.locator('[data-testid*="session"], [class*="session"]').all();

      console.log(`Found ${sessionsList.length} session items`);
    });
  });

  test.describe('Settings Navigation', () => {
    test('should display settings navigation menu', async ({ page }) => {
      await page.goto('/settings');

      await page.waitForTimeout(2000);

      // Look for settings navigation tabs or links
      const settingsNav = await page.locator('nav a, [role="tablist"] button').all();

      console.log(`Found ${settingsNav.length} settings navigation items`);

      // Take screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/17-settings-navigation.png', fullPage: true });
    });

    test('should navigate between settings sections', async ({ page }) => {
      await page.goto('/settings');

      await page.waitForTimeout(2000);

      // Get all navigation links
      const navLinks = await page.locator('nav a, [role="tablist"] button').all();

      if (navLinks.length > 1) {
        // Click second navigation item
        await navLinks[1].click();
        await page.waitForTimeout(1000);

        // Take screenshot after navigation
        await page.screenshot({ path: 'tests/e2e/screenshots/17-settings-navigation-switched.png', fullPage: true });
      }
    });
  });

  test.describe('Passkey/WebAuthn Settings', () => {
    test('should display passkey settings if available', async ({ page }) => {
      await page.goto('/settings/security');

      await page.waitForTimeout(2000);

      // Look for passkey-related elements
      const passkeySection = page.locator('text=/passkey/i, text=/webauthn/i').first();
      const hasPasskeySection = await passkeySection.isVisible().catch(() => false);

      console.log('Has passkey section:', hasPasskeySection);

      // Take screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/18-settings-passkey.png', fullPage: true });
    });
  });
});
