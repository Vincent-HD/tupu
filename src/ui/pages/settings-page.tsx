import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import { useRef } from "react";
import type { Settings } from "../../services/settings.ts";
import { actions, currentPlayerQuery } from "../queries.ts";
import { Button, Card, IconButton, Segmented, SectionTitle, Toggle } from "../components/ui.tsx";
import { useSettings } from "../hooks/use-settings.ts";
import { useSound } from "../hooks/use-sound.ts";
import { PlayersBar } from "./leaderboard-page.tsx";
import { promptInstall, usePwa } from "../../pwa/pwa.ts";
import { detach } from "../detach.ts";

export const SettingsPage = () => {
  const settings = useSettings();
  const navigate = useNavigate();
  const updateSettings = useMutation({ mutationFn: actions.updateSettings });
  const update = updateSettings.mutate;
  const play = useSound();
  const set = (patch: Partial<Settings>) => {
    update(patch);
    play("tap");
  };
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="back" label="Back home" onClick={() => void navigate({ to: "/" })} />
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
            <div className="py-3">
              <p className="font-bold">Keyboard layout</p>
              <p className="mb-2 text-sm text-ink-soft">
                Colors use the top letter row and numbers the digit row, by physical position. This
                only changes the key labels shown on the keypad.
              </p>
              <Segmented
                label="Keyboard layout"
                value={settings.keyboardLayout}
                onChange={(keyboardLayout) => set({ keyboardLayout })}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "qwerty", label: "QWERTY" },
                  { value: "azerty", label: "AZERTY" },
                  { value: "qwertz", label: "QWERTZ" },
                ]}
              />
            </div>
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

const PlayerName = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1, { message: "Give the player a name." })),
  Schema.check(Schema.isMaxLength(24, { message: "24 characters at most." })),
);

const RenamePlayer = () => {
  const current = useQuery(currentPlayerQuery).data;
  const rename = useMutation({ mutationFn: actions.renamePlayer });
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: Schema.toStandardSchemaV1(Schema.Struct({ name: PlayerName })) },
    onSubmit: async ({ value, formApi }) => {
      if (!current) return;
      await rename.mutateAsync({ id: current.id, name: value.name.trim() });
      formApi.reset();
    },
  });
  if (!current) return null;
  return (
    <form
      className="mt-4 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <input
            value={field.state.value}
            maxLength={24}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder={`Rename ${current.name}`}
            aria-label="New name"
            className="h-11 min-w-0 flex-1 rounded-xl border-[2.5px] border-ink bg-card px-3 font-bold shadow-hard-sm outline-none"
          />
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) =>
          state.canSubmit && !state.isSubmitting && state.values.name.trim() !== ""
        }
      >
        {(canSubmit) => (
          <Button type="submit" disabled={!canSubmit}>
            Rename
          </Button>
        )}
      </form.Subscribe>
      {rename.isSuccess && <p className="w-full text-sm font-bold">Renamed.</p>}
      {rename.isError && (
        <p className="w-full text-sm font-bold text-danger">That name is taken.</p>
      )}
    </form>
  );
};

const backupFileName = () => `tupu-${new Date().toISOString().slice(0, 10)}.sqlite`;

const downloadBackup = (bytes: Uint8Array) => {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/vnd.sqlite3" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName();
  link.click();
  URL.revokeObjectURL(url);
};

const DataCard = () => {
  const exportBackup = useMutation({ mutationFn: actions.exportBackup, onSuccess: downloadBackup });
  const restore = useMutation({
    mutationFn: async (file: File) =>
      actions.restoreBackup(new Uint8Array(await file.arrayBuffer())),
  });
  const input = useRef<HTMLInputElement>(null);
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
          disabled={exportBackup.isPending}
          onClick={() => exportBackup.mutate()}
        >
          Download backup
        </Button>
        <Button icon="upload" disabled={restore.isPending} onClick={() => input.current?.click()}>
          Restore backup
        </Button>
        <input
          ref={input}
          type="file"
          accept=".sqlite,.db,application/vnd.sqlite3"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) restore.mutate(file);
          }}
        />
      </div>
      {exportBackup.isSuccess && <p className="mt-3 font-bold">Backup downloaded.</p>}
      {restore.isSuccess && <p className="mt-3 font-bold">Backup restored.</p>}
      {restore.isError && (
        <p className="mt-3 font-bold text-danger">That file is not a Tupu backup.</p>
      )}
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
