import { colorAt } from "../../domain/palette.ts";
import { ShapeGlyph } from "./shape.tsx";

export type TileMark =
  | "selected"
  | "related"
  | "hint"
  | "reason"
  | "conflict"
  | "wrong"
  | "pair"
  | "lens-hit"
  | "lens-dim"
  | "lens-maybe";

export interface TileProps {
  readonly number: number | null;
  readonly color: number | null;
  readonly givenNumber: boolean;
  readonly givenColor: boolean;
  readonly marks: ReadonlySet<TileMark>;
  readonly shapes: boolean;
  readonly animate: boolean;
  readonly popKey?: number | undefined;
  readonly label: string;
  readonly onSelect?: (() => void) | undefined;
}

export const Tile = (props: TileProps) => {
  const color = props.color === null ? null : colorAt(props.color);
  const { marks } = props;
  const ring = marks.has("hint")
    ? "animate-pulse-marker z-10"
    : marks.has("lens-hit")
      ? "z-10 -translate-x-0.5 -translate-y-0.5 shadow-[0_0_0_3px_var(--marker),5px_5px_0_3px_var(--shadow)]"
      : marks.has("selected")
        ? "z-10 -translate-x-0.5 -translate-y-0.5 shadow-[0_0_0_3px_var(--marker),6px_6px_0_3px_var(--shadow)]"
        : "shadow-hard-sm";
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={marks.has("selected")}
      onClick={props.onSelect}
      className={`relative flex aspect-square cursor-pointer items-center justify-center rounded-[14%] border-[2.5px] transition-[transform,box-shadow] duration-100 ${
        marks.has("conflict") || marks.has("wrong") ? "border-danger" : "border-ink"
      } ${ring} ${marks.has("conflict") && props.animate ? "animate-wiggle" : ""} ${
        marks.has("lens-dim") ? "opacity-20 saturate-0" : ""
      } ${marks.has("lens-maybe") ? "border-dashed" : ""} transition-[opacity,filter]`}
      style={{ backgroundColor: color && !marks.has("lens-maybe") ? color.fill : "var(--card)" }}
    >
      {marks.has("lens-maybe") && (
        <>
          <span className="hatch absolute inset-0 rounded-[12%]" />
          <span className="absolute right-[8%] bottom-[4%] font-display text-[0.7rem] font-extrabold text-ink-soft">
            ?
          </span>
        </>
      )}
      {!color && marks.has("related") && <span className="hatch absolute inset-0 rounded-[12%]" />}
      {color && marks.has("related") && (
        <span className="absolute inset-[3px] rounded-[12%] border-2 border-dashed border-ink/40" />
      )}
      {marks.has("reason") && (
        <span className="absolute -inset-1 rounded-[16%] border-[3px] border-dashed border-ink/70" />
      )}
      {marks.has("pair") && (
        <span className="absolute inset-[18%] rounded-full border-[3px] border-ink/70" />
      )}
      {props.givenColor && <span className="dog-ear" />}
      {props.number !== null && (
        <span
          key={props.popKey}
          className={`tile-number relative font-display font-extrabold ${props.givenNumber ? "given-number" : ""} ${props.animate && props.popKey !== undefined ? "animate-pop" : ""}`}
          style={{ color: color ? color.ink : "var(--ink)" }}
        >
          {props.number + 1}
        </span>
      )}
      {color && props.shapes && (
        <ShapeGlyph
          shape={color.shape}
          className="tile-shape absolute bottom-[8%] left-[8%] text-white/85"
        />
      )}
      {marks.has("wrong") && (
        <span className="absolute inset-0 flex items-center justify-center text-danger">
          <svg viewBox="0 0 24 24" className="size-3/4 opacity-80" aria-hidden="true">
            <path
              d="M5 5l14 14M19 5L5 19"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </button>
  );
};
