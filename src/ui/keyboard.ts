import { formatForDisplay } from "@tanstack/react-hotkeys";
import { Predicate } from "effect";
import { useEffect, useState } from "react";
import type { KeyboardLayout } from "../services/settings.ts";

export const colorKeyCodes = [
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyT",
  "KeyY",
  "KeyU",
  "KeyI",
  "KeyO",
] as const;
export const digitKeyCodes = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
] as const;
export const numpadKeyCodes = [
  "Numpad1",
  "Numpad2",
  "Numpad3",
  "Numpad4",
  "Numpad5",
  "Numpad6",
  "Numpad7",
  "Numpad8",
  "Numpad9",
] as const;

const layoutLabels: Readonly<
  Record<Exclude<KeyboardLayout, "auto">, Readonly<Record<string, string>>>
> = {
  qwerty: {},
  azerty: { KeyQ: "A", KeyW: "Z" },
  qwertz: { KeyY: "Z" },
};

export const layoutFromLanguage = (language: string): Exclude<KeyboardLayout, "auto"> => {
  const normalized = language.toLowerCase();
  if (normalized === "fr-ca") return "qwerty";
  if (normalized === "fr-ch" || /^(de|cs|sk|hu|sl|hr|sq|lb)\b/.test(normalized)) return "qwertz";
  if (/^fr\b/.test(normalized) || normalized === "nl-be") return "azerty";
  return "qwerty";
};

interface LayoutMap {
  readonly get: (code: string) => string | undefined;
}

interface LayoutMapKeyboard {
  readonly getLayoutMap: () => Promise<LayoutMap>;
}

const isLayoutMapKeyboard = (value: unknown): value is LayoutMapKeyboard =>
  Predicate.hasProperty(value, "getLayoutMap") && Predicate.isFunction(value.getLayoutMap);

const useBrowserLayoutMap = (enabled: boolean) => {
  const [layoutMap, setLayoutMap] = useState<LayoutMap | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const keyboard: unknown = Reflect.get(navigator, "keyboard");
    if (!isLayoutMapKeyboard(keyboard)) return;
    let cancelled = false;
    keyboard.getLayoutMap().then(
      (map) => {
        if (!cancelled) setLayoutMap(map);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return layoutMap;
};

export const colorKeyLabels = (input: {
  readonly setting: KeyboardLayout;
  readonly layoutMap: LayoutMap | null;
  readonly language: string;
}) =>
  colorKeyCodes.map((code) =>
    input.setting === "auto" && input.layoutMap
      ? formatForDisplay(`[${code}]`, { layoutMap: input.layoutMap })
      : formatForDisplay(`[${code}]`, {
          keyLabels:
            layoutLabels[
              input.setting === "auto" ? layoutFromLanguage(input.language) : input.setting
            ],
        }),
  );

export const useColorKeyLabels = (setting: KeyboardLayout): ReadonlyArray<string> => {
  const layoutMap = useBrowserLayoutMap(setting === "auto");
  return colorKeyLabels({ setting, layoutMap, language: navigator.language });
};
