import { QueryClientProvider } from "@tanstack/react-query";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { registerPwa } from "./pwa/pwa.ts";
import { routeTree } from "./routeTree.gen.ts";
import "./styles.css";
import { ElsewhereScreen } from "./ui/components/elsewhere.tsx";
import { RouteError, Spinner } from "./ui/components/ui.tsx";
import {
  claimDatabase,
  onTakeover,
  requestTakeover,
  type DatabaseLock,
} from "./ui/database-owner.ts";
import { settleWrites } from "./ui/queries.ts";
import { queryClient, runtime } from "./ui/runtime.ts";

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultPendingMs: 200,
  defaultPendingComponent: () => <Spinner />,
  defaultErrorComponent: RouteError,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const takeOver = async () => {
  requestTakeover();
  const lock = await claimDatabase({ wait: true });
  lock?.release();
  window.location.reload();
};

const showElsewhere = (root: Root, moved: boolean) =>
  root.render(
    <StrictMode>
      <ElsewhereScreen moved={moved} onUseHere={takeOver} />
    </StrictMode>,
  );

const startApp = (root: Root, lock: DatabaseLock) => {
  onTakeover(() => {
    flushSync(() => showElsewhere(root, true));
    void settleWrites()
      .then(() => {
        queryClient.clear();
        return runtime.dispose();
      })
      .finally(lock.release);
  });
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HotkeysProvider>
          <RouterProvider router={router} />
        </HotkeysProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
};

registerPwa();

const element = document.getElementById("root");
if (element) {
  const root = createRoot(element);
  void claimDatabase({ wait: false }).then((lock) =>
    lock ? startApp(root, lock) : showElsewhere(root, false),
  );
}
