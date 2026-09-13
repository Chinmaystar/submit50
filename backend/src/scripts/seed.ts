/**
 * Seeds a demo classroom, assignment, problem (Maximum Element) with 80
 * deterministic test cases (1 public sample + 79 hidden worth 100 pts total),
 * and two users (admin + student). Safe to re-run; the test suite is replaced
 * when its size diverges from 80 so fresh installs and upgrades converge.
 *
 *   npm run seed
 */
import { connectMongo, disconnectMongo } from "../config/db.js";
import { closeRedis } from "../config/redis.js";
import { Assignment, Classroom, Problem, TestCase, User } from "../models/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";
import { hashPassword } from "../utils/password.js";

/** Deterministic PRNG so every seed produces the exact same test suite. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BuiltCase {
  input: string;
  expectedOutput: string;
  points: number;
  isSample: boolean;
  order: number;
}

const HIDDEN_COUNT = 79;
const TOTAL_TESTS = HIDDEN_COUNT + 1; // 1 sample + 79 hidden = 80
const TOTAL_POINTS = 100;

/**
 * Build the 80 Maximum Element tests: order 0 is the public sample (0 pts),
 * orders 1..79 are hidden. Two-pointer legacy: the first 21 hidden tests carry
 * 2 pts each and the remaining 58 carry 1 pt each → exactly 100 pts.
 */
function buildMaxElementTests(problemId: unknown): BuiltCase[] {
  const fmt = (n: number, arr: number[]) =>
    `${n}\n${arr.join(" ")}\n`;

  const edges: { n: number; arr: number[] }[] = [
    { n: 1, arr: [0] },
    { n: 1, arr: [-1_000_000_000] },
    { n: 1, arr: [1_000_000_000] },
    { n: 10, arr: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
    { n: 7, arr: [-5, -5, -5, -5, -5, -5, -5] },
    { n: 8, arr: [0, 0, 0, 0, 0, 0, 0, 0] },
    { n: 6, arr: [-1, -3, -2, -4, -6, -5] },
    { n: 9, arr: [1, 2, 3, 4, 100, 4, 3, 2, 1] },
    { n: 12, arr: [7, -1, 0, 6, -2, 5, 999, -999, 8, -7, 6, 7] },
    { n: 5, arr: [5, 5, 5, 5, 5] },
    { n: 4, arr: [-10, 10, -10, 10] },
    { n: 3, arr: [123_456, -123_456, 0] },
  ];

  const random = mulberry32(0x5eed_2024);
  const randInt = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));

  // Large-N performance shapes (N up to the 10^5 bound from the statement).
  // Magnitudes are capped so each input stays under the model's 1MB limit.
  for (const { size, spread } of [
    { size: 100_000, spread: 9 },
    { size: 50_000, spread: 999 },
    { size: 10_000, spread: 1_000_000_000 },
    { size: 7_777, spread: 1_000_000_000 },
  ]) {
    const arr = Array.from({ length: size }, () => randInt(-spread, spread));
    edges.push({ n: size, arr });
  }

  // Fill up to 79 hidden tests with random-sized batches (small N keeps judging fast).
  while (edges.length < HIDDEN_COUNT) {
    const n = randInt(1, 400);
    const spread = [10, 1_000, 1_000_000, 1_000_000_000][randInt(0, 3)];
    const arr = Array.from({ length: n }, () => randInt(-spread, spread));
    edges.push({ n, arr });
  }

  const hidden = edges.slice(0, HIDDEN_COUNT).map(({ n, arr }, i) => {
    const high = arr.reduce((a, b) => (b > a ? b : a), Number.NEGATIVE_INFINITY);
    return {
      input: fmt(n, arr),
      expectedOutput: String(high),
      // First 21 hidden tests weight 2 pts, the rest 1 pt → total 100.
      points: i < 21 ? 2 : 1,
      isSample: false,
      order: i + 1,
    } as BuiltCase;
  });

  return [
    {
      input: "5\n1 2 3 4 5\n",
      expectedOutput: "5",
      points: 0,
      isSample: true,
      order: 0,
    },
    ...hidden,
  ].map((t) => ({ ...t, problemId }));
}

async function upsertUser(name: string, email: string, role: "ADMIN" | "STUDENT", password: string, rollNumber?: string) {
  const u = await User.findOneAndUpdate(
    { email },
    { $set: { name, role, rollNumber, passwordHash: hashPassword(password) } },
    { upsert: true, new: true }
  );
  return u;
}

async function main(): Promise<void> {
  await connectMongo();

  const adminEmail = config.adminEmails[0] ?? "admin@acmvnit.org";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const studentPassword = process.env.SEED_STUDENT_PASSWORD ?? "student123";
  await upsertUser("ACM Admin", adminEmail, "ADMIN", adminPassword);
  await upsertUser("Demo Student", "student@vnit.ac.in", "STUDENT", studentPassword, "BT22CS001");

  let classroom = await Classroom.findOne({ name: "ACM VNIT — C++ Fundamentals" });
  if (!classroom) {
    classroom = await Classroom.create({
      name: "ACM VNIT — C++ Fundamentals",
      description: "Core C++ practice assignments for the ACM Student Chapter, VNIT Nagpur.",
    });
  }

  let assignment = await Assignment.findOne({ title: "Assignment 1 — C++ Fundamentals" });
  if (!assignment) {
    assignment = await Assignment.create({
      classroomId: classroom._id,
      title: "Assignment 1 — C++ Fundamentals",
      description: "Warm-up problems on arrays, searching and recursion.",
      instructions: "Read each statement carefully. C++17 only. Watch the time limits.",
      isPublished: true,
      state: "PUBLISHED",
      leaderboardEnabled: true,
    });
  }

  // Create the Maximum Element problem on first run only.
  let p1 = await Problem.findOne({ assignmentId: assignment._id, title: "Maximum Element" });
  if (!p1) {
    p1 = await Problem.create({
      assignmentId: assignment._id,
      title: "Maximum Element",
      statement:
        "Given an array of N integers, print the maximum element.\n\nThe first line contains N. The second line contains N space-separated integers.",
      inputFormat: "Line 1: integer N (1 ≤ N ≤ 10^5)\nLine 2: N space-separated integers a_i (|a_i| ≤ 10^9)",
      outputFormat: "A single integer — the maximum element.",
      constraints: "1 ≤ N ≤ 10^5\n|a_i| ≤ 10^9",
      sampleInput: "5\n1 2 3 4 5",
      sampleOutput: "5",
      points: 100,
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      outputLimitKb: 1024,
      language: "cpp17",
      starterCode: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // read input and print the maximum element\n    int n;\n    cin >> n;\n    long long best = LLONG_MIN;\n    for (int i = 0; i < n; i++) {\n        long long x;\n        cin >> x;\n        best = max(best, x);\n    }\n    cout << best << endl;\n    return 0;\n}\n`,
      comparisonMode: "TOKEN",
      order: 1,
    });
    logger.info("Created problem", { problemId: String(p1._id) });
  }

  // Rebuild the test suite whenever it isn't the canonical 80 tests. Keeps the
  // demo problem converged across fresh installs and upgrades.
  const testCount = await TestCase.countDocuments({ problemId: p1._id });
  if (testCount !== TOTAL_TESTS) {
    await TestCase.deleteMany({ problemId: p1._id });
    await TestCase.insertMany(buildMaxElementTests(p1._id));
    logger.info("Seeded 80 test cases", { problemId: String(p1._id), previous: testCount });
  }

  logger.info("Seed complete", { adminEmail, studentEmail: "student@vnit.ac.in", adminPassword, studentPassword });
  await closeRedis();
  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
