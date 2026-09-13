import fs from "node:fs";
import path from "node:path";
import { test as setup, expect } from "@playwright/test";

const stateDir = path.join(process.cwd(), ".e2e");

const sessions = [
  { email: "student@vnit.ac.in", password: "student123", file: path.join(stateDir, "student.json") },
  { email: "admin@acmvnit.org", password: "admin123", file: path.join(stateDir, "admin.json") },
];

for (const s of sessions) {
  setup(`auth: sign in as ${s.email}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("student@vnit.ac.in").fill(s.email);
    await page.getByPlaceholder("••••••••").fill(s.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(s.file, JSON.stringify(await page.context().storageState()));
  });
}