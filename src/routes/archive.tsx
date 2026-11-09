import { createFileRoute } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArchivePage } from "../ui/pages/archive-page.tsx";
import { todayQuery } from "../ui/queries.ts";

const ArchiveSearch = Schema.Struct({ month: Schema.optionalKey(Schema.String) });

export const Route = createFileRoute("/archive")({
  validateSearch: Schema.toStandardSchemaV1(ArchiveSearch),
  loader: ({ context }) => context.queryClient.ensureQueryData(todayQuery),
  component: function ArchiveRoute() {
    const { month } = Route.useSearch();
    return <ArchivePage month={month} />;
  },
});
