import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureJobWorkDir } from "../src/workdir.js";

/**
 * Regression: fs.mkdir's `mode` is masked by the host umask (e.g. 022 turns a
 * requested 0o777 into 0755), which made /work and /work/bin unwritable for
 * the sandbox uid 1500:1500 ("cannot open output file /work/bin/main:
 * Permission denied"). The helper must chmod per-job dirs explicitly so the
 * sandbox can always write, while the root stays restricted.
 */
describe("job work dir permission boundary", () => {
  it("makes per-job dirs world-writable even under a restrictive umask, keeping the root restricted", async () => {
    const prev = process.umask(0o077); // simulate stricter-than-default host
    let root = "";
    try {
      root = await fs.mkdtemp(path.join(os.tmpdir(), "s50-wd-"));
      const jobDir = await ensureJobWorkDir(root, "job-smoke");

      const jobStat = await fs.stat(jobDir);
      const binStat = await fs.stat(path.join(jobDir, "bin"));
      const rootStat = await fs.stat(root);

      // sandbox uid writes via "other" bits -> rwx for all
      expect(jobStat.mode & 0o777).toBe(0o777);
      expect(binStat.mode & 0o777).toBe(0o777);
      // host parent must stay restricted: not group/other-writable
      expect(rootStat.mode & 0o022).toBe(0);

      // layout matches what the judge expects
      expect((await fs.stat(path.join(jobDir, "bin"))).isDirectory()).toBe(true);
    } finally {
      process.umask(prev);
      if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it("leaves an existing root's mode untouched while still opening the job dir", async () => {
    const prev = process.umask(0o002);
    let root = "";
    try {
      root = await fs.mkdtemp(path.join(os.tmpdir(), "s50-wd-"));
      await fs.rmdir(root); // remove so we can create with our own mode below
      await fs.mkdir(root, { mode: 0o750 });
      await fs.chmod(root, 0o750); // explicit: a pre-provisioned restricted root

      const jobDir = await ensureJobWorkDir(root, "job-existing-root");

      expect((await fs.stat(root)).mode & 0o777).toBe(0o750); // untouched
      expect((await fs.stat(jobDir)).mode & 0o777).toBe(0o777);
      expect((await fs.stat(path.join(jobDir, "bin"))).mode & 0o777).toBe(0o777);
    } finally {
      process.umask(prev);
      if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});