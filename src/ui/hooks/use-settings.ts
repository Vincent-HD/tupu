import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Schema } from "effect";
import { Settings } from "../../services/settings.ts";
import { settingsAtom } from "../atoms.ts";

const defaults = Schema.decodeSync(Settings)({});

export const useSettings = () => AsyncResult.getOrElse(useAtomValue(settingsAtom), () => defaults);
