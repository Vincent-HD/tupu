import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { withValue, type Board as BoardState } from "../../domain/game.ts";
import { explain } from "../../domain/hints.ts";
import { colorAt } from "../../domain/palette.ts";
import { givenKnowledge, type Puzzle } from "../../domain/puzzle.ts";
import { solveLogically, type Layer } from "../../domain/solver.ts";
import { tutorialQuery } from "../queries.ts";
import { Board } from "../components/board.tsx";
import { Confetti } from "../components/confetti.tsx";
import { Keypad } from "../components/keypad.tsx";
import { MiniBoard } from "../components/mini-board.tsx";
import type { TileMark } from "../components/tile.tsx";
import { Button, Card, IconButton, SectionTitle } from "../components/ui.tsx";
import { useSettings } from "../hooks/use-settings.ts";
import { useSound } from "../hooks/use-sound.ts";

const intro = [
  {
    title: "Two layers on every tile",
    text: "Each tile gets a number and a color. You can fill them in any order, one layer at a time.",
    tiles: [
      { number: 0, color: 0 },
      { number: 1, color: null },
      { number: null, color: 2 },
      { number: null, color: null },
    ],
  },
  {
    title: "Lines never repeat",
    text: "In every row and column, each number appears once and each color appears once.",
    tiles: [
      { number: 0, color: 2 },
      { number: 1, color: 0 },
      { number: 2, color: 3 },
      { number: 3, color: 1 },
    ],
  },
  {
    title: "Pairs never repeat",
    text: "Across the whole board, a given number and color combination shows up exactly once. Keep that one in mind: it cracks the hard spots.",
    tiles: [
      { number: 2, color: 1 },
      { number: 0, color: 3 },
      { number: 3, color: 0 },
      { number: 2, color: 1, marks: ["conflict" as const] },
    ],
  },
];

export const TutorialPage = () => {
  const puzzle = useSuspenseQuery(tutorialQuery).data;
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="back" label="Leave tutorial" onClick={() => void navigate({ to: "/" })} />
        <SectionTitle kicker="Learn by doing">Guided tutorial</SectionTitle>
      </div>
      <Tutorial puzzle={puzzle} />
    </div>
  );
};

const Tutorial = ({ puzzle }: { puzzle: Puzzle }) => {
  const settings = useSettings();
  const play = useSound();
  const navigate = useNavigate();
  const steps = useMemo(() => solveLogically(givenKnowledge(puzzle), 2).steps, [puzzle]);
  const [slide, setSlide] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [partnerPending, setPartnerPending] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState>(() => {
    const knowledge = givenKnowledge(puzzle);
    return { size: puzzle.size, numbers: knowledge.numbers, colors: knowledge.colors };
  });

  if (slide < intro.length) {
    const page = intro[slide];
    if (!page) return null;
    return (
      <Card
        className="ruled mx-auto grid max-w-3xl animate-float-in gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center"
        key={slide}
      >
        <div>
          <p className="text-sm font-bold tracking-widest text-ink-soft uppercase">
            Rule {slide + 1} of {intro.length}
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold">{page.title}</p>
          <p className="mt-3 text-lg">{page.text}</p>
          <div className="mt-6 flex gap-2">
            {slide > 0 && <Button onClick={() => setSlide(slide - 1)}>Back</Button>}
            <Button
              tone="ink"
              onClick={() => {
                play("page");
                setSlide(slide + 1);
              }}
            >
              {slide === intro.length - 1 ? "Let's solve one" : "Next"}
            </Button>
          </div>
        </div>
        <div className="w-60">
          <MiniBoard columns={4} tiles={page.tiles} />
        </div>
      </Card>
    );
  }

  const step = steps[stepIndex];
  const done = step === undefined;
  const expectedLayer: Layer | undefined = step
    ? partnerPending
      ? step.layer === "number"
        ? "color"
        : "number"
      : step.layer
    : undefined;
  const expectedValue = step ? (partnerPending ? step.partner : step.value) : undefined;
  const marks = new Map<number, Set<TileMark>>();
  if (step) {
    marks.set(step.cell, new Set<TileMark>(["hint"]));
    for (const reason of step.reasons) marks.set(reason, new Set<TileMark>(["reason"]));
  }
  const explanation = step ? explain(step) : null;

  const answer = (layer: Layer, value: number) => {
    if (!step) return;
    if (layer !== expectedLayer || value !== expectedValue) {
      play("error");
      setNudge(
        layer !== expectedLayer
          ? `This step is about the ${expectedLayer}. Try the other row of keys.`
          : `Not that one. ${layer === "number" ? `${value + 1}` : colorAt(value).name} already breaks a rule here.`,
      );
      return;
    }
    play(layer, value);
    setNudge(null);
    setBoard((current) => withValue(current, { cell: step.cell, layer, value }));
    if (step.partner !== undefined && !partnerPending) {
      setPartnerPending(true);
      return;
    }
    setPartnerPending(false);
    const next = stepIndex + 1;
    setStepIndex(next);
    if (next >= steps.length) play("win");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <Card className="dotted mx-auto w-full max-w-[520px] p-[3.5%]">
        <Board
          puzzle={puzzle}
          board={board}
          marks={marks}
          shapes={settings.colorblindShapes}
          animate={settings.animations}
        />
      </Card>
      <div className="flex flex-col gap-4">
        <Card tone={done ? "mint" : "marker"} className="p-5">
          <p className="text-xs font-bold tracking-widest uppercase">
            {done ? "All done" : `Step ${stepIndex + 1} of ${steps.length}`}
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold">
            {done ? "You solved your first board!" : explanation?.title}
          </p>
          <p className="mt-2 leading-snug">
            {done
              ? "Every deduction you made came from the three rules. Real puzzles hide the next step a little better."
              : `${explanation?.body} Fill in the highlighted tile${expectedLayer ? ` with its ${expectedLayer}` : ""}.`}
          </p>
          {nudge && (
            <p className="mt-3 rounded-lg border-2 border-ink bg-card p-2 text-sm font-bold">
              {nudge}
            </p>
          )}
          {done && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button tone="ink" icon="play" onClick={() => void navigate({ to: "/" })}>
                Play for real
              </Button>
              <Button icon="book" onClick={() => void navigate({ to: "/rules" })}>
                Read the rules
              </Button>
            </div>
          )}
        </Card>
        {!done && step && (
          <Card className="p-4">
            <Keypad
              size={puzzle.size}
              number={board.numbers[step.cell] ?? null}
              color={board.colors[step.cell] ?? null}
              lockedNumber={false}
              lockedColor={false}
              shapes={settings.colorblindShapes}
              onNumber={(value) => answer("number", value)}
              onColor={(value) => answer("color", value)}
              onClear={() => setNudge("Nothing to erase: every value you enter here is correct.")}
            />
          </Card>
        )}
      </div>
      {done && settings.animations && <Confetti />}
    </div>
  );
};
