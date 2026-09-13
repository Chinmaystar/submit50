/**
 * Judge integration test — happy-path verdicts + concurrent load.
 * Requires Docker + the sandbox image (or JUDGE_MODE=local for a smoke test).
 *
 *   docker build -t acm-judge-sandbox:latest judge/sandbox
 *   cd judge && npm run test:judge
 */
import { judgeSubmission } from "../src/judge.js";
import type { JudgeRequest } from "../src/judge.js";
import { judgeConfig } from "../src/config.js";

const OK_SOLUTION = `#include <bits/stdc++.h>\nusing namespace std;\nint main(){ int n; cin >> n; vector<int> a(n); for (auto &x : a) cin >> x; cout << *max_element(a.begin(), a.end()) << endl; }`;

const BASE: Omit<JudgeRequest, "code" | "tests" | "label"> = {
  language: "cpp17",
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  outputLimitKb: 1024,
  comparisonMode: "TOKEN",
  floatTolerance: 1e-6,
};

interface Case {
  name: string;
  code: string;
  tests: { input: string; expectedOutput: string }[];
  want: string; // overall expected: first verdict status or COMPILE
}

const CASES: Case[] = [
  {
    name: "Accepted",
    code: OK_SOLUTION,
    tests: [
      { input: "5\n1 2 3 4 5", expectedOutput: "5" },
      { input: "1\n-7", expectedOutput: "-7" },
    ],
    want: "ACCEPTED",
  },
  {
    name: "Wrong Answer",
    code: `#include <iostream>\nint main(){ int n; std::cin >> n; std::cout << n * 2 << std::endl; }`,
    tests: [{ input: "5", expectedOutput: "5" }],
    want: "WRONG_ANSWER",
  },
  {
    name: "Compilation Error",
    code: `int main(){ syntax error here }`,
    tests: [{ input: "", expectedOutput: "" }],
    want: "COMPILE",
  },
  {
    name: "Runtime Error",
    code: `int main(){ int* p = nullptr; return *p; }`,
    tests: [{ input: "", expectedOutput: "" }],
    want: "RUNTIME_ERROR",
  },
  {
    name: "Time Limit",
    code: `int main(){ while(true){} }`,
    tests: [{ input: "", expectedOutput: "" }],
    want: "TIME_LIMIT_EXCEEDED",
  },
  {
    name: "Memory Limit",
    code: `#include <vector>\nint main(){ std::vector<char> v(1ULL << 40); v[100] = 1; }`,
    tests: [{ input: "", expectedOutput: "" }],
    want: "MEMORY_LIMIT_EXCEEDED",
  },
  {
    name: "Output Limit",
    code: `#include <bits/stdc++.h>\nint main(){ for(int i=0;i<50000000;i++) std::cout << "A"; }`,
    tests: [{ input: "", expectedOutput: "" }],
    want: "OUTPUT_LIMIT_EXCEEDED",
  },
];

function overall(outcome: Awaited<ReturnType<typeof judgeSubmission>>): string {
  if (!outcome.ok) return "COMPILE";
  if (outcome.verdicts.length === 0) return "INTERNAL";
  return outcome.verdicts.every((v) => v.status === "PASSED")
    ? "ACCEPTED"
    : outcome.verdicts.find((v) => v.status !== "PASSED")!.status;
}

async function main(): Promise<void> {
  console.log(`Judge integration — mode=${judgeConfig.mode}`);
  let failed = 0;

  for (const c of CASES) {
    const outcome = await judgeSubmission({
      ...BASE,
      code: c.code,
      tests: c.tests.map((t, i) => ({ id: `t${i}`, input: t.input, expectedOutput: t.expectedOutput, points: 10, isSample: i === 0 })),
      label: c.name.toLowerCase().replace(/\s+/g, "-"),
    });
    const got = overall(outcome);
    const pass = got === c.want;
    console.log(`${pass ? "PASS" : "FAIL"}  ${c.name.padEnd(20)} want=${c.want} got=${got}`);
    if (!pass) failed += 1;
  }

  // Concurrency: 8 simultaneous mixed jobs
  console.log("\nConcurrency test (8 parallel)...");
  const t0 = Date.now();
  const jobs = Array.from({ length: 8 }, (_, i) =>
    judgeSubmission({
      ...BASE,
      code: i % 2 === 0 ? OK_SOLUTION : `int main(){ while(true){} }`,
      tests: [{ id: "t0", input: "5\n1 2 3 4 5", expectedOutput: "5", points: 10, isSample: true }],
      label: `conc-${i}`,
    })
  );
  const results = await Promise.all(jobs);
  const dt = Date.now() - t0;
  const ok = results.filter((r, i) => (i % 2 === 0 ? r.ok && r.verdicts[0]?.status === "PASSED" : r.verdicts[0]?.status === "TIME_LIMIT_EXCEEDED"));
  console.log(`${ok.length === 8 ? "PASS" : "FAIL"}  concurrency  (${ok.length}/8 correct, ${dt}ms total)`);

  if (failed > 0 || ok.length !== 8) {
    console.error(`\n${failed} case(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll judge integration cases passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
