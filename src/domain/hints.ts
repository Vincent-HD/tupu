import { colorName } from "./palette.ts";
import type { Deduction, Layer, Line } from "./solver.ts";

const lineName = (line: Line) => `${line.kind} ${line.index + 1}`;

const valueName = (layer: Layer, value: number) =>
  layer === "number" ? `${value + 1}` : colorName(value);

// "a 3" for numbers, "red" for colors.
const someValue = (layer: Layer, value: number) =>
  layer === "number" ? `a ${value + 1}` : colorName(value);

const layerNoun = (layer: Layer) => (layer === "number" ? "number" : "color");

const otherNoun = (layer: Layer) => (layer === "number" ? "color" : "number");

export const pairName = (number: number, color: number) => `${colorName(color)} ${number + 1}`;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// The reasons a hint relies on are outlined on the board, so the text points at them.
export const explain = (step: Deduction): { readonly title: string; readonly body: string } => {
  const value = valueName(step.layer, step.value);
  const some = someValue(step.layer, step.value);
  const noun = layerNoun(step.layer);
  const line = step.line ? lineName(step.line) : "this line";
  const across = step.line?.kind === "column" ? "row" : "column";
  switch (step.technique) {
    case "last-in-line":
      return {
        title: "Last one standing",
        body: `${capitalize(line)} has a single tile without a ${noun}. The only ${noun} it is missing is ${value}.`,
      };
    case "hidden-single":
      return {
        title: "Only one seat left",
        body: `${capitalize(line)} still needs ${some}. Every other tile in ${line} without a ${noun} already has ${some} in its ${across} (outlined), so it can only go here.`,
      };
    case "naked-single":
      return {
        title: "Squeezed out",
        body: `The row and column of this tile already use every ${noun} except ${value} (outlined).`,
      };
    case "pair-exclusion":
      return {
        title: "Pairs are one of a kind",
        body:
          step.holding === undefined
            ? `The row and column of this tile rule out some ${noun}s. Each of the others is already paired, on the board, with every ${otherNoun(step.layer)} this tile could still take (outlined). Only ${value} is left.`
            : `${step.layer === "number" ? `This tile is already ${colorName(step.holding)}` : `This tile already holds a ${step.holding + 1}`}. Its row and column rule out some ${noun}s, and the others would repeat a pair already on the board (outlined). Only ${value} is left.`,
      };
    case "pair-hidden-single":
      return {
        title: "The pair rule narrows it",
        body: `${capitalize(line)} still needs ${some}. Every other tile in ${line} without a ${noun} either has ${some} in its ${across} or would repeat a pair already on the board (outlined). Only this tile can take it.`,
      };
    case "only-place-for-pair": {
      const pair =
        step.layer === "number"
          ? pairName(step.value, step.partner ?? 0)
          : pairName(step.partner ?? 0, step.value);
      return {
        title: "Hunt the missing pair",
        body: `The ${pair} is not on the board yet. Every other tile already holds another number or color, or shares a line with one of the outlined tiles. This is the only tile that can still hold both.`,
      };
    }
    case "deep-candidates":
      return {
        title: "Follow the possibilities",
        body: `Write down what every tile could still be: rows, columns and used pairs cut the options until this tile can only be ${value}. This one takes patience.`,
      };
  }
};
