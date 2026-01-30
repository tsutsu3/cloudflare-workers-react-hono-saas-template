import { Page, expect } from '@playwright/test';

/**
 * Helper function to sign in with test credentials
 */
export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);

  await page.click('button[type="submit"]');

  // Wait for successful navigation to dashboard or error toast
  try {
    await Promise.race([
      page.waitForURL('**/dashboard**', { timeout: 10000 }),
      page.locator('[data-sonner-toast][data-type="error"]').waitFor({ timeout: 10000 }),
    ]);
  } catch {
    // Fallback wait
    await page.waitForTimeout(3000);
  }
}

/**
 * Helper function to sign up a new user
 */
export async function signUp(
  page: Page,
  email: string,
  firstName: string,
  lastName: string,
  password: string
): Promise<boolean> {
  await page.goto('/sign-up');

  // Wait for page to fully load
  await page.waitForLoadState('networkidle');

  // Fill the form
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="firstName"]', firstName);
  await page.fill('input[name="lastName"]', lastName);
  await page.fill('input[name="password"]', password);

  // Click submit
  await page.click('button[type="submit"]');

  // Wait for either:
  // 1. Success toast and redirect to dashboard
  // 2. Error toast (sign-up failed)
  try {
    // Wait for success toast or URL change to dashboard
    const result = await Promise.race([
      page.waitForURL('**/dashboard**', { timeout: 15000 }).then(() => 'dashboard'),
      page.locator('[data-sonner-toast][data-type="success"]').waitFor({ timeout: 15000 }).then(() => 'success-toast'),
      page.locator('[data-sonner-toast][data-type="error"]').waitFor({ timeout: 15000 }).then(() => 'error-toast'),
    ]);

    if (result === 'error-toast') {
      console.log('Sign-up failed: error toast appeared');
      return false;
    }

    // If we got success toast but haven't redirected yet, wait for redirect
    if (result === 'success-toast') {
      try {
        await page.waitForURL('**/dashboard**', { timeout: 5000 });
      } catch {
        // The page navigation might have happened via window.location.href
        await page.waitForTimeout(2000);
      }
    }

    // Verify we're on the dashboard
    const currentUrl = page.url();
    console.log('After sign-up, current URL:', currentUrl);

    if (currentUrl.includes('/dashboard')) {
      // Wait for dashboard to fully load
      await page.waitForLoadState('networkidle');
      console.log('Sign-up successful, on dashboard');
      return true;
    }

    // Sometimes the redirect happens but we need to verify authentication
    // by checking if we can stay on a protected page
    return true;
  } catch (error) {
    console.error('Sign-up error:', error);
    // Take a screenshot for debugging
    const screenshotPath = `tests/e2e/screenshots/signup-error-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Error screenshot saved to:', screenshotPath);
    return false;
  }
}

/**
 * Helper function to sign up and verify the user is authenticated
 * Note: Signup automatically creates a session and redirects to dashboard,
 * so email verification is optional for accessing protected routes
 */
export async function signUpAndVerify(
  page: Page,
  email: string,
  firstName: string,
  lastName: string,
  password: string
): Promise<boolean> {
  const success = await signUp(page, email, firstName, lastName, password);

  if (!success) {
    console.error('Sign-up failed for:', email);
    return false;
  }

  // Verify authentication by checking we can access dashboard
  const currentUrl = page.url();
  if (!currentUrl.includes('/dashboard') && !currentUrl.includes('/settings')) {
    // Try navigating to dashboard to verify authentication
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const newUrl = page.url();
    if (newUrl.includes('/sign-in')) {
      console.error('Authentication failed - redirected to sign-in');
      await page.screenshot({
        path: `tests/e2e/screenshots/auth-failed-${Date.now()}.png`,
        fullPage: true,
      });
      return false;
    }
  }

  console.log('User signed up and authenticated:', email);
  return true;
}

/**
 * Test user credentials
 */
export const TEST_USER = {
  email: 'test-dashboard@example.com',
  password: 'TestPassword123!',
  firstName: 'Dashboard',
  lastName: 'Tester',
};
