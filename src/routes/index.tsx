import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "../ui/pages/home-page.tsx";
import { inProgressQuery, todayQuery } from "../ui/queries.ts";

export const Route = createFileRoute("/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(todayQuery),
      context.queryClient.ensureQueryData(inProgressQuery),
    ]),
  component: HomePage,
});
