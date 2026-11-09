import { createFileRoute } from "@tanstack/react-router";
import { TutorialPage } from "../ui/pages/tutorial-page.tsx";
import { tutorialQuery } from "../ui/queries.ts";

export const Route = createFileRoute("/tutorial")({
  loader: ({ context }) => context.queryClient.ensureQueryData(tutorialQuery),
  component: TutorialPage,
});
