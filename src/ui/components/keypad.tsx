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
}) => {
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
            className={`${keyClass} font-display text-2xl font-extrabold ${number === value ? "bg-marker" : "bg-card"}`}
          >
            {value + 1}
            <span className="absolute right-1 bottom-0.5 hidden text-[10px] font-bold text-ink-soft sm:block">
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
              <span
                className="absolute right-1 bottom-0.5 hidden text-[10px] font-bold uppercase sm:block"
                style={{ color: tile.ink }}
              >
                {tile.key}
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
