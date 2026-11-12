import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./components/icons.tsx";
import { Wordmark } from "./components/logo.tsx";
import { PwaBanner } from "./components/pwa-banner.tsx";
import { IconButton } from "./components/ui.tsx";
import { useSettings } from "./hooks/use-settings.ts";
import { accountQuery, actions, syncQuery } from "./queries.ts";

const themeKey = "tupu:theme";
const darkQuery = "(prefers-color-scheme: dark)";

const subscribeToScheme = (listener: () => void) => {
  const media = window.matchMedia(darkQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};

const usePrefersDark = () =>
  useSyncExternalStore(subscribeToScheme, () => window.matchMedia(darkQuery).matches);

const Devtools = import.meta.env.DEV
  ? lazy(() =>
      Promise.all([
        import("@tanstack/react-router-devtools"),
        import("@tanstack/react-query-devtools"),
      ]).then(([router, query]) => ({
        default: () => (
          <>
            <router.TanStackRouterDevtools position="bottom-right" />
            <query.ReactQueryDevtools buttonPosition="bottom-left" />
          </>
        ),
      })),
    )
  : () => null;

const useTheme = () => {
  const settings = useSettings();
  const prefersDark = usePrefersDark();
  const dark = settings.theme === "dark" || (settings.theme === "system" && prefersDark);
  useEffect(() => {
    actions.configureSound({ enabled: settings.sound, volume: settings.volume });
  }, [settings.sound, settings.volume]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document
      .querySelector("meta[name=theme-color]")
      ?.setAttribute("content", dark ? "#1d1a16" : "#f3ecdc");
    document.documentElement.classList.toggle("reduce-motion", !settings.animations);
    try {
      localStorage.setItem(themeKey, settings.theme);
    } catch {
      // Storage can be unavailable; the theme still applies for this visit.
    }
  }, [dark, settings.theme, settings.animations]);
  return { settings, dark };
};

type NavPath = "/" | "/archive" | "/stats" | "/leaderboard" | "/rules" | "/settings";

const navItems: ReadonlyArray<{
  readonly to: NavPath;
  readonly icon: IconName;
  readonly label: string;
}> = [
  { to: "/archive", icon: "calendar", label: "Archive" },
  { to: "/stats", icon: "chart", label: "Stats" },
  { to: "/leaderboard", icon: "trophy", label: "Leaderboard" },
  { to: "/rules", icon: "book", label: "How to play" },
  { to: "/settings", icon: "gear", label: "Settings" },
];

const focusedPaths = ["/play/", "/replay/", "/tutorial", "/login"];

const SyncBadge = () => {
  const sync = useQuery(syncQuery).data;
  if (!sync) return null;
  const { status } = sync.state;
  const offline = status === "offline" || status === "expired";
  const label =
    status === "expired"
      ? "Session expired: sign in again to sync"
      : offline
        ? `Offline${sync.pending ? `: ${sync.pending} change${sync.pending > 1 ? "s" : ""} waiting` : ""}`
        : status === "syncing"
          ? "Syncing"
          : sync.pending
            ? "Waiting to sync"
            : "All games synced";
  return (
    <Link
      to={status === "expired" ? "/login" : "/settings"}
      aria-label={label}
      title={label}
      className={`flex size-10 items-center justify-center rounded-xl border-[2.5px] border-ink text-lg shadow-hard-sm ${status === "expired" ? "bg-danger text-white" : offline ? "bg-paper-deep" : "bg-card"} ${status === "syncing" ? "animate-pulse" : ""}`}
    >
      <Icon name={offline ? "cloudOff" : "cloud"} />
    </Link>
  );
};

export const AppShell = () => {
  const { settings, dark } = useTheme();
  const updateSettings = useMutation({ mutationFn: actions.updateSettings });
  const account = useQuery(accountQuery).data;
  const pathname = useLocation({ select: (location) => location.pathname });
  const focused = focusedPaths.some((path) => pathname.startsWith(path));
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b-[2.5px] border-ink bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:py-3">
          <Link to="/" aria-label="Tupu home">
            <Wordmark />
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Main">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-1.5 rounded-lg border-2 border-transparent px-2.5 py-1.5 text-sm font-bold hover:border-ink"
                activeProps={{ className: "border-ink! bg-marker" }}
              >
                <Icon name={item.icon} /> {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-2">
            {account ? (
              <Link
                to="/settings"
                className="hidden max-w-36 items-center gap-1.5 truncate rounded-full border-2 border-ink bg-card px-3 py-1 text-sm font-bold sm:flex"
              >
                <Icon name="user" /> {account.name}
              </Link>
            ) : pathname === "/login" ? null : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-marker px-3 py-1 text-sm font-bold whitespace-nowrap"
              >
                <Icon name="user" /> Sign in
              </Link>
            )}
            {account && <SyncBadge />}
            <IconButton
              icon={dark ? "sun" : "moon"}
              label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
              className="size-10 text-lg"
              onClick={() => updateSettings.mutate({ theme: dark ? "light" : "dark" })}
            />
            <IconButton
              icon={settings.sound ? "soundOn" : "soundOff"}
              label={settings.sound ? "Mute sounds" : "Turn sounds on"}
              className="size-10 text-lg"
              onClick={() => updateSettings.mutate({ sound: !settings.sound })}
            />
          </div>
        </div>
      </header>
      <PwaBanner />
      <main className={`flex-1 px-3 pt-4 sm:px-4 sm:pt-6 md:pb-12 ${focused ? "pb-10" : "pb-28"}`}>
        <Outlet />
      </main>
      <footer className="hidden px-4 pb-8 text-center text-sm text-ink-soft md:block">
        {account
          ? "Your games live on this device and sync to your account whenever you are online."
          : "Your games live on this device. Sign in to sync them and join the leaderboards."}
        <span className="mt-1 block">For Tupu, a very good cat. 🐾</span>
      </footer>
      {!focused && (
        <nav
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-around rounded-2xl border-[2.5px] border-ink bg-card p-1.5 shadow-hard md:hidden"
          aria-label="Main"
        >
          {[{ to: "/" as const, icon: "grid" as const, label: "Play" }, ...navItems].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              activeOptions={{ exact: item.to === "/" }}
              className="flex flex-1 flex-col items-center rounded-xl py-1.5 text-xl"
              activeProps={{ className: "bg-marker" }}
            >
              <Icon name={item.icon} />
              <span className="text-[10px] font-bold">{item.label.split(" ")[0]}</span>
            </Link>
          ))}
        </nav>
      )}
      <Suspense fallback={null}>
        <Devtools />
      </Suspense>
    </div>
  );
};
