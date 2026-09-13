/**
 * Malicious-submission battery (spec §34). Runs hostile programs through the
 * real judge pipeline and verifies the system fails SAFELY — each attack must
 * terminate, get a sane verdict, and never crash the worker.
 *
 * Usage (needs Docker + sandbox image):
 *   docker build -t acm-judge-sandbox:latest judge/sandbox
 *   cd judge && npm run test:malicious
 */
import { judgeSubmission } from "../src/judge.js";
import { judgeConfig } from "../src/config.js";

interface Attack {
  name: string;
  code: string;
  expect: "TLE" | "RE" | "OLE" | "MLE" | "WA" | "COMPILE";
  /** overall submission status we accept */
  statuses: string[];
}

const ATTACKS: Attack[] = [
  {
    name: "infinite loop",
    code: "int main(){ while(true){} }",
    expect: "TLE",
    statuses: ["TIME_LIMIT_EXCEEDED"],
  },
  {
    name: "infinite recursion",
    code: "void f(){ f(); } int main(){ f(); }",
    expect: "RE",
    statuses: ["RUNTIME_ERROR", "MEMORY_LIMIT_EXCEEDED"], // stack overflow → SIGSEGV/SIGABRT
  },
  {
    name: "huge memory allocation",
    code: "#include <vector>\nint main(){ std::vector<char> v(1ULL << 40); v[100] = 1; }",
    expect: "MLE",
    statuses: ["MEMORY_LIMIT_EXCEEDED", "RUNTIME_ERROR"],
  },
  {
    name: "huge output",
    code: `#include <bits/stdc++.h>\nint main(){ for(int i=0;i<100000000;i++) std::cout << "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n"; }`,
    expect: "OLE",
    statuses: ["OUTPUT_LIMIT_EXCEEDED", "TIME_LIMIT_EXCEEDED"],
  },
  {
    name: "fork bomb attempt",
    code: `#include <unistd.h>\nint main(){ for(int i=0;i<10000;i++) fork(); while(true){} }`,
    expect: "RE",
    statuses: ["RUNTIME_ERROR", "TIME_LIMIT_EXCEEDED", "MEMORY_LIMIT_EXCEEDED"],
  },
  {
    name: "network access attempt",
    code: `int system(const char*); int main(){ return system("curl -s -m 3 https://google.com > /tmp/out 2>&1"); }`,
    expect: "RE",
    statuses: ["RUNTIME_ERROR", "TIME_LIMIT_EXCEEDED"],
  },
  {
    name: "read /etc/passwd",
    code: `#include <cstdio>\nint main(){ FILE* f = fopen("/etc/passwd", "r"); if(!f) return 1; char b[100]; fgets(b, 100, f); puts(b); return 0; }`,
    expect: "RE",
    statuses: ["RUNTIME_ERROR", "WRONG_ANSWER", "ACCEPTED"], // sandbox /etc/passwd is the container's own (empty-ish); must not be the HOST's
  },
  {
    name: "environment inspection",
    code: `#include <cstdio>\n#include <cstdlib>\nint main(){ const char* v = getenv("MONGODB_URI"); if (v) { puts("LEAK"); puts(v); } puts("done"); return 0; }`,
    expect: "WA",
    statuses: ["WRONG_ANSWER", "ACCEPTED"], // must NEVER print LEAK
  },
  {
    name: "docker socket access attempt",
    code: `#include <sys/socket.h>\n#include <cstdio>\n#include <unistd.h>\nint main(){ int s = socket(AF_UNIX, SOCK_STREAM, 0); puts(s < 0 ? "no-socket" : "socket-ok"); return 0; }`,
    expect: "WA",
    statuses: ["WRONG_ANSWER", "ACCEPTED"],
  },
  {
    name: "very large source file",
    code: `int main(){ ${"// pad padding pad\\n".repeat(1)} return 0; }` + "\n" + "x".repeat(120 * 1024),
    expect: "COMPILE",
    statuses: ["COMPILATION_ERROR"],
  },
  {
    name: "compilation abuse (#include recursion bomb)",
    code: "#include <bits/stdc++.h>\n#define A A A\nint main(){ A; }",
    expect: "COMPILE",
    statuses: ["COMPILATION_ERROR"],
  },
];

async function runAttack(a: Attack): Promise<{ name: string; pass: boolean; detail: string }> {
  const outcome = await judgeSubmission({
    language: "cpp17",
    code: a.code,
    tests: [{ id: "t1", input: "", expectedOutput: "expected-output\n", points: 10, isSample: false }],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    outputLimitKb: 64, // 64 KB output ceiling for the OLE attack
    comparisonMode: "TOKEN",
    floatTolerance: 1e-6,
    label: "attack",
  });

  let status: string;
  if (!outcome.ok) status = "COMPILATION_ERROR";
  else if (outcome.verdicts.length === 0) status = "INTERNAL_ERROR";
  else status = outcome.verdicts[0].status;

  // Hard safety checks that apply to every attack:
  const leaks = ["LEAK", "root:x:0:0", "MONGODB_URI", "redis://", "docker.sock", "jwt", "JWT_SECRET"];

  const detailJson = JSON.stringify({
    verdicts: outcome.verdicts.map((v) => ({ status: v.status, actual: v.actualOutput, stderr: v.stderrExcerpt })),
    compileError: outcome.compileError?.slice(0, 200),
  });

  const leaked = leaks.filter((l) => detailJson.includes(l));
  if (leaked.length > 0) {
    return { name: a.name, pass: false, detail: `SECRET/HOST LEAK detected: ${leaked.join(", ")}` };
  }
  if (!a.statuses.includes(status)) {
    return { name: a.name, pass: false, detail: `expected ${a.statuses.join("|")} got ${status}` };
  }
  return { name: a.name, pass: true, detail: `verdict: ${status}` };
}

async function main(): Promise<void> {
  console.log(`Judge malicious battery — mode=${judgeConfig.mode}, image=${judgeConfig.sandboxImage}`);
  if (judgeConfig.mode !== "docker") {
    console.warn("WARNING: running attacks in local (host) mode. Results are indicative only.");
  }

  let failed = 0;
  for (const a of ATTACKS) {
    try {
      const r = await runAttack(a);
      console.log(`${r.pass ? "PASS" : "FAIL"}  ${a.name.padEnd(28)} ${r.detail}`);
      if (!r.pass) failed += 1;
    } catch (err) {
      failed += 1;
      console.log(`FAIL  ${a.name.padEnd(28)} threw: ${String(err)}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed}/${ATTACKS.length} attacks were NOT contained safely.`);
    process.exit(1);
  }
  console.log(`\nAll ${ATTACKS.length} attacks contained safely.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
