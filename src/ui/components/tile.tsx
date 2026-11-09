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
  const folded = props.givenColor;
  const raise = marks.has("hint")
    ? "hint"
    : marks.has("lens-hit")
      ? "lens-hit"
      : marks.has("selected")
        ? "selected"
        : null;
  const lift =
    raise === "lens-hit" || raise === "selected" ? "-translate-x-0.5 -translate-y-0.5" : "";
  const ring = folded
    ? `${raise ? "z-10" : ""} ${lift}`
    : raise === "hint"
      ? "animate-pulse-marker z-10"
      : raise === "lens-hit"
        ? `z-10 ${lift} shadow-[0_0_0_3px_var(--marker),5px_5px_0_3px_var(--shadow)]`
        : raise === "selected"
          ? `z-10 ${lift} shadow-[0_0_0_3px_var(--marker),6px_6px_0_3px_var(--shadow)]`
          : "shadow-hard-sm";
  const danger = marks.has("conflict") || marks.has("wrong");
  const fill = color && !marks.has("lens-maybe") ? color.fill : "var(--card)";
  const overlayClip = folded ? "fold-clip" : "";
  return (
    <button
      type="button"
      aria-label={props.label}
      aria-pressed={marks.has("selected")}
      onClick={props.onSelect}
      className={`relative flex aspect-square cursor-pointer items-center justify-center rounded-[14%] border-[2.5px] transition-[transform,box-shadow] duration-100 ${
        folded ? "border-transparent" : danger ? "border-danger" : "border-ink"
      } ${ring} ${marks.has("conflict") && props.animate ? "animate-wiggle" : ""} ${
        marks.has("lens-dim") ? "opacity-20 saturate-0" : ""
      } ${marks.has("lens-maybe") ? "border-dashed" : ""} transition-[opacity,filter]`}
      style={{ backgroundColor: folded ? "transparent" : fill }}
    >
      {folded && (
        <FoldedFrame
          fill={fill}
          stroke={danger ? "var(--danger)" : "var(--ink)"}
          dashed={marks.has("lens-maybe")}
          ring={raise !== null}
          pulse={raise === "hint"}
          shadow={raise === "selected" ? 6 : raise === "lens-hit" ? 5 : raise === "hint" ? 4 : 2}
        />
      )}
      {marks.has("lens-maybe") && (
        <>
          <span className={`hatch absolute inset-0 rounded-[12%] ${overlayClip}`} />
          <span className="absolute right-[8%] bottom-[4%] font-display text-[0.7rem] font-extrabold text-ink-soft">
            ?
          </span>
        </>
      )}
      {!color && marks.has("related") && <span className="hatch absolute inset-0 rounded-[12%]" />}
      {color && marks.has("related") && (
        <span
          className={`absolute inset-[3px] rounded-[12%] border-2 border-dashed border-ink/40 ${overlayClip}`}
        />
      )}
      {marks.has("reason") && (
        <span
          className={`absolute -inset-1 rounded-[16%] border-[3px] border-dashed border-ink/70 ${overlayClip}`}
        />
      )}
      {marks.has("pair") && (
        <span className="absolute inset-[18%] rounded-full border-[3px] border-ink/70" />
      )}
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
              strokeLinecap="butt"
            />
          </svg>
        </span>
      )}
    </button>
  );
};

const fold = 32;
const corner = 13;
const join = 5;
const flapCorner = 7;
const crease = 100 - fold;
const slant = join / Math.SQRT2;
const outline = `M${corner} 0H${crease - join}Q${crease} 0 ${crease + slant} ${slant}L${100 - slant} ${fold - slant}Q100 ${fold} 100 ${fold + join}V${100 - corner}A${corner} ${corner} 0 0 1 ${100 - corner} 100H${corner}A${corner} ${corner} 0 0 1 0 ${100 - corner}V${corner}A${corner} ${corner} 0 0 1 ${corner} 0Z`;
const flapLegs = `M${crease} 1V${fold - flapCorner}Q${crease} ${fold} ${crease + flapCorner} ${fold}H99`;
const flap = `${flapLegs}L${crease} 1Z`;

const FoldedFrame = (props: {
  fill: string;
  stroke: string;
  dashed: boolean;
  ring: boolean;
  pulse: boolean;
  shadow: number;
}) => (
  <svg
    className="pointer-events-none absolute -inset-[1.25px] overflow-visible transition-[filter] duration-100"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden="true"
    style={{ filter: `drop-shadow(${props.shadow}px ${props.shadow}px 0 var(--shadow))` }}
  >
    {props.ring && (
      <path
        d={outline}
        fill="var(--marker)"
        stroke="var(--marker)"
        strokeWidth={8.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={props.pulse ? "animate-pulse" : ""}
      />
    )}
    <path d={outline} fill={props.fill} />
    <path d={flap} fill="rgb(255 255 255 / 0.55)" />
    <path
      d={flapLegs}
      fill="none"
      stroke={props.stroke}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    <path
      d={outline}
      fill="none"
      stroke={props.stroke}
      strokeWidth={2.5}
      strokeLinejoin="round"
      strokeDasharray={props.dashed ? "6 4" : undefined}
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);
