export interface TileColor {
  readonly name: string;
  readonly fill: string;
  readonly ink: string;
  readonly shape: Shape;
  readonly key: string;
}

export type Shape =
  | "circle"
  | "triangle"
  | "square"
  | "diamond"
  | "star"
  | "hexagon"
  | "plus"
  | "drop"
  | "moon";

export const tileColors: ReadonlyArray<TileColor> = [
  { name: "Red", fill: "#ff6b5b", ink: "#2b0a06", shape: "circle", key: "q" },
  { name: "Yellow", fill: "#ffd23f", ink: "#2a2000", shape: "triangle", key: "w" },
  { name: "Blue", fill: "#4ea8ff", ink: "#04203d", shape: "square", key: "e" },
  { name: "Green", fill: "#3ccf8e", ink: "#032a18", shape: "diamond", key: "r" },
  { name: "Purple", fill: "#a77bf3", ink: "#1d0b3a", shape: "star", key: "t" },
  { name: "Orange", fill: "#ff9f43", ink: "#2d1300", shape: "hexagon", key: "y" },
  { name: "Pink", fill: "#ff7eb6", ink: "#350519", shape: "plus", key: "u" },
  { name: "Teal", fill: "#19c2c2", ink: "#012828", shape: "drop", key: "i" },
  { name: "Brown", fill: "#b08060", ink: "#1f1006", shape: "moon", key: "o" },
];

export const colorAt = (index: number): TileColor => tileColors[index] ?? tileColors[0]!;

export const colorName = (index: number) => colorAt(index).name.toLowerCase();
