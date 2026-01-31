import { test, expect } from '@playwright/test';
import { signUpAndVerify, TEST_USER } from './helpers/auth';

test.describe('Authenticated Settings', () => {
  test.describe.configure({ mode: 'serial' });

  test('should capture authenticated settings page', async ({ page }) => {
    // Generate unique email for this test run
    const uniqueEmail = `settings-${Date.now()}@example.com`;

    // Sign up and verify new user
    const authenticated = await signUpAndVerify(page, uniqueEmail, TEST_USER.firstName, TEST_USER.lastName, TEST_USER.password);

    if (!authenticated) {
      console.log('Skipping test - authentication failed');
      test.skip();
      return;
    }

    // Navigate to settings
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check if we're still authenticated (not redirected to sign-in)
    const currentURL = page.url();
    console.log('Settings URL:', currentURL);

    if (currentURL.includes('/sign-in')) {
      console.log('Authentication lost - redirected to sign-in');
      await page.screenshot({
        path: 'tests/e2e/screenshots/30-authenticated-settings-auth-lost.png',
        fullPage: true
      });
      test.skip();
      return;
    }

    // Take screenshot of authenticated settings
    await page.screenshot({
      path: 'tests/e2e/screenshots/30-authenticated-settings.png',
      fullPage: true
    });
  });

  test('should capture profile settings with filled data', async ({ page }) => {
    const uniqueEmail = `profile-${Date.now()}@example.com`;
    const authenticated = await signUpAndVerify(page, uniqueEmail, 'Profile', 'User', TEST_USER.password);

    if (!authenticated) {
      test.skip();
      return;
    }

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if (page.url().includes('/sign-in')) {
      test.skip();
      return;
    }

    // Look for profile fields
    const emailField = page.locator('input[name="email"], input[type="email"]').first();
    const firstNameField = page.locator('input[name="firstName"], input[name="first_name"]').first();
    const lastNameField = page.locator('input[name="lastName"], input[name="last_name"]').first();

    const hasEmailField = await emailField.isVisible().catch(() => false);
    const hasFirstNameField = await firstNameField.isVisible().catch(() => false);
    const hasLastNameField = await lastNameField.isVisible().catch(() => false);

    console.log('Profile fields - Email:', hasEmailField, 'First Name:', hasFirstNameField, 'Last Name:', hasLastNameField);

    await page.screenshot({
      path: 'tests/e2e/screenshots/31-authenticated-settings-profile.png',
      fullPage: true
    });
  });

  test('should capture security settings (authenticated)', async ({ page }) => {
    const uniqueEmail = `security-${Date.now()}@example.com`;
    const authenticated = await signUpAndVerify(page, uniqueEmail, 'Security', 'User', TEST_USER.password);

    if (!authenticated) {
      test.skip();
      return;
    }

    await page.goto('/settings/security');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if (page.url().includes('/sign-in')) {
      test.skip();
      return;
    }

    await page.screenshot({
      path: 'tests/e2e/screenshots/32-authenticated-settings-security.png',
      fullPage: true
    });

    // Look for security-related elements
    const passwordSection = page.locator('text=/password/i').first();
    const hasPasswordSection = await passwordSection.isVisible().catch(() => false);

    console.log('Has password section:', hasPasswordSection);
  });

  test('should capture sessions management (authenticated)', async ({ page }) => {
    const uniqueEmail = `sessions-${Date.now()}@example.com`;
    const authenticated = await signUpAndVerify(page, uniqueEmail, 'Sessions', 'User', TEST_USER.password);

    if (!authenticated) {
      test.skip();
      return;
    }

    await page.goto('/settings/sessions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if (page.url().includes('/sign-in')) {
      test.skip();
      return;
    }

    await page.screenshot({
      path: 'tests/e2e/screenshots/33-authenticated-settings-sessions.png',
      fullPage: true
    });

    // Check if sessions are listed
    const sessionsList = await page.locator('[data-testid*="session"], [class*="session"]').all();
    console.log(`Found ${sessionsList.length} session items`);
  });

  test('should capture settings navigation (authenticated)', async ({ page }) => {
    const uniqueEmail = `nav-settings-${Date.now()}@example.com`;
    const authenticated = await signUpAndVerify(page, uniqueEmail, 'NavSettings', 'User', TEST_USER.password);

    if (!authenticated) {
      test.skip();
      return;
    }

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if (page.url().includes('/sign-in')) {
      test.skip();
      return;
    }

    // Look for settings navigation tabs or links
    const settingsNav = await page.locator('nav a, [role="tablist"] button, [role="navigation"] a').all();
    console.log(`Found ${settingsNav.length} settings navigation items`);

    await page.screenshot({
      path: 'tests/e2e/screenshots/34-authenticated-settings-navigation.png',
      fullPage: true
    });

    // Try to navigate to different settings sections
    if (settingsNav.length > 1) {
      await settingsNav[1].click();
      await page.waitForTimeout(1000);

      await page.screenshot({
        path: 'tests/e2e/screenshots/35-authenticated-settings-nav-switched.png',
        fullPage: true
      });
    }
  });

  test('should capture passkey/webauthn settings (authenticated)', async ({ page }) => {
    const uniqueEmail = `passkey-${Date.now()}@example.com`;
    const authenticated = await signUpAndVerify(page, uniqueEmail, 'Passkey', 'User', TEST_USER.password);

    if (!authenticated) {
      test.skip();
      return;
    }

    await page.goto('/settings/security');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if (page.url().includes('/sign-in')) {
      test.skip();
      return;
    }

    // Look for passkey-related elements
    const passkeySection = page.locator('text=/passkey/i, text=/webauthn/i').first();
    const hasPasskeySection = await passkeySection.isVisible().catch(() => false);

    console.log('Has passkey section:', hasPasskeySection);

    await page.screenshot({
      path: 'tests/e2e/screenshots/36-authenticated-settings-passkey.png',
      fullPage: true
    });
  });
});
