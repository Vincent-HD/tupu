import { useAtomSet } from "@effect/atom-react";
import { useState } from "react";
import {
  clueDensities,
  levelDescriptions,
  levelLabels,
  type ClueDensity,
} from "../../domain/difficulty.ts";
import type { LogicLevel } from "../../domain/solver.ts";
import { supportedSizes, type BoardSize } from "../../domain/square.ts";
import { startGameAtom } from "../atoms.ts";
import { Button, Card, IconButton, Segmented, SectionTitle } from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";
import { navigate } from "../router.ts";
import { detach } from "../detach.ts";

const densityLabels: Readonly<Record<ClueDensity, string>> = {
  generous: "Generous",
  balanced: "Balanced",
  sparse: "Bare minimum",
};

const randomSeed = () => Math.random().toString(36).slice(2, 8);

export const CustomPage = () => {
  const start = useAtomSet(startGameAtom, { mode: "promise" });
  const play = useSound();
  const [size, setSize] = useState<BoardSize>(5);
  const [level, setLevel] = useState<LogicLevel>(2);
  const [density, setDensity] = useState<ClueDensity>("balanced");
  const [seed, setSeed] = useState(randomSeed);
  const [busy, setBusy] = useState(false);

  const launch = async () => {
    setBusy(true);
    play("page");
    try {
      navigate({
        page: "play",
        id: await start({
          mode: "custom",
          spec: { size, level, density },
          seed: seed.trim() || randomSeed(),
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="back" label="Back home" onClick={() => navigate({ page: "home" })} />
        <SectionTitle kicker="Your rules">Custom puzzle</SectionTitle>
      </div>
      <Card className="ruled flex flex-col gap-7 p-6">
        <div>
          <p className="mb-2 font-display text-xl font-extrabold">Board size</p>
          <Segmented<number>
            label="Board size"
            value={size}
            onChange={(value) => {
              const supported = supportedSizes.find((candidate) => candidate === value);
              if (supported === undefined) return;
              play("tap");
              setSize(supported);
            }}
            options={[3, 4, 5, 6, 7, 8, 9].map((value) => ({
              value,
              label: `${value}×${value}`,
              disabled: !supportedSizes.some((supported) => supported === value),
            }))}
          />
          <p className="mt-2 text-sm text-ink-soft">
            No 6×6: Euler conjectured in 1782 that 36 officers cannot be arranged this way, and
            Tarry proved it in 1900. There is no 2×2 either.
          </p>
        </div>
        <div>
          <p className="mb-2 font-display text-xl font-extrabold">Logic needed</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {([1, 2, 3, 4] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-pressed={level === value}
                onClick={() => {
                  play("tap");
                  setLevel(value);
                }}
                className={`press cursor-pointer rounded-xl border-[2.5px] border-ink p-3 text-left shadow-hard-sm ${level === value ? "bg-marker" : "bg-card"}`}
              >
                <span className="block font-bold">
                  {value}. {levelLabels[value]}
                </span>
                <span className="block text-sm text-ink-soft">{levelDescriptions[value]}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-display text-xl font-extrabold">Clues</p>
          <Segmented
            label="Clue density"
            value={density}
            onChange={(value) => {
              play("tap");
              setDensity(value);
            }}
            options={clueDensities.map((value) => ({ value, label: densityLabels[value] }))}
          />
        </div>
        <div>
          <p className="mb-2 font-display text-xl font-extrabold">Seed</p>
          <div className="flex gap-2">
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              maxLength={32}
              aria-label="Seed"
              className="h-11 min-w-0 flex-1 rounded-xl border-[2.5px] border-ink bg-card px-3 font-mono font-bold shadow-hard-sm outline-none focus:bg-marker/30"
            />
            <IconButton icon="dice" label="New seed" onClick={() => setSeed(randomSeed())} />
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            Same size, logic, clues and seed means the same puzzle on any device.
          </p>
        </div>
        <Button tone="ink" size="lg" icon="play" disabled={busy} onClick={detach(launch)}>
          {busy ? "Shuffling…" : "Generate this puzzle"}
        </Button>
      </Card>
    </div>
  );
};
