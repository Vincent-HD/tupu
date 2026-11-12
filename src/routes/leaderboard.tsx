import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { LeaderboardPage } from "../ui/pages/leaderboard-page.tsx";
import { customCategoriesQuery, todayQuery } from "../ui/queries.ts";

const LeaderboardSearch = Schema.Struct({ board: Schema.optionalKey(Schema.String) });

export const Route = createFileRoute("/leaderboard")({
  validateSearch: Schema.toStandardSchemaV1(LeaderboardSearch),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(todayQuery),
      context.queryClient.ensureQueryData(customCategoriesQuery),
    ]),
  component: function LeaderboardRoute() {
    const { board } = Route.useSearch();
    return <LeaderboardPage board={board} />;
  },
});
