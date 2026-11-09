import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useRef, useState } from "react";
import type { Settings } from "../../services/settings.ts";
import {
  currentPlayerAtom,
  exportBackupAtom,
  renamePlayerAtom,
  restoreBackupAtom,
  updateSettingsAtom,
} from "../atoms.ts";
import { Button, Card, IconButton, Segmented, SectionTitle, Toggle } from "../components/ui.tsx";
import { useSettings } from "../hooks/use-settings.ts";
import { useSound } from "../hooks/use-sound.ts";
import { navigate } from "../router.ts";
import { PlayersBar } from "./leaderboard-page.tsx";
import { promptInstall, usePwa } from "../../pwa/pwa.ts";
import { detach } from "../detach.ts";

export const SettingsPage = () => {
  const settings = useSettings();
  const update = useAtomSet(updateSettingsAtom);
  const play = useSound();
  const set = (patch: Partial<Settings>) => {
    update(patch);
    play("tap");
  };
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="back" label="Back home" onClick={() => navigate({ page: "home" })} />
        <SectionTitle kicker="Make it yours">Settings</SectionTitle>
      </div>
      <div className="flex flex-col gap-6">
        <Card className="p-5">
          <p className="mb-3 font-display text-xl font-extrabold">Look and sound</p>
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Paper" },
              { value: "dark", label: "Kraft night" },
            ]}
          />
          <div className="mt-3 divide-y-2 divide-dashed divide-ink/20">
            <Toggle
              label="Sound effects"
              description="Pencil taps, brush strokes and a little fanfare."
              checked={settings.sound}
              onChange={(sound) => set({ sound })}
            />
            <label className="flex items-center gap-4 py-3">
              <span className="font-bold">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                disabled={!settings.sound}
                onChange={(event) => update({ volume: Number(event.target.value) })}
                onPointerUp={() => play("number", 4)}
                className="flex-1 accent-[var(--ink)]"
              />
            </label>
            <Toggle
              label="Animations"
              description="Confetti, pops and wiggles."
              checked={settings.animations}
              onChange={(animations) => set({ animations })}
            />
          </div>
        </Card>
        <Card className="p-5">
          <p className="font-display text-xl font-extrabold">While playing</p>
          <div className="mt-1 divide-y-2 divide-dashed divide-ink/20">
            <Toggle
              label="Highlight related tiles"
              description="Row, column, and tiles sharing the selected number or color."
              checked={settings.highlightRelated}
              onChange={(highlightRelated) => set({ highlightRelated })}
            />
            <Toggle
              label="Show rule breaks"
              description="Outline repeated numbers, colors or pairs right away. It never tells you whether a value is right."
              checked={settings.showConflicts}
              onChange={(showConflicts) => set({ showConflicts })}
            />
            <Toggle
              label="Pair tracker"
              description="A grid of every number and color combination already on the board."
              checked={settings.pairMatrix}
              onChange={(pairMatrix) => set({ pairMatrix })}
            />
            <Toggle
              label="Color shapes"
              description="Adds a shape to every color, for color vision deficiencies."
              checked={settings.colorblindShapes}
              onChange={(colorblindShapes) => set({ colorblindShapes })}
            />
            <Toggle
              label="Keep screen awake"
              description="Stops the screen from dimming during a puzzle, where supported."
              checked={settings.keepAwake}
              onChange={(keepAwake) => set({ keepAwake })}
            />
          </div>
        </Card>
        <Card className="p-5">
          <p className="mb-3 font-display text-xl font-extrabold">Players</p>
          <PlayersBar />
          <RenamePlayer />
        </Card>
        <InstallCard />
        <DataCard />
        <p className="pb-4 text-center text-sm text-ink-soft">For Tupu, a very good cat. 🐾</p>
      </div>
    </div>
  );
};

const RenamePlayer = () => {
  const current = AsyncResult.getOrElse(useAtomValue(currentPlayerAtom), () => undefined);
  const rename = useAtomSet(renamePlayerAtom, { mode: "promiseExit" });
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  if (!current) return null;
  return (
    <form
      className="mt-4 flex flex-wrap items-center gap-2"
      onSubmit={detach(async (event) => {
        event.preventDefault();
        const exit = await rename({ id: current.id, name });
        setMessage(exit._tag === "Success" ? "Renamed." : "That name is taken.");
        if (exit._tag === "Success") setName("");
      })}
    >
      <input
        value={name}
        maxLength={24}
        onChange={(event) => setName(event.target.value)}
        placeholder={`Rename ${current.name}`}
        aria-label="New name"
        className="h-11 min-w-0 flex-1 rounded-xl border-[2.5px] border-ink bg-card px-3 font-bold shadow-hard-sm outline-none"
      />
      <Button type="submit" disabled={!name.trim()}>
        Rename
      </Button>
      {message && <p className="w-full text-sm font-bold">{message}</p>}
    </form>
  );
};

const backupFileName = () => `tupu-${new Date().toISOString().slice(0, 10)}.sqlite`;

const DataCard = () => {
  const exportBackup = useAtomSet(exportBackupAtom, { mode: "promise" });
  const restore = useAtomSet(restoreBackupAtom, { mode: "promiseExit" });
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Card tone="paper" className="ruled p-5">
      <p className="font-display text-xl font-extrabold">Your data</p>
      <p className="mt-1 text-sm text-ink-soft">
        Everything is stored in a SQLite database inside this browser (OPFS). Nothing leaves the
        device. Back it up to move it elsewhere.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          icon="download"
          onClick={detach(async () => {
            const bytes = await exportBackup(undefined);
            const url = URL.createObjectURL(
              new Blob([new Uint8Array(bytes)], { type: "application/vnd.sqlite3" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = backupFileName();
            link.click();
            URL.revokeObjectURL(url);
            setMessage("Backup downloaded.");
          })}
        >
          Download backup
        </Button>
        <Button icon="upload" onClick={() => input.current?.click()}>
          Restore backup
        </Button>
        <input
          ref={input}
          type="file"
          accept=".sqlite,.db,application/vnd.sqlite3"
          className="hidden"
          onChange={detach(async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const exit = await restore(new Uint8Array(await file.arrayBuffer()));
            setMessage(
              exit._tag === "Success" ? "Backup restored." : "That file is not a Tupu backup.",
            );
            event.target.value = "";
          })}
        />
      </div>
      {message && <p className="mt-3 font-bold">{message}</p>}
    </Card>
  );
};

const isAppleMobile = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const InstallCard = () => {
  const pwa = usePwa();
  return (
    <Card tone="sky" className="p-5">
      <p className="font-display text-xl font-extrabold">Install and play offline</p>
      <p className="mt-1 text-sm">
        {pwa.offlineReady
          ? "This device has everything it needs: Tupu works without a connection or an account."
          : "Once the app has finished loading once, it keeps working without a connection."}
      </p>
      {pwa.installed ? (
        <p className="mt-3 font-bold">Installed on this device.</p>
      ) : pwa.canInstall ? (
        <Button className="mt-4" tone="ink" icon="download" onClick={detach(promptInstall)}>
          Install Tupu
        </Button>
      ) : (
        <p className="mt-3 text-sm font-bold">
          {isAppleMobile()
            ? "On iPhone or iPad: tap Share, then Add to Home Screen."
            : "Use your browser menu and choose Install app or Add to Home screen."}
        </p>
      )}
    </Card>
  );
};
