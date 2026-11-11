import { useEffect, useState } from "react";
import { applyUpdate, useOnline, usePwa } from "../../pwa/pwa.ts";
import { Icon } from "./icons.tsx";
import { Button } from "./ui.tsx";

const offlineNoticeKey = "tupu:offline-ready-seen";

const readFlag = () => {
  try {
    return localStorage.getItem(offlineNoticeKey) === "1";
  } catch {
    return true;
  }
};

export const PwaBanner = () => {
  const pwa = usePwa();
  const online = useOnline();
  const [offlineSeen, setOfflineSeen] = useState(readFlag);

  useEffect(() => {
    if (!pwa.offlineReady || offlineSeen) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(offlineNoticeKey, "1");
      } catch {
        // Storage can be unavailable; the notice simply shows again next time.
      }
      setOfflineSeen(true);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [pwa.offlineReady, offlineSeen]);

  const dismiss = () => {
    try {
      localStorage.setItem(offlineNoticeKey, "1");
    } catch {
      // Storage can be unavailable; hiding it for this visit is enough.
    }
    setOfflineSeen(true);
  };

  const base =
    "fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.25rem)] z-40 mx-auto flex max-w-xl animate-float-in items-center gap-3 rounded-xl border-[2.5px] border-ink px-3 py-2 font-bold shadow-hard";
  if (pwa.updateReady)
    return (
      <div className={`${base} bg-marker`} role="status">
        <Icon name="sparkle" className="shrink-0 text-xl" />
        <span className="flex-1 text-sm">A fresh version is ready. Your progress is saved.</span>
        <Button size="sm" tone="ink" onClick={applyUpdate}>
          Reload
        </Button>
      </div>
    );
  if (!online)
    return (
      <div className={`${base} bg-paper-deep`} role="status">
        <Icon name="check" className="shrink-0 text-xl" />
        <span className="text-sm">
          Offline. Keep playing: your games sync as soon as you are back online.
        </span>
      </div>
    );
  if (pwa.offlineReady && !offlineSeen)
    return (
      <button
        type="button"
        onClick={dismiss}
        className={`${base} cursor-pointer bg-mint text-left`}
      >
        <Icon name="download" className="shrink-0 text-xl" />
        <span className="flex-1 text-sm">
          Ready to play offline. Your games sync whenever you reconnect.
        </span>
        <Icon name="x" className="shrink-0" />
      </button>
    );
  return null;
};
