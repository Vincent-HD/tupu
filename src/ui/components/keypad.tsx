import { colorAt } from "../../domain/palette.ts";
import { Icon } from "./icons.tsx";
import { ShapeGlyph } from "./shape.tsx";

export const Keypad = ({
  size,
  number,
  color,
  lockedNumber,
  lockedColor,
  shapes,
  onNumber,
  onColor,
  onClear,
  colorKeys,
  counts,
}: {
  size: number;
  number: number | null;
  color: number | null;
  lockedNumber: boolean;
  lockedColor: boolean;
  shapes: boolean;
  onNumber: (value: number) => void;
  onColor: (value: number) => void;
  onClear?: (() => void) | undefined;
  colorKeys?: ReadonlyArray<string> | undefined;
  counts?:
    | { readonly numbers: ReadonlyArray<number>; readonly colors: ReadonlyArray<number> }
    | undefined;
}) => {
  const badge = (count: number | undefined) =>
    count === undefined ? null : (
      <span
        className={`absolute -top-2 -right-1.5 rounded-full border-2 border-paper px-1.5 text-[10px] leading-4 font-extrabold ${
          count === size ? "bg-good text-white" : "bg-ink text-paper"
        }`}
      >
        {count}/{size}
      </span>
    );
  const values = Array.from({ length: size }, (_, value) => value);
  const keyClass =
    "press relative flex h-12 min-w-0 sm:h-13 flex-1 cursor-pointer items-center justify-center rounded-xl border-[2.5px] border-ink shadow-hard-sm disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-col gap-2.5" aria-label="Values for the selected tile">
      <div className="flex gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            disabled={lockedNumber}
            data-pressed={number === value}
            aria-label={`Number ${value + 1}`}
            onClick={() => onNumber(value)}
            className={`${keyClass} font-display text-2xl font-extrabold ${number === value ? "bg-ink text-paper" : "bg-card"}`}
          >
            {value + 1}
            {badge(counts?.numbers[value])}
            <span
              className={`absolute right-1 bottom-0.5 hidden text-[10px] font-bold sm:block ${number === value ? "text-paper/70" : "text-ink-soft"}`}
            >
              {value + 1}
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {values.map((value) => {
          const tile = colorAt(value);
          return (
            <button
              key={value}
              type="button"
              disabled={lockedColor}
              data-pressed={color === value}
              aria-label={`Color ${tile.name}`}
              onClick={() => onColor(value)}
              className={`${keyClass} ${color === value ? "outline-[3px] outline-offset-2 outline-ink" : ""}`}
              style={{ backgroundColor: tile.fill }}
            >
              {shapes && <ShapeGlyph shape={tile.shape} className="size-5 text-white/85" />}
              {badge(counts?.colors[value])}
              <span
                className="absolute right-1 bottom-0.5 hidden text-[10px] font-bold uppercase sm:block"
                style={{ color: tile.ink }}
              >
                {colorKeys?.[value]}
              </span>
            </button>
          );
        })}
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          disabled={lockedColor && lockedNumber}
          className="press flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-[2.5px] border-ink bg-paper-deep font-bold shadow-hard-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="eraser" /> Erase tile
        </button>
      )}
    </div>
  );
};
