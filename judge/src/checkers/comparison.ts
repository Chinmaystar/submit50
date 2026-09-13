/**
 * Output comparison. Default TOKEN: whitespace/newline insensitive.
 * EXACT: byte-for-byte. FLOAT: whitespace-insensitive tokens compared as
 * numbers with a configurable tolerance. Custom checkers can slot in later
 * by extending this registry.
 */
export type ComparisonMode = "EXACT" | "TOKEN" | "FLOAT";

function splitTokens(s: string): string[] {
  return s.trim().split(/\s+/).filter((t) => t.length > 0);
}

export function compareOutput(
  mode: ComparisonMode,
  expected: string,
  actual: string,
  floatTolerance = 1e-6
): { passed: boolean; reason?: string } {
  if (mode === "EXACT") {
    const e = expected.replace(/\r\n/g, "\n");
    const a = actual.replace(/\r\n/g, "\n");
    // trailing-newline-insensitive even in EXACT (judge-internal normalization)
    const norm = (x: string) => (x.endsWith("\n") ? x.slice(0, -1) : x);
    return { passed: norm(e) === norm(a) };
  }

  if (mode === "FLOAT") {
    const e = splitTokens(expected);
    const a = splitTokens(actual);
    if (e.length !== a.length) return { passed: false, reason: "token count mismatch" };
    for (let i = 0; i < e.length; i++) {
      const ev = Number(e[i]);
      const av = Number(a[i]);
      if (Number.isNaN(ev) || Number.isNaN(av)) {
        if (e[i] !== a[i]) return { passed: false, reason: `token ${i + 1} mismatch` };
        continue;
      }
      const scale = Math.max(1, Math.abs(ev));
      if (Math.abs(ev - av) > floatTolerance * scale) {
        return { passed: false, reason: `token ${i + 1} exceeds tolerance` };
      }
    }
    return { passed: true };
  }

  // TOKEN (default)
  const e = splitTokens(expected);
  const a = splitTokens(actual);
  if (e.length !== a.length) return { passed: false, reason: "token count mismatch" };
  for (let i = 0; i < e.length; i++) {
    if (e[i] !== a[i]) return { passed: false, reason: `token ${i + 1} mismatch` };
  }
  return { passed: true };
}
