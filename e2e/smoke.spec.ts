import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("loads the landing page and navigates to the community section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Grow your career/i })).toBeVisible();
  await page.getByRole("button", { name: /Why AlumniConnect/i }).click();
  await expect(page.locator("#why")).toBeInViewport();
  await expect(page.getByRole("heading", { name: /Make your network/i })).toBeVisible();
});

test("renders and validates login and registration forms", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const loginEmail = page.getByLabel("Email address");
  const loginPassword = page.getByLabel("Password");
  await expect(loginEmail).toHaveAttribute("required", "");
  await expect(loginPassword).toHaveAttribute("required", "");
  expect(await loginEmail.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Join your community" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Join as")).toBeVisible();
});

test("registers a user and uses protected navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Join the community" }).click();
  const email = `browser-${Date.now()}@example.test`;
  await page.getByLabel("Full name").fill("Browser Smoke User");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("BrowserPass123!");
  await page.getByRole("button", { name: /Create account/i }).click();
  await expect(page.getByRole("heading", { name: /Good morning, Browser/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Mentorship" }).click();
  await expect(page.getByRole("heading", { name: "Mentorship" })).toBeVisible();
});

test("renders without horizontal overflow on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Grow your career/i })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("reports no serious or critical automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withRules(["html-has-lang", "document-title", "label", "button-name", "link-name"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
