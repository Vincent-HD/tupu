import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../ui/pages/settings-page.tsx";
import { settingsQuery } from "../ui/queries.ts";

export const Route = createFileRoute("/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: SettingsPage,
});
