import { AssignmentScore, Problem, Submission, User } from "../models/index.js";
import type { AssignmentDoc } from "../models/Assignment.js";
import { effectiveState } from "../models/Assignment.js";
import { forbidden } from "../utils/errors.js";

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string; // first name + last initial only — no emails
  score: number;
  totalScore: number;
  solvedCount: number;
  problemCount: number;
}

/**
 * Assignment leaderboard. Only names (masked) and scores are exposed — never
 * email or any private account info. Ranking: score desc; tie-break
 * configurable per assignment (default "score": stable by userId; "earliest":
 * earlier achievement of the score ranks first).
 */
export async function getLeaderboard(assignment: AssignmentDoc): Promise<LeaderboardRow[]> {
  if (!assignment.leaderboardEnabled) {
    throw forbidden("The leaderboard is disabled for this assignment.");
  }
  const problems = await Problem.find({ assignmentId: assignment._id })
    .select("points order")
    .sort({ order: 1 })
    .lean();
  const problemCount = problems.length;
  const totalScore = problems.reduce((s, p) => s + p.points, 0);

  const rows = await AssignmentScore.find({ assignmentId: assignment._id }).lean();

  // Aggregate per user
  const byUser = new Map<string, { score: number; solved: number; earliest: number }>();
  for (const r of rows) {
    const key = String(r.userId);
    const cur = byUser.get(key) ?? { score: 0, solved: 0, earliest: Number.MAX_SAFE_INTEGER };
    cur.score += r.score;
    if (r.totalScore > 0 && r.score >= r.totalScore) cur.solved += 1;
    cur.earliest = Math.min(cur.earliest, new Date(r.achievedAt ?? r.createdAt ?? Date.now()).getTime());
    byUser.set(key, cur);
  }

  const userIds = [...byUser.keys()];
  const users = await User.find({ _id: { $in: userIds }, disabled: false })
    .select("name")
    .lean();
  const nameById = new Map(users.map((u) => [String(u._id), maskName(u.name)]));

  const entries = [...byUser.entries()]
    .filter(([uid]) => nameById.has(uid))
    .map(([uid, v]) => ({ userId: uid, ...v }));

  const tieBreak = (assignment as { tieBreak?: string }).tieBreak ?? "score";
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (tieBreak === "earliest") return a.earliest - b.earliest;
    return a.userId < b.userId ? -1 : 1;
  });

  return entries.map((e, i) => ({
    rank: i + 1,
    userId: e.userId,
    name: nameById.get(e.userId) ?? "Student",
    score: e.score,
    totalScore,
    solvedCount: e.solved,
    problemCount,
  }));
}

/** "Rahul Sharma" -> "Rahul S." — never show full identity or email. */
function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0] ?? ""}.`;
}

export { effectiveState };
