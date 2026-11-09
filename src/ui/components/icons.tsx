import type { SVGProps } from "react";

const paths = {
  back: "M15 5l-7 7 7 7",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3",
  check: "M4 12.5l5 5L20 6.5",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0012 3z",
  pause: "M8 5v14M16 5v14",
  play: "M7 4.5v15l12-7.5z",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 01-2.1 1.2L14.7 21h-4l-.3-2.4a7 7 0 01-2.1-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 010-2.4L4.4 9.9l2-3.4 1.9.7a7 7 0 012.1-1.2L10.7 3h4l.3 2.4a7 7 0 012.1 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 010 2.4z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  trophy:
    "M8 4h8v5a4 4 0 01-8 0V4zM8 6H4v2a3 3 0 003 3M16 6h4v2a3 3 0 01-3 3M12 13v4M8 21h8M9 17h6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  book: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 5v16M8 7h7",
  soundOn: "M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12",
  soundOff: "M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6",
  eraser: "M15 4l5 5-9.5 9.5H6L3 15.5zM10 9l5 5M6 18.5h14",
  share: "M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  plus: "M12 5v14M5 12h14",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
  flame: "M12 22a7 7 0 007-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 007 7z",
  sparkle:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  upload: "M12 21V9M7 14l5-5 5 5M5 3h14",
  x: "M6 6l12 12M18 6L6 18",
  dice: "M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
} as const;

export type IconName = keyof typeof paths;

export const Icon = ({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d={paths[name]} />
  </svg>
);
