/** Supported judge languages — MUST stay in sync with backend/src/types.ts
 *  and judge/src/languages/index.ts. */
export const LANGUAGES = ["c17", "cpp17", "java17"] as const;
export type LanguageId = (typeof LANGUAGES)[number];

/** Per-language map that may be missing some entries (problems only require
 *  languages they allow; legacy problems start with just cpp17). */
export type LanguageStarterMap = Partial<Record<LanguageId, string>>;

/** Human-readable names shown to students/admins (never raw IDs). */
export const LANGUAGE_LABELS: Record<LanguageId, string> = {
  c17: "C",
  cpp17: "C++17",
  java17: "Java 17",
};

/** Registry id -> Monaco language id for syntax highlighting. */
export const TO_MONACO: Record<LanguageId, string> = {
  c17: "c",
  cpp17: "cpp",
  java17: "java",
};

/** Per-language starter templates for the admin problem editor. */
export const DEFAULT_STARTERS: Record<LanguageId, string> = {
  c17: `#include <stdio.h>

int main(void) {
    return 0;
}
`,
  cpp17: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  java17: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
    }
}
`,
};

export function isLanguageId(v: string): v is LanguageId {
  return (LANGUAGES as readonly string[]).includes(v);
}