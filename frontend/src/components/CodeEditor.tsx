import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { LANGUAGE_LABELS, TO_MONACO, type LanguageId } from "../lib/languages";

const DRAFT_PREFIX = "s50_draft_";

function draftKey(problemId: string, language: LanguageId) {
  return `${DRAFT_PREFIX}${problemId}_${language}`;
}

export function getDraft(problemId: string, language: LanguageId): string | null {
  const v = localStorage.getItem(draftKey(problemId, language));
  return v === null ? null : v;
}

export function clearDraft(problemId: string, language: LanguageId) {
  localStorage.removeItem(draftKey(problemId, language));
}

interface CodeEditorProps {
  problemId: string;
  languageId: LanguageId;
  starterCode: string;
  value: string;
  onChange: (code: string) => void;
  height?: string;
}

export default function CodeEditor({
  problemId,
  languageId,
  starterCode,
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
        localStorage.setItem(draftKey(problemId, languageId), code);
      }
    },
    [onChange, problemId, languageId]
  );

  const reset = useCallback(() => {
    onChange(starterCode);
    setDirty(false);
    localStorage.removeItem(draftKey(problemId, languageId));
  }, [onChange, starterCode, problemId, languageId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-1.5">
        <span className="text-xs text-slate-500">
          {LANGUAGE_LABELS[languageId]}
          {dirty && <span className="ml-2 text-brand-400">• draft autosaved</span>}
        </span>
        <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 transition">
          Reset
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height={height}
          language={TO_MONACO[languageId]}
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
