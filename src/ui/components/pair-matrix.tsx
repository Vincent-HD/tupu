import { colorAt } from "../../domain/palette.ts";
import type { Board } from "../../domain/game.ts";

export const PairMatrix = ({
  board,
  focus,
  onFocus,
}: {
  board: Board;
  focus: { readonly number: number; readonly color: number } | null;
  onFocus: (pair: { readonly number: number; readonly color: number } | null) => void;
}) => {
  const { size } = board;
  const counts = new Map<number, number>();
  for (let cell = 0; cell < size * size; cell++) {
    const number = board.numbers[cell];
    const color = board.colors[cell];
    if (number === null || number === undefined || color === null || color === undefined) continue;
    const key = number * size + color;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const used = [...counts.values()].filter((count) => count > 0).length;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-display font-extrabold">Pair tracker</p>
        <p className="text-sm font-bold text-ink-soft">
          {used}/{size * size}
        </p>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `1.6rem repeat(${size}, minmax(0, 1fr))` }}
        onMouseLeave={() => onFocus(null)}
      >
        <span />
        {Array.from({ length: size }, (_, color) => (
          <span
            key={color}
            className="mx-auto mb-0.5 h-2.5 w-full max-w-8 rounded-sm border-2 border-ink"
            style={{ backgroundColor: colorAt(color).fill }}
          />
        ))}
        {Array.from({ length: size }, (_, number) => (
          <div key={number} className="contents">
            <span className="flex items-center justify-center font-display text-sm font-extrabold">
              {number + 1}
            </span>
            {Array.from({ length: size }, (_, color) => {
              const count = counts.get(number * size + color) ?? 0;
              const active = focus?.number === number && focus.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`${colorAt(color).name} ${number + 1}: ${count === 0 ? "not placed" : count > 1 ? "placed twice" : "placed"}`}
                  onClick={() => onFocus(active ? null : { number, color })}
                  onMouseEnter={() => onFocus({ number, color })}
                  className={`mx-auto flex aspect-square w-full max-w-8 cursor-pointer items-center justify-center rounded-md border-2 text-xs font-extrabold transition-transform ${active ? "scale-110 border-ink" : "border-ink/30"} ${count > 1 ? "bg-danger text-white" : ""}`}
                  style={
                    count === 1
                      ? { backgroundColor: colorAt(color).fill, borderColor: "var(--ink)" }
                      : undefined
                  }
                >
                  {count === 1 ? "✓" : count > 1 ? "!" : ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
