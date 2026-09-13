import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

const DRAFT_PREFIX = "s50_draft_";

function draftKey(problemId: string) {
  return `${DRAFT_PREFIX}${problemId}`;
}

export function getDraft(problemId: string): string | null {
  const v = localStorage.getItem(draftKey(problemId));
  return v === null ? null : v;
}

export function clearDraft(problemId: string) {
  localStorage.removeItem(draftKey(problemId));
}

interface CodeEditorProps {
  problemId: string;
  starterCode: string;
  language?: string;
  value: string;
  onChange: (code: string) => void;
  height?: string;
}

export default function CodeEditor({
  problemId,
  starterCode,
  language = "cpp",
  value,
  onChange,
  height = "100%",
}: CodeEditorProps) {
  const [dirty, setDirty] = useState(false);
  const savedRef = useRef(value);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    savedRef.current = value;
  }, [value]);

  const handleChange = useCallback(
    (v: string | undefined) => {
      const code = v ?? "";
      onChange(code);
      if (code !== savedRef.current) {
        setDirty(true);
        localStorage.setItem(draftKey(problemId), code);
      }
    },
    [onChange, problemId]
  );

  const reset = useCallback(() => {
    onChange(starterCode);
    setDirty(false);
    localStorage.removeItem(draftKey(problemId));
  }, [onChange, starterCode, problemId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-1.5">
        <span className="text-xs text-slate-500">
          {language.toUpperCase()}
          {dirty && <span className="ml-2 text-brand-400">• draft autosaved</span>}
        </span>
        <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 transition">
          Reset
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height={height}
          language={language}
          theme="vs-dark"
          value={value}
          onChange={handleChange}
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: "on",
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}
