import { colorName } from "./palette.ts";
import type { Deduction, Layer, Line } from "./solver.ts";

const lineName = (line: Line) => `${line.kind} ${line.index + 1}`;

const valueName = (layer: Layer, value: number) =>
  layer === "number" ? `${value + 1}` : colorName(value);

const layerNoun = (layer: Layer) => (layer === "number" ? "number" : "color");

export const pairName = (number: number, color: number) => `${colorName(color)} ${number + 1}`;

export const explain = (step: Deduction): { readonly title: string; readonly body: string } => {
  const value = valueName(step.layer, step.value);
  const noun = layerNoun(step.layer);
  switch (step.technique) {
    case "last-in-line":
      return {
        title: "Last one standing",
        body: `${step.line ? capitalize(lineName(step.line)) : "This line"} has a single tile without a ${noun}. The only ${noun} it is missing is ${value}.`,
      };
    case "hidden-single":
      return {
        title: "Only one seat left",
        body: `${step.line ? capitalize(lineName(step.line)) : "This line"} still needs a ${value}. Every other open tile already sees a ${value} across its ${step.line?.kind === "row" ? "column" : "row"}, so it can only go here.`,
      };
    case "naked-single":
      return {
        title: "Squeezed out",
        body: `The row and column of this tile already use every ${noun} except ${value}.`,
      };
    case "pair-exclusion":
      return {
        title: "Pairs are one of a kind",
        body: `Look at what this tile already has. Its row and column rule out some ${noun}s, and the others would repeat a pair that is already on the board. Only ${value} is left.`,
      };
    case "pair-hidden-single":
      return {
        title: "The pair rule narrows it",
        body: `${step.line ? capitalize(lineName(step.line)) : "This line"} still needs ${value}. Only one open tile can take it without creating a duplicate number and color pair.`,
      };
    case "only-place-for-pair": {
      const pair =
        step.layer === "number"
          ? pairName(step.value, step.partner ?? 0)
          : pairName(step.partner ?? 0, step.value);
      return {
        title: "Hunt the missing pair",
        body: `The ${pair} is not on the board yet, and this is the only tile that can still hold both its number and its color.`,
      };
    }
    case "deep-candidates":
      return {
        title: "Follow the possibilities",
        body: `Write down what every tile could still be: rows, columns and used pairs cut the options until this tile can only be ${value}. This one takes patience.`,
      };
  }
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
