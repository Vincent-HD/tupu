import { createFileRoute } from "@tanstack/react-router";
import { PlayPage } from "../ui/pages/play-page.tsx";
import { gameQuery } from "../ui/queries.ts";

export const Route = createFileRoute("/play/$gameId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(gameQuery(params.gameId)),
  component: function PlayRoute() {
    const { gameId } = Route.useParams();
    return <PlayPage id={gameId} />;
  },
});
