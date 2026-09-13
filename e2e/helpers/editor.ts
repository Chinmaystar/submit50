import type { Page } from "@playwright/test";

/** Escape a plain title into a safe RegExp source (titles may contain `++`, `—`, etc.). */
export function titlePattern(title: string): RegExp {
  return new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/** Read the text of Monaco's first editor model (robust vs. the shadow-DOM textarea hack). */
export async function getEditorText(page: Page): Promise<string> {
  await page.waitForSelector(".monaco-editor", { timeout: 25_000 });
  await page.waitForFunction(() => {
    const w = window as unknown as { monaco?: { editor?: { getModels?: () => { getValue(): string }[] } } };
    return !!(w.monaco?.editor?.getModels?.().length);
  });
  return page.evaluate(() => {
    const w = window as unknown as { monaco?: { editor?: { getModels?: () => { getValue(): string }[] } } };
    const model = w.monaco?.editor?.getModels?.()[0];
    return model ? model.getValue() : "";
  });
}

/** Focus Monaco, select-all, then replace the buffer. */
export async function setEditorText(page: Page, text: string) {
  await page.waitForSelector(".monaco-editor", { timeout: 25_000 });
  await page.click(".monaco-editor");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(text);
}

/** The problem id from the current URL (/problems/:id). */
export function problemIdFromUrl(url: string): string | null {
  return url.match(/\/problems\/([0-9a-f]{24})/)?.[1] ?? null;
}