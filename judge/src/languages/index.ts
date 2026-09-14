/**
 * Language registry. Each language = compiler + runtime inside the sandbox
 * image. The rest of the pipeline (judge.ts, worker.ts, dockerRunner.ts) is
 * language-agnostic and only ever consumes these definitions.
 */
export interface LanguageDef {
  id: string;
  displayName: string;
  /** compile inside the sandbox: (outputPath, sourcePath) -> [binary, ...args] */
  compileCmd: (out: string, source: string) => string[];
  /** run the produced binary: (binaryPath, limits) -> [binary, ...args] */
  runCmd: (out: string, opts: { memoryLimitMb: number }) => string[];
  compiledOutputName: string;
  sourceFileName: string;
}

/**
 * JVM heap ceiling for Java: a fraction of the container memory limit so the
 * heap + JVM native/metaspace/threads all fit, leaving room to report the
 * problem's real memory limit instead of thrashing the sandbox.
 */
function heapMbFor(memoryLimitMb: number): number {
  return Math.max(32, Math.floor(memoryLimitMb * 0.85));
}

export const LANGUAGES: Record<string, LanguageDef> = {
  c17: {
    id: "c17",
    displayName: "C",
    sourceFileName: "main.c",
    compiledOutputName: "main",
    compileCmd: (out, source) => [
      "/usr/bin/gcc",
      "-std=c17",
      "-O2",
      "-o",
      out,
      source,
      "-pipe",
      "-static-libgcc",
    ],
    runCmd: (out) => [out],
  },
  cpp17: {
    id: "cpp17",
    displayName: "C++17",
    sourceFileName: "main.cpp",
    compiledOutputName: "main",
    compileCmd: (out, source) => [
      "/usr/bin/g++",
      "-std=c++17",
      "-O2",
      "-o",
      out,
      source,
      // hardening flags: stack smashing detection + no fast-math UB surprises
      "-pipe",
      "-static-libstdc++",
      "-static-libgcc",
    ],
    runCmd: (out) => [out],
  },
  java17: {
    id: "java17",
    displayName: "Java 17",
    sourceFileName: "Main.java",
    compiledOutputName: "Main",
    compileCmd: (_out, source) => [
      "/usr/bin/javac",
      "-encoding",
      "UTF-8",
      "-d",
      "/work/bin",
      source,
    ],
    runCmd: (_out, opts) => [
      "/usr/bin/java",
      `-Xmx${heapMbFor(opts.memoryLimitMb)}m`,
      "-Xss8m",
      // The sandbox rootfs is read-only; direct scratch to /work + /tmp.
      "-Djava.io.tmpdir=/tmp",
      "-Duser.home=/work",
      "-cp",
      "/work/bin",
      "Main",
    ],
  },
};

export function getLanguage(id: string): LanguageDef {
  const lang = LANGUAGES[id];
  if (!lang) throw new Error(`Unsupported language: ${id}`);
  return lang;
}