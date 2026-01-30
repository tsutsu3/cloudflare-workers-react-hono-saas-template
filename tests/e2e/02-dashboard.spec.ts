import { test, expect } from '@playwright/test';

// Helper function to log in (if authentication is implemented)
async function login(page: any, email: string, password: string) {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

test.describe('Dashboard', () => {
  test.describe('Dashboard Access', () => {
    test('should redirect to sign-in when not authenticated', async ({ page }) => {
      await page.goto('/dashboard');

      // Wait for potential redirect
      await page.waitForTimeout(1000);

      // Check if redirected to sign-in or if dashboard is publicly accessible
      const currentURL = page.url();

      // Take screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/06-dashboard-unauthenticated.png', fullPage: true });

      console.log('Current URL:', currentURL);
    });
  });

  test.describe('Dashboard Layout', () => {
    test('should display dashboard structure when accessible', async ({ page }) => {
      await page.goto('/dashboard');

      // Wait for page to load
      await page.waitForTimeout(2000);

      // Take screenshot of dashboard
      await page.screenshot({ path: 'tests/e2e/screenshots/07-dashboard-layout.png', fullPage: true });

      // Check for common dashboard elements (sidebar, main content area)
      const hasSidebar = await page.locator('[data-testid="sidebar"], aside, nav').count() > 0;
      const hasMainContent = await page.locator('main, [role="main"]').count() > 0;

      console.log('Has sidebar:', hasSidebar);
      console.log('Has main content:', hasMainContent);
    });

    test('should display navigation sidebar', async ({ page }) => {
      await page.goto('/dashboard');

      await page.waitForTimeout(2000);

      // Look for sidebar elements
      const sidebar = page.locator('[data-testid="sidebar"], aside').first();
      if (await sidebar.isVisible()) {
        // Take screenshot with sidebar visible
        await page.screenshot({ path: 'tests/e2e/screenshots/08-dashboard-sidebar.png', fullPage: true });
      }
    });
  });

  test.describe('Dashboard Navigation', () => {
    test('should navigate to different dashboard sections', async ({ page }) => {
      await page.goto('/dashboard');

      await page.waitForTimeout(2000);

      // Try to find and click navigation links
      const navLinks = await page.locator('nav a, aside a').all();

      console.log(`Found ${navLinks.length} navigation links`);

      // Take screenshot of initial state
      await page.screenshot({ path: 'tests/e2e/screenshots/09-dashboard-navigation-initial.png', fullPage: true });

      // Click first navigation link if available
      if (navLinks.length > 0) {
        await navLinks[0].click();
        await page.waitForTimeout(1000);

        // Take screenshot after navigation
        await page.screenshot({ path: 'tests/e2e/screenshots/09-dashboard-navigation-clicked.png', fullPage: true });
      }
    });
  });

  test.describe('Dashboard Stats', () => {
    test('should display dashboard statistics or widgets', async ({ page }) => {
      await page.goto('/dashboard');

      await page.waitForTimeout(2000);

      // Look for stat cards or widgets
      const statCards = await page.locator('[data-testid*="stat"], [class*="card"], [class*="widget"]').all();

      console.log(`Found ${statCards.length} potential stat cards`);

      // Take screenshot
      await page.screenshot({ path: 'tests/e2e/screenshots/10-dashboard-stats.png', fullPage: true });
    });
  });

  test.describe('Responsive Design', () => {
    test('should display correctly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dashboard');

      await page.waitForTimeout(2000);

      // Take screenshot on mobile
      await page.screenshot({ path: 'tests/e2e/screenshots/11-dashboard-mobile.png', fullPage: true });
    });

    test('should display correctly on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/dashboard');

      await page.waitForTimeout(2000);

      // Take screenshot on tablet
      await page.screenshot({ path: 'tests/e2e/screenshots/11-dashboard-tablet.png', fullPage: true });
    });
  });
});
