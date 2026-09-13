import { test, expect } from "@playwright/test";

test.describe("unauthenticated access", () => {
  test("deep link redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Submit50/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });
});

test.describe("login form", () => {
  test("rejects a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("student@vnit.ac.in").fill("student@vnit.ac.in");
    await page.getByPlaceholder("••••••••").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible({ timeout: 15_000 });
  });

  test("signs in with valid credentials and lands on the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("student@vnit.ac.in").fill("student@vnit.ac.in");
    await page.getByPlaceholder("••••••••").fill("student123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
    await expect(page.getByText("Demo Student")).toBeVisible();
  });
});