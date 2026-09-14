/**
 * Per-job scratch directory lifecycle.
 *
 * The sandbox runs as an unprivileged uid (1500:1500) and bind-mounts each job
 * dir at /work, so those dirs must be writable by "other". We force the
 * permission bits with an explicit chmod AFTER mkdir because fs.mkdir's mode
 * argument is still masked by the host process's umask — under a typical
 * umask 022 a 0o777 request silently becomes 0755, which is exactly what makes
 * /work/bin unwritable for uid 1500.
 *
 * Only per-job dirs are opened up. The shared root stays restricted: we create
 * it 0700 when absent and never widen an existing root.
 */
import fs from "node:fs/promises";
import path from "node:path";

/** Per-job dir mode: rwx for everyone. The sandbox uid (1500:1500) is neither
 *  the owner nor in a matching group on the host, so it needs "other" bits. */
const JOB_DIR_MODE = 0o777;

/** Mode for the shared scratch root when we have to create it. Never
 *  group/other-writable. */
const WORK_ROOT_MODE = 0o700;

/** Create (or repair) the per-job tree under `workRoot` and return the job dir.
 *  The returned dir and its `bin` subdir are guaranteed world-writable,
 *  independently of the host umask.
 *  @throws if the directory somehow ends up NOT writable by the sandbox uid —
 *    surfaces a clear diagnostic instead of a cryptic linker error later. */
export async function ensureJobWorkDir(workRoot: string, jobName: string): Promise<string> {
  await fs.mkdir(workRoot, { recursive: true, mode: WORK_ROOT_MODE });
  // If the root already exists its mode is left untouched (owned by the judge
  // user). If we just created it, it is 0700 mod umask — never widened here.

  const workDir = path.join(workRoot, jobName);
  await fs.mkdir(workDir, { recursive: true, mode: JOB_DIR_MODE });
  await fs.chmod(workDir, JOB_DIR_MODE); // explicit; mkdir mode is umask-masked

  const binDir = path.join(workDir, "bin");
  await fs.mkdir(binDir, { recursive: true, mode: JOB_DIR_MODE });
  await fs.chmod(binDir, JOB_DIR_MODE);

  for (const d of [workDir, binDir]) {
    const st = await fs.stat(d);
    if ((st.mode & 0o002) === 0) {
      throw new Error(
        `job work dir ${d} is not writable by the sandbox uid 1500:1500 ` +
          `(mode=${(st.mode & 0o777).toString(8)}). Expected world-writable ` +
          `(0777) per-job dir — the host umask or a pre-existing restrictive ` +
          `mount is interfering with chmod.`,
      );
    }
  }

  return workDir;
}