import type { Shape } from "../../domain/palette.ts";

const shapes: Readonly<Record<Shape, string>> = {
  circle: "M12 3a9 9 0 110 18 9 9 0 010-18z",
  triangle: "M12 3l10 17H2z",
  square: "M4 4h16v16H4z",
  diamond: "M12 2l10 10-10 10L2 12z",
  star: "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z",
  hexagon: "M7 3h10l5 9-5 9H7l-5-9z",
  plus: "M9 2h6v7h7v6h-7v7H9v-7H2V9h7z",
  drop: "M12 2c4 5 7 8.5 7 12a7 7 0 01-14 0c0-3.5 3-7 7-12z",
  moon: "M15 2a10 10 0 100 20A8 8 0 0115 2z",
};

export const ShapeGlyph = ({ shape, className }: { shape: Shape; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d={shapes[shape]}
      fill="currentColor"
      stroke="var(--ink)"
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);
