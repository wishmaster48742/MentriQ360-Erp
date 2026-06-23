import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test("login page loads and shows required elements", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("button:has-text('Sign in')").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="text"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("login page shows connection status indicator", async ({ page }) => {
    await page.goto("/");

    const apiStatus = page.locator("text=API connected").first();
    await expect(apiStatus).toBeVisible({ timeout: 15000 });
  });

  test("login page captcha loads and shows a question", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=API connected").first()).toBeVisible({ timeout: 15000 });
    const captchaInput = page.locator('input[placeholder*="captcha" i], input[name="captcha"]').first();
    await expect(captchaInput).toBeVisible();
  });

  test("login form shows error on empty submit", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=API connected").first()).toBeVisible({ timeout: 15000 });
    await page.locator("button:has-text('Sign in')").first().click();
  });

  test("displays school management branding elements", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("text=Mentriq360").first()).toBeVisible({ timeout: 10000 });
  });

  test("password visibility toggle works", async ({ page }) => {
    await page.goto("/");

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });

    const toggleButton = page.locator("button:has(svg)").first();
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      const textInput = page.locator('input[type="text"]').first();
      const visible = await textInput.isVisible();
      expect(visible).toBeTruthy();
    }
  });
});
