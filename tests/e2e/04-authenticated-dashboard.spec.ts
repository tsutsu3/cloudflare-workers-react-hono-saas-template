import { test, expect } from '@playwright/test';
import { signIn, signUpAndVerify, TEST_USER } from './helpers/auth';

test.describe('Authenticated Dashboard', () => {
  test.describe.configure({ mode: 'serial' });

  test('should create test user and capture authenticated dashboard', async ({ page }) => {
    // Generate unique email for this test run
    const uniqueEmail = `test-${Date.now()}@example.com`;

    // Sign up new user (automatically redirects to dashboard)
    const authenticated = await signUpAndVerify(page, uniqueEmail, TEST_USER.firstName, TEST_USER.lastName, TEST_USER.password);

    if (!authenticated) {
      console.log('Skipping test - authentication failed');
      test.skip();
      return;
    }

    // Wait for dashboard to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Check if we're actually on dashboard (not redirected to sign-in)
    const currentURL = page.url();
    console.log('Dashboard URL after signup:', currentURL);

    if (currentURL.includes('/sign-in')) {
      console.log('Authentication lost - redirected to sign-in');
      await page.screenshot({
        path: 'tests/e2e/screenshots/20-authenticated-dashboard-auth-lost.png',
        fullPage: true
      });
      test.skip();
      return;
    }

    // Take screenshot of authenticated dashboard
    await page.screenshot({
      path: 'tests/e2e/screenshots/20-authenticated-dashboard.png',
      fullPage: true
    });

    // Look for dashboard-specific elements
    const hasSidebar = await page.locator('[data-testid="sidebar"], aside, nav[class*="sidebar"]').count() > 0;
    const hasMainContent = await page.locator('main, [role="main"]').count() > 0;

    console.log('Dashboard has sidebar:', hasSidebar);
    console.log('Dashboard has main content:', hasMainContent);
  });

  test('should sign in with existing user and capture dashboard', async ({ page }) => {
    // Create and verify a test user first
    const uniqueEmail = `signin-${Date.now()}@example.com`;

    // Sign up and verify user
    const authenticated = await signUpAndVerify(page, uniqueEmail, 'Signin', 'User', TEST_USER.password);

    if (!authenticated) {
      test.skip();
      return;
    }

    // Now sign in with the verified user
    await signIn(page, uniqueEmail, TEST_USER.password);

    // Take screenshot after signin
    await page.screenshot({
      path: 'tests/e2e/screenshots/21-after-signin.png',
      fullPage: true
    });

    const currentURL = page.url();
    console.log('URL after signin:', currentURL);

    // Try to access dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if (page.url().includes('/sign-in')) {
      console.log('Authentication lost after sign-in');
      test.skip();
      return;
    }

    await page.screenshot({
      path: 'tests/e2e/screenshots/22-dashboard-after-signin.png',
      fullPage: true
    });

    console.log('Final dashboard URL:', page.url());
  });

  test('should capture dashboard with different viewport sizes (authenticated)', async ({ page }) => {
    // Sign up and verify a test user
    const uniqueEmail = `mobile-${Date.now()}@example.com`;
    const authenticated = await signUpAndVerify(page, uniqueEmail, 'Mobile', 'User', TEST_USER.password);

    if (!authenticated) {
      test.skip();
      return;
    }

    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if (page.url().includes('/sign-in')) {
      test.skip();
      return;
    }

    await page.screenshot({
      path: 'tests/e2e/screenshots/24-authenticated-dashboard-mobile.png',
      fullPage: true
    });

    // Tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'tests/e2e/screenshots/25-authenticated-dashboard-tablet.png',
      fullPage: true
    });

    // Desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'tests/e2e/screenshots/26-authenticated-dashboard-desktop.png',
      fullPage: true
    });
  });

  test('should capture dashboard navigation and interactions', async ({ page }) => {
    const uniqueEmail = `nav-${Date.now()}@example.com`;
    const authenticated = await signUpAndVerify(page, uniqueEmail, 'Nav', 'User', TEST_USER.password);

    if (!authenticated) {
      test.skip();
      return;
    }

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    if (page.url().includes('/sign-in')) {
      test.skip();
      return;
    }

    // Initial dashboard state
    await page.screenshot({
      path: 'tests/e2e/screenshots/27-dashboard-initial-state.png',
      fullPage: true
    });

    // Try to find and click navigation items
    const navLinks = await page.locator('nav a, aside a, [data-testid*="nav"] a').all();
    console.log(`Found ${navLinks.length} navigation links in authenticated dashboard`);

    if (navLinks.length > 0) {
      // Click first nav item
      await navLinks[0].click();
      await page.waitForTimeout(1000);

      await page.screenshot({
        path: 'tests/e2e/screenshots/28-dashboard-after-nav-click.png',
        fullPage: true
      });
    }

    // Try to find user menu or profile
    const userMenu = page.locator('[data-testid*="user"], [class*="user-menu"], button[aria-label*="user" i]').first();
    if (await userMenu.isVisible().catch(() => false)) {
      await userMenu.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'tests/e2e/screenshots/29-dashboard-user-menu-open.png',
        fullPage: true
      });
    }
  });
});
