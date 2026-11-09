import { useQuery } from "@tanstack/react-query";
import { Schema } from "effect";
import { Settings } from "../../services/settings.ts";
import { settingsQuery } from "../queries.ts";

const defaults = Schema.decodeSync(Settings)({});

export const useSettings = () => useQuery(settingsQuery).data ?? defaults;
