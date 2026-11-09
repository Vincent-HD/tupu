import { useSyncExternalStore } from "react";

interface InstallPrompt extends Event {
  readonly prompt: () => Promise<void>;
}

interface PwaState {
  readonly updateReady: boolean;
  readonly offlineReady: boolean;
  readonly canInstall: boolean;
  readonly installed: boolean;
}

let state: PwaState = {
  updateReady: false,
  offlineReady: false,
  canInstall: false,
  installed:
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
};
let waiting: ServiceWorker | null = null;
let installPrompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();

const update = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};

const isInstallPrompt = (event: Event): event is InstallPrompt =>
  "prompt" in event && typeof event.prompt === "function";

const trackWaiting = (registration: ServiceWorkerRegistration) => {
  if (registration.waiting && navigator.serviceWorker.controller) {
    waiting = registration.waiting;
    update({ updateReady: true });
  }
};

export const registerPwa = () => {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (!isInstallPrompt(event)) return;
    installPrompt = event;
    update({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    update({ canInstall: false, installed: true });
  });
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !waiting) return;
    reloading = true;
    window.location.reload();
  });
  void navigator.serviceWorker.register("/sw.js").then((registration) => {
    trackWaiting(registration);
    if (registration.active) update({ offlineReady: true });
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed") {
          if (navigator.serviceWorker.controller) trackWaiting(registration);
          else update({ offlineReady: true });
        }
      });
    });
    const check = () => void registration.update().catch(() => undefined);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) check();
    });
  });
};

export const applyUpdate = () => waiting?.postMessage("skip-waiting");

export const promptInstall = async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  update({ canInstall: false });
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePwa = () => useSyncExternalStore(subscribe, () => state);

const onlineSubscribe = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};

export const useOnline = () => useSyncExternalStore(onlineSubscribe, () => navigator.onLine);
