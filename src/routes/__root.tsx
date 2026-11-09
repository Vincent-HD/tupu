import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { AppShell } from "../ui/app-shell.tsx";
import { NotFoundPage, RouteError, Spinner } from "../ui/components/ui.tsx";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: AppShell,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteError,
  pendingComponent: () => <Spinner />,
});
