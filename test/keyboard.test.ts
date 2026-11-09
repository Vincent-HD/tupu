import { describe, expect, it } from "@effect/vitest";
import { colorKeyLabels, layoutFromLanguage } from "../src/ui/keyboard.ts";

describe("keyboard labels", () => {
  it("guesses the layout from the browser language", () => {
    expect(layoutFromLanguage("fr-FR")).toBe("azerty");
    expect(layoutFromLanguage("fr-CA")).toBe("qwerty");
    expect(layoutFromLanguage("de-DE")).toBe("qwertz");
    expect(layoutFromLanguage("en-US")).toBe("qwerty");
  });

  it("labels the physical top row for each layout", () => {
    const labels = (setting: "qwerty" | "azerty" | "qwertz") =>
      colorKeyLabels({ setting, layoutMap: null, language: "en-US" }).slice(0, 6).join("");
    expect(labels("qwerty")).toBe("QWERTY");
    expect(labels("azerty")).toBe("AZERTY");
    expect(labels("qwertz")).toBe("QWERTZ");
  });

  it("prefers the browser layout map in auto mode", () => {
    const layoutMap = new Map([
      ["KeyQ", "a"],
      ["KeyW", "z"],
    ]);
    expect(colorKeyLabels({ setting: "auto", layoutMap, language: "en-US" }).slice(0, 3)).toEqual([
      "A",
      "Z",
      "E",
    ]);
  });
});
