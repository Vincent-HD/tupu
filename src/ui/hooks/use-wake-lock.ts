import { useEffect } from "react";

export const useWakeLock = (active: boolean) => {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | undefined;
    let cancelled = false;
    const acquire = () =>
      navigator.wakeLock.request("screen").then(
        (lock) => {
          if (cancelled) void lock.release();
          else sentinel = lock;
        },
        () => undefined,
      );
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible" && sentinel?.released !== false) void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, [active]);
};
