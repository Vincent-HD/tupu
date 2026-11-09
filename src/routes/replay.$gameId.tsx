import { createFileRoute } from "@tanstack/react-router";
import { ReplayPage } from "../ui/pages/replay-page.tsx";
import { gameQuery } from "../ui/queries.ts";

export const Route = createFileRoute("/replay/$gameId")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(gameQuery(params.gameId)),
  component: function ReplayRoute() {
    const { gameId } = Route.useParams();
    return <ReplayPage id={gameId} />;
  },
});
