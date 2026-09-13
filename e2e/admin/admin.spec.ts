import { test, expect } from "@playwright/test";
import { titlePattern } from "../helpers/editor";

const ASSIGNMENT = "Assignment 1 — C++ Fundamentals";

test.describe("admin flows", () => {
  test("overview loads with stats", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin Overview" })).toBeVisible();
  });

  test("sees the seeded assignment in the admin list", async ({ page }) => {
    await page.goto("/admin/assignments");
    await expect(page.getByRole("link", { name: titlePattern(ASSIGNMENT) })).toBeVisible();
  });

  test("adds a student with a login password and sees the password-set badge", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;

    await page.goto("/admin/students");
    await page.getByRole("button", { name: "+ Add Student" }).click();

    await page.getByPlaceholder("Rahul Sharma").fill("E2E Student");
    await page.getByPlaceholder("student@vnit.ac.in").first().fill(email);
    await page.getByPlaceholder("21241020").fill("E2E0001");
    await page.getByPlaceholder("their login password (min 8 chars)").fill("e2ePassword1");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Student created.")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByPlaceholder("Search name, email, roll no…").fill(email);
    const row = page.getByRole("row", { name: new RegExp(email) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("password set");
    await expect(row).toContainText("STUDENT");
    await expect(row).toContainText("enabled");

    // cleanup: delete the test student so it can't log in
    const list = await page.request.get(`/api/admin/students?search=${encodeURIComponent(email)}`);
    const body = (await list.json()) as { students: { _id: string; email: string }[] };
    const created = body.students.find((s) => s.email === email) ?? body.students[0];
    const res = await page.request.delete(`/api/admin/students/${created._id}`, {
      headers: { "X-Requested-With": "fetch" },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("deletes an account from the UI (removes the row and the backend user)", async ({ page }) => {
    const email = `e2e-del-${Date.now()}@example.com`;
    const created = await page.request.post("/api/admin/students", {
      data: { name: "Delete Me", email, rollNumber: "E2E0009", role: "STUDENT", password: "e2ePassword1" },
      headers: { "X-Requested-With": "fetch" },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto("/admin/students");
    await page.getByPlaceholder("Search name, email, roll no…").fill(email);
    const row = page.getByRole("row", { name: new RegExp(email) });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();

    await expect(row).not.toBeVisible();
    const after = await page.request.get(`/api/admin/students?search=${encodeURIComponent(email)}`);
    const afterBody = (await after.json()) as { students: { email: string }[] };
    expect(afterBody.students.filter((s) => s.email === email)).toHaveLength(0);
  });
});