import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";
import { DisplayName } from "../../api/rpc.ts";
import type { Settings } from "../../services/settings.ts";
import type { SyncState } from "../../services/sync.ts";
import { accountQuery, actions, syncQuery } from "../queries.ts";
import {
  Button,
  Card,
  IconButton,
  Modal,
  Segmented,
  SectionTitle,
  Toggle,
} from "../components/ui.tsx";
import { useSettings } from "../hooks/use-settings.ts";
import { useSound } from "../hooks/use-sound.ts";
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
        <AccountCard />
        <InstallCard />
        <p className="pb-4 text-center text-sm text-ink-soft">For Tupu, a very good cat. 🐾</p>
      </div>
    </div>
  );
};

const syncLabel = (sync: { readonly state: SyncState; readonly pending: number }) => {
  const waiting = sync.pending
    ? `${sync.pending} change${sync.pending > 1 ? "s" : ""} waiting to sync.`
    : "Everything is synced.";
  switch (sync.state.status) {
    case "syncing":
      return "Syncing…";
    case "offline":
      return `Offline. ${waiting}`;
    case "expired":
      return `Your session expired. Sign in again to sync. ${waiting}`;
    default:
      return sync.state.lastSyncedAt
        ? `${waiting} Last sync ${new Date(sync.state.lastSyncedAt).toLocaleTimeString()}.`
        : waiting;
  }
};

const AccountCard = () => {
  const account = useQuery(accountQuery).data;
  const sync = useQuery(syncQuery).data;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const syncNow = useMutation({ mutationFn: actions.syncNow });
  const signOut = useMutation({
    mutationFn: actions.signOut,
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/login" });
    },
  });
  if (!account) return null;
  const leaving = () => {
    if (sync?.pending) setConfirming(true);
    else signOut.mutate();
  };
  return (
    <Card className="p-5">
      <p className="font-display text-xl font-extrabold">Account</p>
      <p className="mt-1 text-sm text-ink-soft">
        Signed in as <span className="font-bold text-ink">{account.name}</span> ({account.email}).
      </p>
      <RenameAccount current={account.name} />
      <AddPasskey />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-ink/20 pt-4">
        <p className="mr-auto text-sm font-bold">{sync ? syncLabel(sync) : "…"}</p>
        {sync?.state.status === "expired" ? (
          <Button
            size="sm"
            tone="marker"
            icon="key"
            onClick={() => void navigate({ to: "/login" })}
          >
            Sign in again
          </Button>
        ) : (
          <Button
            size="sm"
            icon="refresh"
            disabled={syncNow.isPending || sync?.state.status === "syncing"}
            onClick={() => syncNow.mutate()}
          >
            Sync now
          </Button>
        )}
        <Button size="sm" icon="logout" disabled={signOut.isPending} onClick={leaving}>
          Sign out
        </Button>
      </div>
      <Modal open={confirming} onClose={() => setConfirming(false)} label="Sign out">
        <Card className="p-5">
          <p className="font-display text-2xl font-extrabold">Sign out anyway?</p>
          <p className="mt-2">
            {sync?.pending} change{(sync?.pending ?? 0) > 1 ? "s have" : " has"} not reached the
            server yet. Signing out removes the games on this device, so they would be lost.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button onClick={() => setConfirming(false)}>Stay signed in</Button>
            <Button
              tone="danger"
              icon="logout"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              Sign out
            </Button>
          </div>
        </Card>
      </Modal>
    </Card>
  );
};

const AddPasskey = () => {
  const add = useMutation({ mutationFn: actions.addPasskey });
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-ink/20 pt-4">
      <p className="mr-auto text-sm">
        {add.isSuccess
          ? "Passkey saved. Use it next time you sign in."
          : add.error
            ? "No passkey was saved. If this keeps failing, sign out and back in with a code first."
            : "Sign in with your fingerprint, face or screen lock instead of an email code."}
      </p>
      <Button size="sm" icon="key" disabled={add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? "Waiting…" : "Add a passkey"}
      </Button>
    </div>
  );
};

const RenameAccount = ({ current }: { current: string }) => {
  const rename = useMutation({ mutationFn: actions.rename });
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: Schema.toStandardSchemaV1(Schema.Struct({ name: DisplayName })) },
    onSubmit: async ({ value, formApi }) => {
      await rename.mutateAsync(value.name.trim());
      formApi.reset();
    },
  });
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
            placeholder={`Rename ${current}`}
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
        <p className="w-full text-sm font-bold text-danger">
          Renaming needs a connection. Try again once you are online.
        </p>
      )}
    </form>
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
          ? "This device has everything it needs: you can play without a connection and your games sync later."
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
