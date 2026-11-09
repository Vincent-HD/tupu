import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useEffect } from "react";
import { configureSoundAtom, currentPlayerAtom, updateSettingsAtom } from "./atoms.ts";
import { Icon, type IconName } from "./components/icons.tsx";
import { Wordmark } from "./components/logo.tsx";
import { PwaBanner } from "./components/pwa-banner.tsx";
import { IconButton } from "./components/ui.tsx";
import { useSettings } from "./hooks/use-settings.ts";
import { ArchivePage } from "./pages/archive-page.tsx";
import { CustomPage } from "./pages/custom-page.tsx";
import { HomePage } from "./pages/home-page.tsx";
import { LeaderboardPage } from "./pages/leaderboard-page.tsx";
import { PlayPage } from "./pages/play-page.tsx";
import { ReplayPage } from "./pages/replay-page.tsx";
import { RulesPage } from "./pages/rules-page.tsx";
import { SettingsPage } from "./pages/settings-page.tsx";
import { StatsPage } from "./pages/stats-page.tsx";
import { TutorialPage } from "./pages/tutorial-page.tsx";
import { href, useRoute, type Route } from "./router.ts";

const themeKey = "tupu:theme";

const useTheme = () => {
  const settings = useSettings();
  const configureSound = useAtomSet(configureSoundAtom);
  useEffect(() => {
    configureSound({ enabled: settings.sound, volume: settings.volume });
  }, [settings.sound, settings.volume, configureSound]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && media.matches);
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
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme, settings.animations]);
  return settings;
};

const navItems: ReadonlyArray<{
  readonly route: Route;
  readonly icon: IconName;
  readonly label: string;
}> = [
  { route: { page: "archive" }, icon: "calendar", label: "Archive" },
  { route: { page: "stats" }, icon: "chart", label: "Stats" },
  { route: { page: "leaderboard" }, icon: "trophy", label: "Leaderboard" },
  { route: { page: "rules" }, icon: "book", label: "How to play" },
  { route: { page: "settings" }, icon: "gear", label: "Settings" },
];

const Page = ({ route }: { route: Route }) => {
  switch (route.page) {
    case "home":
      return <HomePage />;
    case "play":
      return <PlayPage id={route.id} />;
    case "replay":
      return <ReplayPage id={route.id} />;
    case "custom":
      return <CustomPage />;
    case "archive":
      return <ArchivePage />;
    case "stats":
      return <StatsPage />;
    case "leaderboard":
      return <LeaderboardPage />;
    case "settings":
      return <SettingsPage />;
    case "rules":
      return <RulesPage />;
    case "tutorial":
      return <TutorialPage />;
  }
};

export const App = () => {
  const route = useRoute();
  const settings = useTheme();
  const update = useAtomSet(updateSettingsAtom);
  const player = AsyncResult.getOrElse(useAtomValue(currentPlayerAtom), () => undefined);
  const focused = route.page === "play" || route.page === "replay" || route.page === "tutorial";
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b-[2.5px] border-ink bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:py-3">
          <a href={href({ page: "home" })} aria-label="Tupu home">
            <Wordmark />
          </a>
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Main">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={href(item.route)}
                aria-current={route.page === item.route.page ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-sm font-bold ${route.page === item.route.page ? "border-ink bg-marker" : "border-transparent hover:border-ink"}`}
              >
                <Icon name={item.icon} /> {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-2">
            {player && (
              <a
                href={href({ page: "leaderboard" })}
                className="hidden max-w-36 items-center gap-1.5 truncate rounded-full border-2 border-ink bg-card px-3 py-1 text-sm font-bold sm:flex"
              >
                <Icon name="user" /> {player.name}
              </a>
            )}
            <IconButton
              icon={settings.sound ? "soundOn" : "soundOff"}
              label={settings.sound ? "Mute sounds" : "Turn sounds on"}
              className="size-10 text-lg"
              onClick={() => update({ sound: !settings.sound })}
            />
          </div>
        </div>
      </header>
      <PwaBanner />
      <main className={`flex-1 px-3 pt-4 sm:px-4 sm:pt-6 md:pb-12 ${focused ? "pb-10" : "pb-28"}`}>
        <Page route={route} />
      </main>
      <footer className="hidden px-4 pb-8 text-center text-sm text-ink-soft md:block">
        Local-first: your puzzles, stats and players live in a SQLite file inside this browser.
        <span className="mt-1 block">For Tupu, a very good cat. 🐾</span>
      </footer>
      {!focused && (
        <nav
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-around rounded-2xl border-[2.5px] border-ink bg-card p-1.5 shadow-hard md:hidden"
          aria-label="Main"
        >
          {[
            { route: { page: "home" } as const, icon: "grid" as const, label: "Play" },
            ...navItems,
          ].map((item) => (
            <a
              key={item.label}
              href={href(item.route)}
              aria-label={item.label}
              className={`flex flex-1 flex-col items-center rounded-xl py-1.5 text-xl ${route.page === item.route.page ? "bg-marker" : ""}`}
            >
              <Icon name={item.icon} />
              <span className="text-[10px] font-bold">{item.label.split(" ")[0]}</span>
            </a>
          ))}
        </nav>
      )}
    </div>
  );
};
