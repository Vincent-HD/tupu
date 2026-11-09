import { useCallback } from "react";
import type { Cue } from "../../services/sound.ts";
import { actions } from "../queries.ts";

export const useSound = () =>
  useCallback((cue: Cue, value?: number) => {
    actions.play({ cue, value });
  }, []);
