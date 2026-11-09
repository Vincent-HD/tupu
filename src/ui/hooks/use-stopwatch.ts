import { useCallback, useEffect, useRef, useState } from "react";

export const useStopwatch = (input: { readonly initialMs: number; readonly running: boolean }) => {
  const base = useRef(input.initialMs);
  const startedAt = useRef<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!input.running) return;
    startedAt.current = performance.now();
    const interval = window.setInterval(() => setTick((tick) => tick + 1), 250);
    return () => {
      window.clearInterval(interval);
      if (startedAt.current !== null) base.current += performance.now() - startedAt.current;
      startedAt.current = null;
    };
  }, [input.running]);

  const read = useCallback(
    () => base.current + (startedAt.current === null ? 0 : performance.now() - startedAt.current),
    [],
  );
  return read;
};

export const usePageVisible = () => {
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
};
