import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, redirect } from "@tanstack/react-router";
import { AppShell } from "../ui/app-shell.tsx";
import { NotFoundPage, RouteError, Spinner } from "../ui/components/ui.tsx";
import { accountQuery } from "../ui/queries.ts";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    if (location.pathname === "/login") return;
    const account = await context.queryClient.ensureQueryData(accountQuery);
    // A brand-new account still has to pick the name shown on leaderboards.
    if (account === null || account.name === "") throw redirect({ to: "/login" });
  },
  component: AppShell,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteError,
  pendingComponent: () => <Spinner />,
});
