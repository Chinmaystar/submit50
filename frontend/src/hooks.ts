import { useCallback, useEffect, useRef, useState } from "react";

/** Poll an async getter while `active`. Stops on unmount or deactivation. */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, active = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);

  const tick = useCallback(async () => {
    try {
      const d = await fnRef.current();
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(String(e));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!active) return;
    void tick();
    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [active, intervalMs, tick]);

  return { data, error, refresh: tick };
}

/** Countdown to a target time; updates every second. */
export function useCountdown(target: string | null): { text: string; overdue: boolean } {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return { text: "—", overdue: false };
  const end = new Date(target).getTime();
  const diff = end - now;
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const text = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  return { text: overdue ? `${text} ago` : text, overdue };
}

/** Debounced value (for draft autosave). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
