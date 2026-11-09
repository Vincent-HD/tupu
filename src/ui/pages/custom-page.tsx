import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import {
  clueDensities,
  levelDescriptions,
  levelLabels,
  type ClueDensity,
} from "../../domain/difficulty.ts";
import type { LogicLevel } from "../../domain/solver.ts";
import { supportedSizes, type BoardSize } from "../../domain/square.ts";
import { Button, Card, IconButton, Segmented, SectionTitle } from "../components/ui.tsx";
import { useSound } from "../hooks/use-sound.ts";
import { actions } from "../queries.ts";

const densityLabels: Readonly<Record<ClueDensity, string>> = {
  generous: "Generous",
  balanced: "Balanced",
  sparse: "Bare minimum",
};

const randomSeed = () => Math.random().toString(36).slice(2, 8);

const CustomPuzzle = Schema.Struct({
  size: Schema.Literals(supportedSizes),
  level: Schema.Literals([1, 2, 3, 4]),
  density: Schema.Literals(clueDensities),
  seed: Schema.String.pipe(
    Schema.check(Schema.isMaxLength(32, { message: "32 characters at most." })),
  ),
});

const customDefaults = (): {
  size: BoardSize;
  level: LogicLevel;
  density: ClueDensity;
  seed: string;
} => ({ size: 5, level: 2, density: "balanced", seed: randomSeed() });

export const CustomPage = () => {
  const navigate = useNavigate();
  const play = useSound();
  const start = useMutation({
    mutationFn: actions.startGame,
    onMutate: () => play("page"),
    onSuccess: (gameId) => navigate({ to: "/play/$gameId", params: { gameId } }),
  });
  const form = useForm({
    defaultValues: customDefaults(),
    validators: { onChange: Schema.toStandardSchemaV1(CustomPuzzle) },
    onSubmit: ({ value }) =>
      start.mutateAsync({
        mode: "custom",
        spec: { size: value.size, level: value.level, density: value.density },
        seed: value.seed.trim() || randomSeed(),
      }),
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="back" label="Back home" onClick={() => void navigate({ to: "/" })} />
        <SectionTitle kicker="Your rules">Custom puzzle</SectionTitle>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Card className="ruled flex flex-col gap-7 p-6">
          <form.Field name="size">
            {(field) => (
              <div>
                <p className="mb-2 font-display text-xl font-extrabold">Board size</p>
                <Segmented<number>
                  label="Board size"
                  value={field.state.value}
                  onChange={(value) => {
                    const supported = supportedSizes.find((candidate) => candidate === value);
                    if (supported === undefined) return;
                    play("tap");
                    field.handleChange(supported);
                  }}
                  options={[3, 4, 5, 6, 7, 8, 9].map((value) => ({
                    value,
                    label: `${value}×${value}`,
                    disabled: !supportedSizes.some((supported) => supported === value),
                  }))}
                />
                <p className="mt-2 text-sm text-ink-soft">
                  No 6×6: Euler conjectured in 1782 that 36 officers cannot be arranged this way,
                  and Tarry proved it in 1900. There is no 2×2 either.
                </p>
              </div>
            )}
          </form.Field>
          <form.Field name="level">
            {(field) => (
              <div>
                <p className="mb-2 font-display text-xl font-extrabold">Logic needed</p>
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Logic needed"
                >
                  {([1, 2, 3, 4] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={field.state.value === value}
                      data-pressed={field.state.value === value}
                      onClick={() => {
                        play("tap");
                        field.handleChange(value);
                      }}
                      className={`press cursor-pointer rounded-xl border-[2.5px] border-ink p-3 text-left shadow-hard-sm ${field.state.value === value ? "bg-marker" : "bg-card"}`}
                    >
                      <span className="block font-bold">
                        {value}. {levelLabels[value]}
                      </span>
                      <span className="block text-sm text-ink-soft">
                        {levelDescriptions[value]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form.Field>
          <form.Field name="density">
            {(field) => (
              <div>
                <p className="mb-2 font-display text-xl font-extrabold">Clues</p>
                <Segmented
                  label="Clue density"
                  value={field.state.value}
                  onChange={(value) => {
                    play("tap");
                    field.handleChange(value);
                  }}
                  options={clueDensities.map((value) => ({ value, label: densityLabels[value] }))}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="seed">
            {(field) => (
              <div>
                <p className="mb-2 font-display text-xl font-extrabold">Seed</p>
                <div className="flex gap-2">
                  <input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    maxLength={32}
                    aria-label="Seed"
                    className="h-11 min-w-0 flex-1 rounded-xl border-[2.5px] border-ink bg-card px-3 font-mono font-bold shadow-hard-sm outline-none focus:bg-marker/30"
                  />
                  <IconButton
                    icon="dice"
                    label="New seed"
                    onClick={() => field.handleChange(randomSeed())}
                  />
                </div>
                {field.state.meta.errors[0] && (
                  <p className="mt-2 font-bold text-danger">
                    {String(field.state.meta.errors[0].message)}
                  </p>
                )}
                <p className="mt-2 text-sm text-ink-soft">
                  Same size, logic, clues and seed means the same puzzle on any device.
                </p>
              </div>
            )}
          </form.Field>
          <form.Subscribe
            selector={(state) => ({ canSubmit: state.canSubmit, busy: state.isSubmitting })}
          >
            {({ canSubmit, busy }) => (
              <Button type="submit" tone="ink" size="lg" icon="play" disabled={!canSubmit || busy}>
                {busy ? "Shuffling…" : "Generate this puzzle"}
              </Button>
            )}
          </form.Subscribe>
        </Card>
      </form>
    </div>
  );
};
