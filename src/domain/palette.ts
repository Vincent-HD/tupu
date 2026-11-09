export interface TileColor {
  readonly name: string;
  readonly fill: string;
  readonly ink: string;
  readonly shape: Shape;
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
  { name: "Red", fill: "#ff6b5b", ink: "#2b0a06", shape: "circle" },
  { name: "Yellow", fill: "#ffd23f", ink: "#2a2000", shape: "triangle" },
  { name: "Blue", fill: "#4ea8ff", ink: "#04203d", shape: "square" },
  { name: "Green", fill: "#3ccf8e", ink: "#032a18", shape: "diamond" },
  { name: "Purple", fill: "#a77bf3", ink: "#1d0b3a", shape: "star" },
  { name: "Orange", fill: "#ff9f43", ink: "#2d1300", shape: "hexagon" },
  { name: "Pink", fill: "#ff7eb6", ink: "#350519", shape: "plus" },
  { name: "Teal", fill: "#19c2c2", ink: "#012828", shape: "drop" },
  { name: "Brown", fill: "#b08060", ink: "#1f1006", shape: "moon" },
];

export const colorAt = (index: number): TileColor => tileColors[index] ?? tileColors[0]!;

export const colorName = (index: number) => colorAt(index).name.toLowerCase();
