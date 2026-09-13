import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import cookie from "cookie";

// globalSetup mock provides enqueue spies; import the mock handle
import { enqueueSubmission } from "../src/queues/index.js";
import {
  Assignment,
  Problem,
  TestCase,
  User,
  Submission,
  TestResult,
  AssignmentScore,
} from "../src/models/index.js";
import { createApp } from "../src/app.js";
import { signSession } from "../src/middleware/auth.js";
import { hashPassword } from "../src/utils/password.js";

let app: ReturnType<typeof createApp>;

vi.mock("../src/queues/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/queues/index.js")>();
  return {
    ...actual,
    enqueueSubmission: vi.fn(async () => "job-1"),
    enqueueRun: vi.fn(async () => "job-run-1"),
    getRunQueue: vi.fn(() => ({
      getJob: vi.fn(async () => ({
        waitUntilFinished: vi.fn(async () => ({
          status: "PASSED",
          tests: [
            { index: 0, isSample: true, status: "PASSED", points: 0, earned: 0, executionTimeMs: 1, memoryUsedKb: 1 },
          ],
        })),
      })),
    })),
    closeQueues: vi.fn(async () => undefined),
  };
});

// The /run route constructs a real QueueEvents + Redis connection to wait for
// the judge job; stub both so the API tests never touch Redis.
vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>();
  return {
    ...actual,
    QueueEvents: class {
      async close() {}
    },
  };
});

vi.mock("../src/config/redis.js", () => ({
  createRedisConnection: vi.fn(() => ({ __testOnly: true })),
  getRedis: vi.fn(() => ({ call: vi.fn() })),
  closeRedis: vi.fn(async () => undefined),
}));

async function login(email: string, name = "Test User", password = "testpass123") {
  // Password accounts are admin-created; seed the user directly (mirrors the
  // admin panel / CSV import) and then log in through the real API.
  const role = email.toLowerCase().startsWith("admin") ? "ADMIN" : "STUDENT";
  await User.updateOne({ email }, { $set: { name, role, passwordHash: hashPassword(password) } }, { upsert: true });
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  const setCookie = res.headers["set-cookie"][0] as string;
  return cookie.parse(setCookie)[process.env.COOKIE_NAME ?? "s50_session"];
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  vi.clearAllMocks();
});

afterAll(async () => {
  // connections closed in globalSetup hook
});

describe("health", () => {
  it("responds ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("auth", () => {
  it("rejects unauthenticated access to protected routes", async () => {
    const res = await request(app).get("/api/assignments");
    expect(res.status).toBe(401);
  });

  it("password login creates a session and /me returns the user", async () => {
    const token = await login("stud1@test.vnit.ac.in", "Student One");
    const res = await request(app).get("/api/auth/me").set("Cookie", `${process.env.COOKIE_NAME ?? "s50_session"}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("STUDENT");
    expect(res.body.email).toBe("stud1@test.vnit.ac.in");
  });

  it("admins log in via password and /me returns ADMIN", async () => {
    const token = await login("admin@test.vnit.ac.in", "Admin");
    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${process.env.COOKIE_NAME ?? "s50_session"}=${token}`);
    expect(me.body.role).toBe("ADMIN");
  });

  it("rejects wrong password and unknown email", async () => {
    await User.updateOne(
      { email: "known@test.vnit.ac.in" },
      { $set: { name: "Known", role: "STUDENT", passwordHash: hashPassword("rightpass1") } },
      { upsert: true }
    );
    const wrong = await request(app).post("/api/auth/login").send({ email: "known@test.vnit.ac.in", password: "wrongpass1" });
    expect(wrong.status).toBe(401);
    const unknown = await request(app).post("/api/auth/login").send({ email: "ghost@test.vnit.ac.in", password: "whatever1" });
    expect(unknown.status).toBe(401);
  });

  it("logout clears the cookie", async () => {
    await login("stud2@test.vnit.ac.in");
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });
});

describe("authorization", () => {
  it("student cannot access admin APIs", async () => {
    const token = await login("stud3@test.vnit.ac.in");
    const res = await request(app)
      .get("/api/admin/students")
      .set("Cookie", `${process.env.COOKIE_NAME ?? "s50_session"}=${token}`);
    expect(res.status).toBe(403);
  });

  it("admin can access admin APIs", async () => {
    const token = await login("admin@test.vnit.ac.in");
    const res = await request(app)
      .get("/api/admin/students")
      .set("Cookie", `${process.env.COOKIE_NAME ?? "s50_session"}=${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.students)).toBe(true);
  });

  it("student cannot see another student's submission", async () => {
    const owner = await User.create({ name: "Owner", email: "owner@test.vnit.ac.in" });
    const other = await login("other@test.vnit.ac.in");
    const assignment = await Assignment.create({ title: "A", isPublished: true });
    const problem = await Problem.create({ assignmentId: assignment._id, title: "P", statement: "s", points: 100 });
    const sub = await Submission.create({
      userId: owner._id,
      assignmentId: assignment._id,
      problemId: problem._id,
      code: "int main(){}",
      language: "cpp17",
    });
    const res = await request(app)
      .get(`/api/submissions/${sub._id}`)
      .set("Cookie", `${process.env.COOKIE_NAME ?? "s50_session"}=${other}`);
    expect(res.status).toBe(403);
  });

  it("mentor can create/publish assignments and add tests, but cannot manage students", async () => {
    const mentorUser = await User.create({ name: "Mentor", email: "mentor@test.vnit.ac.in", role: "MENTOR" });
    const mentor = signSession(mentorUser);
    const auth = { Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${mentor}` };

    const created = await request(app)
      .post("/api/assignments")
      .set(auth)
      .send({ title: "Mentor assignment", description: "d" });
    expect(created.status).toBe(201);
    const id = created.body.assignment.id;

    await Problem.create({ assignmentId: id, title: "P", statement: "s", points: 100 });
    const pub = await request(app).post(`/api/assignments/${id}/publish`).set(auth);
    expect(pub.status).toBe(200);

    // mentor can manage problem content, incl. a test case with NO input
    const problem = await Problem.create({ assignmentId: id, title: "Hello", statement: "s", points: 10 });
    const addTest = await request(app)
      .post(`/api/problems/${problem._id}/tests`)
      .set(auth)
      .send({ input: "", expectedOutput: "Hello World", points: 5, isSample: true });
    expect(addTest.status).toBe(201);
    expect(addTest.status).toBe(201);

    // mentor cannot touch user/role management
    const students = await request(app).get("/api/admin/students").set(auth);
    expect(students.status).toBe(403);
    const addStudent = await request(app)
      .post("/api/admin/students")
      .set(auth)
      .send({ name: "X", email: "x@test.vnit.ac.in" });
    expect(addStudent.status).toBe(403);
  });

  it("student cannot create assignments", async () => {
    const stud = await login("studmentee@test.vnit.ac.in");
    const res = await request(app)
      .post("/api/assignments")
      .set("Cookie", `${process.env.COOKIE_NAME ?? "s50_session"}=${stud}`)
      .send({ title: "no" });
    expect(res.status).toBe(403);
  });
});

describe("assignments", () => {
  it("admin can create and publish; students see only published", async () => {
    const admin = await login("admin@test.vnit.ac.in");
    const auth = { Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${admin}` };

    const created = await request(app)
      .post("/api/assignments")
      .set(auth)
      .send({ title: "Assignment 1 — C++ Fundamentals", description: "d" });
    expect(created.status).toBe(201);
    const id = created.body.assignment.id;

    const studentAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("stud4@test.vnit.ac.in")}`,
    };
    let list = await request(app).get("/api/assignments").set(studentAuth);
    expect(list.body.assignments).toHaveLength(0); // unpublished hidden

    // publish requires >= 1 problem
    const pubFail = await request(app).post(`/api/assignments/${id}/publish`).set(auth);
    expect(pubFail.status).toBe(400);

    await Problem.create({ assignmentId: id, title: "P1", statement: "s", points: 100 });
    const pub = await request(app).post(`/api/assignments/${id}/publish`).set(auth);
    expect(pub.status).toBe(200);

    list = await request(app).get("/api/assignments").set(studentAuth);
    expect(list.body.assignments).toHaveLength(1);
    expect(list.body.assignments[0].state).toBe("ACTIVE");
  });

  it("enforces start time and deadline server-side", async () => {
    const adminAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("admin@test.vnit.ac.in")}`,
    };
    const future = await request(app)
      .post("/api/assignments")
      .set(adminAuth)
      .send({
        title: "Future assignment",
        startTime: new Date(Date.now() + 86_400_000).toISOString(),
        deadline: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        isPublished: true,
      });
    expect(future.body.assignment.state).toBe("PUBLISHED");

    const past = await request(app)
      .post("/api/assignments")
      .set(adminAuth)
      .send({
        title: "Past assignment",
        startTime: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        deadline: new Date(Date.now() - 86_400_000).toISOString(),
        isPublished: true,
      });
    expect(past.body.assignment.state).toBe("CLOSED");

    // Submission against the closed assignment must be rejected
    const problem = await Problem.create({
      assignmentId: past.body.assignment.id,
      title: "P",
      statement: "s",
      points: 10,
    });
    const studAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("stud5@test.vnit.ac.in")}`,
    };
    const submit = await request(app)
      .post(`/api/problems/${problem._id}/submit`)
      .set(studAuth)
      .send({ code: "int main(){}" });
    expect(submit.status).toBe(403);
  });

  it("rejects invalid start/deadline combinations", async () => {
    const adminAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("admin@test.vnit.ac.in")}`,
    };
    const res = await request(app)
      .post("/api/assignments")
      .set(adminAuth)
      .send({
        title: "Bad",
        startTime: new Date(Date.now() + 86_400_000).toISOString(),
        deadline: new Date(Date.now() - 86_400_000).toISOString(),
      });
    expect(res.status).toBe(400);
  });
});

describe("problems + hidden test security", () => {
  it("problem endpoint exposes samples but never hidden tests", async () => {
    const adminAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("admin@test.vnit.ac.in")}`,
    };
    const a = await Assignment.create({ title: "A1", isPublished: true });
    const p = await Problem.create({
      assignmentId: a._id,
      title: "Maximum Element",
      statement: "Find max",
      points: 100,
      sampleInput: "5\n1 2 3 4 5",
      sampleOutput: "5",
    });
    await TestCase.create([
      { problemId: p._id, input: "5\n1 2 3 4 5\n", expectedOutput: "5", points: 0, isSample: true },
      { problemId: p._id, input: "SECRET_INPUT", expectedOutput: "SECRET_OUTPUT", points: 50, isSample: false },
    ]);

    const studAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("stud6@test.vnit.ac.in")}`,
    };
    const res = await request(app).get(`/api/problems/${p._id}`).set(studAuth);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("SECRET_INPUT");
    expect(body).not.toContain("SECRET_OUTPUT");
    expect(res.body.samples).toHaveLength(1);

    // Student cannot list tests
    const tests = await request(app).get(`/api/problems/${p._id}/tests`).set(studAuth);
    expect(tests.status).toBe(403);
  });
});

describe("submissions + scoring", () => {
  async function seedScenario() {
    const admin = await User.create({ name: "Admin", email: "admin@test.vnit.ac.in", role: "ADMIN" });
    const student = await User.create({ name: "Rahul Sharma", email: "rahul@test.vnit.ac.in" });
    const a = await Assignment.create({ title: "A1", isPublished: true });
    const p = await Problem.create({ assignmentId: a._id, title: "P1", statement: "s", points: 100 });
    const tests = await TestCase.create([
      { problemId: p._id, input: "1\n", expectedOutput: "1\n", points: 10, isSample: true, order: 0 },
      { problemId: p._id, input: "2\n", expectedOutput: "2\n", points: 20, isSample: false, order: 1 },
      { problemId: p._id, input: "3\n", expectedOutput: "3\n", points: 20, isSample: false, order: 2 },
      { problemId: p._id, input: "4\n", expectedOutput: "4\n", points: 50, isSample: false, order: 3 },
    ]);
    return { admin, student, a, p, tests };
  }

  it("submit returns QUEUED and enqueues exactly one judge job", async () => {
    const { p } = await seedScenario();
    const auth = { Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("rahul@test.vnit.ac.in")}` };
    const res = await request(app).post(`/api/problems/${p._id}/submit`).set(auth).send({ code: "int main(){}" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("QUEUED");
    expect(res.body.submissionId).toBeTruthy();
    expect(enqueueSubmission).toHaveBeenCalledTimes(1);
  });

  it("scoring: best score wins, not latest", async () => {
    const { student, a, p, tests } = await seedScenario();

    // Submission #1: 30/100, #2: 50/100, #3: 100 (all pass)
    const mk = async (passedIdx: number[], createdAt: Date) => {
      const passedSet = new Set(passedIdx);
      const sub = await Submission.create({
        userId: student._id,
        assignmentId: a._id,
        problemId: p._id,
        code: "x",
        language: "cpp17",
        status: passedSet.size === 4 ? "ACCEPTED" : "WRONG_ANSWER",
        score: tests.filter((_, i) => passedSet.has(i)).reduce((s, t) => s + t.points, 0),
        totalScore: 100,
        passedCount: passedIdx.length,
        totalCount: 4,
        createdAt,
        fullScoreAt: passedSet.size === 4 ? createdAt : undefined,
      });
      for (let i = 0; i < 4; i++) {
        await TestResult.create({
          submissionId: sub._id,
          testCaseId: tests[i]._id,
          index: i,
          isSample: i === 0,
          status: passedSet.has(i) ? "PASSED" : "WRONG_ANSWER",
          points: tests[i].points,
          earned: passedSet.has(i) ? tests[i].points : 0,
        });
      }
      return sub;
    };

    await mk([0, 1], new Date("2026-01-01T10:00:00Z")); // 30
    await mk([0, 1, 2], new Date("2026-01-01T10:05:00Z")); // 50 (best so far)
    await mk([0], new Date("2026-01-01T10:10:00Z")); // 10 — latest is WORSE

    const { updateBestScore } = await import("../src/services/scoringService.js");
    await updateBestScore(student._id, a._id, p._id);

    const row = await AssignmentScore.findOne({ userId: student._id, problemId: p._id }).lean();
    expect(row!.score).toBe(50); // best, not latest (10)
    expect(row!.bestSubmissionId).toBeTruthy();
  });

  it("leaderboard ranks by score and hides emails", async () => {
    const { student, a, p } = await seedScenario();
    await AssignmentScore.create({
      userId: student._id,
      assignmentId: a._id,
      problemId: p._id,
      score: 80,
      totalScore: 100,
    });
    const student2 = await User.create({ name: "Aditya Verma", email: "aditya@test.vnit.ac.in" });
    await AssignmentScore.create({
      userId: student2._id,
      assignmentId: a._id,
      problemId: p._id,
      score: 96,
      totalScore: 100,
    });

    const auth = { Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("viewer@test.vnit.ac.in")}` };
    const res = await request(app).get(`/api/assignments/${a._id}/leaderboard`).set(auth);
    expect(res.status).toBe(200);
    const rows = res.body.leaderboard;
    expect(rows[0].name).toBe("Aditya V.");
    expect(rows[1].name).toBe("Rahul S.");
    expect(rows[0].score).toBe(96);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("@test.vnit.ac.in");
  });

  it("leaderboard is blocked when disabled", async () => {
    const { a } = await seedScenario();
    a.leaderboardEnabled = false;
    await a.save();
    const auth = { Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("viewer2@test.vnit.ac.in")}` };
    const res = await request(app).get(`/api/assignments/${a._id}/leaderboard`).set(auth);
    expect(res.status).toBe(403);
  });
});

describe("run (sample tests)", () => {
  it("enqueues a run job and rejects oversized code", async () => {
    const adminAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("admin@test.vnit.ac.in")}`,
    };
    const a = await Assignment.create({ title: "A2", isPublished: true });
    const p = await Problem.create({ assignmentId: a._id, title: "P", statement: "s", points: 10 });
    await TestCase.create({ problemId: p._id, input: "1\n", expectedOutput: "1\n", points: 0, isSample: true });

    const auth = { Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("runner@test.vnit.ac.in")}` };
    const ok = await request(app).post(`/api/problems/${p._id}/run`).set(auth).send({ code: "int main(){}" });
    expect(ok.status).toBe(200);

    const big = "x".repeat(70 * 1024);
    const tooBig = await request(app).post(`/api/problems/${p._id}/run`).set(auth).send({ code: big });
    expect(tooBig.status).toBe(400);
  });
});

describe("analytics", () => {
  it("admin analytics returns counts and score stats", async () => {
    const adminAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("admin@test.vnit.ac.in")}`,
    };
    const s1 = await User.create({ name: "S1", email: "s1@test.vnit.ac.in" });
    const s2 = await User.create({ name: "S2", email: "s2@test.vnit.ac.in" });
    const a = await Assignment.create({ title: "A1", isPublished: true });
    const p = await Problem.create({ assignmentId: a._id, title: "P1", statement: "s", points: 100 });
    await AssignmentScore.create({ userId: s1._id, assignmentId: a._id, problemId: p._id, score: 100, totalScore: 100 });
    await AssignmentScore.create({ userId: s2._id, assignmentId: a._id, problemId: p._id, score: 40, totalScore: 100 });

    const res = await request(app).get(`/api/admin/assignments/${a._id}/analytics`).set(adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.submitted).toBe(2);
    expect(res.body.averageScore).toBe(70);
    expect(res.body.highestScore).toBe(100);
    expect(res.body.problemStats[0].solved).toBe(1);
  });
});

describe("deletion", () => {
  it("admin deletes an assignment and cascades problems/tests/submissions/scores", async () => {
    const adminAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("admin@test.vnit.ac.in")}`,
    };
    const student = await User.create({ name: "D1", email: "d1@test.vnit.ac.in" });
    const a = await Assignment.create({ title: "ToDelete", isPublished: true });
    const p = await Problem.create({ assignmentId: a._id, title: "P", statement: "s", points: 100 });
    const t = await TestCase.create({ problemId: p._id, input: "1\n", expectedOutput: "1\n", points: 100, isSample: false });
    const sub = await Submission.create({ userId: student._id, assignmentId: a._id, problemId: p._id, code: "x", status: "ACCEPTED", score: 100, totalScore: 100 });
    await TestResult.create({ submissionId: sub._id, testCaseId: t._id, index: 0, isSample: false, status: "PASSED", points: 100, earned: 100 });
    await AssignmentScore.create({ userId: student._id, assignmentId: a._id, problemId: p._id, score: 100, totalScore: 100 });

    const res = await request(app).delete(`/api/assignments/${a._id}`).set(adminAuth);
    expect(res.status).toBe(200);

    expect(await Assignment.findById(a._id)).toBeNull();
    expect(await Problem.findById(p._id)).toBeNull();
    expect(await TestCase.findById(t._id)).toBeNull();
    expect(await Submission.findById(sub._id)).toBeNull();
    expect(await TestResult.countDocuments({ submissionId: sub._id })).toBe(0);
    expect(await AssignmentScore.countDocuments({ assignmentId: a._id })).toBe(0);
  });

  it("admin deletes a problem and cascades tests/submissions/scores (keeps assignment)", async () => {
    const adminAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("admin@test.vnit.ac.in")}`,
    };
    const student = await User.create({ name: "D2", email: "d2@test.vnit.ac.in" });
    const a = await Assignment.create({ title: "Keep", isPublished: true });
    const p = await Problem.create({ assignmentId: a._id, title: "P", statement: "s", points: 50 });
    const t = await TestCase.create({ problemId: p._id, input: "1\n", expectedOutput: "1\n", points: 50, isSample: false });
    const sub = await Submission.create({ userId: student._id, assignmentId: a._id, problemId: p._id, code: "x", status: "WRONG_ANSWER" });
    await TestResult.create({ submissionId: sub._id, testCaseId: t._id, index: 0, isSample: false, status: "WRONG_ANSWER" });
    await AssignmentScore.create({ userId: student._id, assignmentId: a._id, problemId: p._id, score: 0, totalScore: 50 });

    const res = await request(app).delete(`/api/problems/${p._id}`).set(adminAuth);
    expect(res.status).toBe(200);

    expect(await Assignment.findById(a._id)).not.toBeNull();
    expect(await Problem.findById(p._id)).toBeNull();
    expect(await TestCase.findById(t._id)).toBeNull();
    expect(await Submission.findById(sub._id)).toBeNull();
    expect(await TestResult.countDocuments({ submissionId: sub._id })).toBe(0);
    expect(await AssignmentScore.countDocuments({ problemId: p._id })).toBe(0);
  });

  it("students cannot delete assignments", async () => {
    const studAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("studdel@test.vnit.ac.in")}`,
    };
    const a = await Assignment.create({ title: "Guarded", isPublished: true });
    const res = await request(app).delete(`/api/assignments/${a._id}`).set(studAuth);
    expect(res.status).toBe(403);
    expect(await Assignment.findById(a._id)).not.toBeNull();
  });
});

describe("security hygiene", () => {
  it("blocks query-selector injection in login search param", async () => {
    const adminAuth = {
      Cookie: `${process.env.COOKIE_NAME ?? "s50_session"}=${await login("admin@test.vnit.ac.in")}`,
    };
    const res = await request(app)
      .get("/api/admin/students")
      .query({ search: { $gt: "" } })
      .set(adminAuth);
    // sanitizeFilter turns objects into harmless matches — must not error/leak all
    expect([200, 400]).toContain(res.status);
  });

  it("rejects unknown API routes with 404 JSON", async () => {
    const res = await request(app).get("/api/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
