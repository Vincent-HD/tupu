import { QueryClientProvider } from "@tanstack/react-query";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerPwa } from "./pwa/pwa.ts";
import { routeTree } from "./routeTree.gen.ts";
import "./styles.css";
import { queryClient } from "./ui/runtime.ts";

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

registerPwa();

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HotkeysProvider>
          <RouterProvider router={router} />
        </HotkeysProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
