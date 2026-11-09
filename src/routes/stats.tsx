import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { difficulties } from "../domain/difficulty.ts";
import { StatsPage } from "../ui/pages/stats-page.tsx";
import { statsQuery } from "../ui/queries.ts";

const StatsSearch = Schema.Struct({
  difficulty: Schema.optionalKey(Schema.Literals(difficulties)),
});

export const Route = createFileRoute("/stats")({
  validateSearch: Schema.toStandardSchemaV1(StatsSearch),
  loader: ({ context }) => context.queryClient.ensureQueryData(statsQuery),
  component: function StatsRoute() {
    const { difficulty } = Route.useSearch();
    return <StatsPage difficulty={difficulty ?? "easy"} />;
  },
});
