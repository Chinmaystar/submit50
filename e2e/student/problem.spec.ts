import { test, expect, type Page } from "@playwright/test";
import { getEditorText, setEditorText, problemIdFromUrl, titlePattern } from "../helpers/editor";

const ASSIGNMENT = "Assignment 1 — C++ Fundamentals";
const PROBLEM = "Maximum Element";
const STARTER_MARKER = "LLONG_MIN";

async function goToProblem(page: Page): Promise<void> {
  await page.goto("/assignments");
  await page.getByRole("link", { name: titlePattern(ASSIGNMENT) }).click();
  await expect(page).toHaveURL(/\/assignments\/[0-9a-f]{24}/);
  await page.getByRole("link", { name: titlePattern(PROBLEM) }).click();
  await expect(page).toHaveURL(/\/problems\/[0-9a-f]{24}/);
  await expect(page.getByRole("heading", { name: PROBLEM })).toBeVisible();
}

test.describe("student problem page", () => {
  test("loads the starter code into the editor", async ({ page }) => {
    await goToProblem(page);
    expect(await getEditorText(page)).toContain(STARTER_MARKER);
  });

  test("autosaves drafts and restores them after a reload", async ({ page }) => {
    await goToProblem(page);
    const id = problemIdFromUrl(page.url());

    const drafted = `// e2e draft\n#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  int n; cin >> n;\n  long long best = ${STARTER_MARKER};\n  for (int i = 0; i < n; i++) {\n    long long x; cin >> x;\n    best = max(best, x);\n  }\n  cout << best << endl;\n}\n`;
    await setEditorText(page, drafted);
    expect(await getEditorText(page)).toContain("// e2e draft");

    await expect(page.getByText("draft autosaved")).toBeVisible();
    const stored = await page.evaluate(
      (key) => localStorage.getItem(key),
      `s50_draft_${id}_cpp17`
    );
    expect(stored).toContain("// e2e draft");

    await page.reload();
    await expect(page.getByRole("heading", { name: PROBLEM })).toBeVisible();
    await expect
      .poll(async () => getEditorText(page), { timeout: 25_000 })
      .toContain("// e2e draft");
  });

  test("reset clears the draft and restores the starter", async ({ page }) => {
    await goToProblem(page);
    await setEditorText(page, "// junk draft");
    await expect(page.getByText("draft autosaved")).toBeVisible();
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByText("draft autosaved")).not.toBeVisible();
    expect(await getEditorText(page)).toContain(STARTER_MARKER);
  });

  test("Run Samples passes the sample case end-to-end (judge stdin pipeline)", async ({ page }) => {
    await goToProblem(page);
    await page.getByRole("button", { name: /Run Samples/ }).click();
    await expect(page.getByText("Passed").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Wrong Answer")).toHaveCount(0);
    await expect(page.getByText("(no output)")).toHaveCount(0);
  });

  test("submit passes all tests and scores 100/100", async ({ page }) => {
    test.setTimeout(240_000); // 80 tests, each executed in its own sandbox container
    await goToProblem(page);
    await page.getByRole("button", { name: /Submit/ }).click();
    await expect(page).toHaveURL(/\/submissions\/[0-9a-f]{24}/);
    await expect(page.getByText("Accepted")).toBeVisible({ timeout: 210_000 });
    await expect(page.getByText("100/100")).toBeVisible();
    await expect(page.getByText("80/80")).toBeVisible();
  });

  test("dashboard shows live score and a green completed tag after submission", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("✓ Completed").first()).toBeVisible();
    await expect(page.getByText(/100\/100/).first()).toBeVisible();
  });

  test("student is blocked from admin pages", async ({ page }) => {
    await page.goto("/admin/students");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});