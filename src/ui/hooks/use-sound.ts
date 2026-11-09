import { useAtomSet } from "@effect/atom-react";
import { useCallback } from "react";
import type { Cue } from "../../services/sound.ts";
import { playAtom } from "../atoms.ts";

export const useSound = () => {
  const play = useAtomSet(playAtom);
  return useCallback((cue: Cue, value?: number) => play({ cue, value }), [play]);
};
