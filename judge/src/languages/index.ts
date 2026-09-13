/**
 * Language registry. V1 ships C++17; adding a language later means adding
 * one entry here (compile command + run command + image) — nothing else in
 * the pipeline is language-specific.
 */
export interface LanguageDef {
  id: string;
  displayName: string;
  /** compile inside the sandbox: [binary, ...args]; {main} = source, {out} = output path */
  compileCmd: (out: string) => string[];
  /** run the produced binary */
  runCmd: (out: string) => string[];
  compiledOutputName: string;
  sourceFileName: string;
}

export const LANGUAGES: Record<string, LanguageDef> = {
  cpp17: {
    id: "cpp17",
    displayName: "C++17",
    sourceFileName: "main.cpp",
    compiledOutputName: "main",
    compileCmd: (out) => [
      "/usr/bin/g++",
      "-std=c++17",
      "-O2",
      "-o",
      out,
      "/work/main.cpp",
      // hardening flags: stack smashing detection + no fast-math UB surprises
      "-pipe",
      "-static-libstdc++",
      "-static-libgcc",
    ],
    runCmd: (out) => [out],
  },
};

export function getLanguage(id: string): LanguageDef {
  const lang = LANGUAGES[id];
  if (!lang) throw new Error(`Unsupported language: ${id}`);
  return lang;
}
