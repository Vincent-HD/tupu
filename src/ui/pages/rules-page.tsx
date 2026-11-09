import type { ReactNode } from "react";
import { levelDescriptions, levelLabels } from "../../domain/difficulty.ts";
import { Icon } from "../components/icons.tsx";
import { MiniBoard } from "../components/mini-board.tsx";
import { Card, SectionTitle } from "../components/ui.tsx";
import { Link } from "@tanstack/react-router";

const Rule = ({
  index,
  title,
  children,
  example,
}: {
  index: number;
  title: string;
  children: ReactNode;
  example: ReactNode;
}) => (
  <Card
    className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center"
    tilt={index % 2 ? "right" : "left"}
  >
    <div>
      <p className="font-display text-5xl font-extrabold text-ink/15">{index}</p>
      <p className="-mt-3 font-display text-2xl font-extrabold">{title}</p>
      <p className="mt-2 leading-relaxed">{children}</p>
    </div>
    <div className="w-56">{example}</div>
  </Card>
);

export const RulesPage = () => (
  <div className="mx-auto w-full max-w-3xl">
    <div className="mb-6 flex items-center gap-3">
      <Link
        to="/"
        aria-label="Back home"
        className="press inline-flex size-11 shrink-0 items-center justify-center rounded-xl border-[2.5px] border-ink bg-card text-xl shadow-hard"
      >
        <Icon name="back" />
      </Link>
      <SectionTitle kicker="Two layers, three rules">How to play</SectionTitle>
    </div>
    <p className="mb-6 text-lg">
      Each tile holds two things: a <strong>number</strong> and a <strong>color</strong>. A finished
      board is a perfect weave of both layers.
    </p>
    <div className="flex flex-col gap-6">
      <Rule
        index={1}
        title="No repeated numbers in a line"
        example={
          <MiniBoard columns={4} tiles={[0, 1, 2, 3].map((number) => ({ number, color: null }))} />
        }
      >
        Every row and every column uses each number exactly once, just like a small sudoku.
      </Rule>
      <Rule
        index={2}
        title="No repeated colors in a line"
        example={
          <MiniBoard columns={4} tiles={[2, 0, 3, 1].map((color) => ({ number: null, color }))} />
        }
      >
        The color layer follows the same rule on its own: each color appears once per row and once
        per column.
      </Rule>
      <Rule
        index={3}
        title="Every pair exactly once"
        example={
          <MiniBoard
            columns={4}
            tiles={[
              { number: 0, color: 2 },
              { number: 1, color: 0 },
              { number: 2, color: 3 },
              { number: 0, color: 2, marks: ["conflict"] },
            ]}
          />
        }
      >
        A blue 1 can live in only one tile on the whole board. With as many tiles as there are
        pairs, every combination shows up once. This is the rule that makes the puzzle interesting.
      </Rule>
    </div>

    <SectionTitle kicker="Reading the sheet">Locked clues</SectionTitle>
    <Card className="mb-10 grid gap-4 p-5 sm:grid-cols-3">
      {[
        {
          tile: { number: 2, color: null, givenNumber: true },
          text: "An underlined number was given.",
        },
        {
          tile: { number: null, color: 1, givenColor: true },
          text: "A folded corner means the color was given.",
        },
        {
          tile: { number: 3, color: 3, givenNumber: true, givenColor: true },
          text: "Both marks: the whole tile was given.",
        },
      ].map((entry) => (
        <div key={entry.text} className="flex items-center gap-3">
          <div className="w-16 shrink-0">
            <MiniBoard columns={1} tiles={[entry.tile]} className="max-w-16" />
          </div>
          <p className="text-sm font-bold">{entry.text}</p>
        </div>
      ))}
    </Card>

    <SectionTitle kicker="Getting better">Four kinds of logic</SectionTitle>
    <div className="mb-10 grid gap-4 sm:grid-cols-2">
      {([1, 2, 3, 4] as const).map((level) => (
        <Card key={level} className="p-4">
          <p className="font-display text-lg font-extrabold">
            {level}. {levelLabels[level]}
          </p>
          <p className="mt-1 text-sm">{levelDescriptions[level]}</p>
          <p className="mt-2 text-sm text-ink-soft">{levelTips[level]}</p>
        </Card>
      ))}
    </div>

    <SectionTitle kicker="Your toolbox">While you play</SectionTitle>
    <Card className="ruled mb-10 p-5">
      <ul className="flex flex-col gap-3">
        {tools.map(([icon, text]) => (
          <li key={text} className="flex items-start gap-3">
            <Icon name={icon} className="mt-0.5 shrink-0 text-xl" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </Card>

    <Card tone="lilac" className="mb-10 p-5">
      <p className="font-display text-xl font-extrabold">Why is there no 6×6?</p>
      <p className="mt-2">
        In 1782 Leonhard Euler asked whether 36 officers from six regiments and six ranks could
        stand in a 6×6 square with no regiment or rank repeated in any row or column. He suspected
        it was impossible, and Gaston Tarry confirmed it in 1900 by checking every case. Boards like
        these are called Graeco-Latin squares, and they exist for every size except 2 and 6.
      </p>
    </Card>

    <div className="flex flex-wrap gap-3">
      <Link
        to="/tutorial"
        className="press inline-flex h-14 items-center gap-2.5 rounded-2xl border-[2.5px] border-ink bg-ink px-6 text-lg font-bold text-paper shadow-hard"
      >
        <Icon name="sparkle" /> Try the guided tutorial
      </Link>
      <Link
        to="/"
        className="press inline-flex h-14 items-center gap-2.5 rounded-2xl border-[2.5px] border-ink bg-card px-6 text-lg font-bold shadow-hard"
      >
        <Icon name="play" /> Start playing
      </Link>
    </div>
  </div>
);

const levelTips: Readonly<Record<1 | 2 | 3 | 4, string>> = {
  1: "Find a line with one gap, or a value that only fits in one spot of a line.",
  2: "A tile with a known number cannot take a color whose pair already sits elsewhere.",
  3: "Pick a pair that is not on the board yet and check where it could still go.",
  4: "Hold several possibilities in your head and let them cancel each other out.",
};

const tools: ReadonlyArray<
  readonly ["check" | "bulb" | "grid" | "scan" | "undo" | "keyboard" | "film", string]
> = [
  [
    "bulb",
    "Hints point at the next logical step and explain why. They add 30 seconds to your score.",
  ],
  ["check", "Checks cross out anything that disagrees with the solution. They add 10 seconds."],
  ["grid", "The pair tracker shows which number and color combinations are already placed."],
  [
    "scan",
    "The highlighter (L) turns the keypad into a finder: pick a number, a color or both to light up where they are, dash the tiles that can still take them and flag the rows and columns that miss them.",
  ],
  ["undo", "Undo and redo as much as you like; mistakes are free."],
  [
    "keyboard",
    "Arrows move, the digit row sets numbers (no Shift needed on AZERTY), the top letter row sets colors (Q W E R… or A Z E R… depending on your keyboard), Backspace erases, L opens the highlighter.",
  ],
  ["film", "Every solve is recorded so you can watch the replay afterwards."],
];
