import { RegistryProvider } from "@effect/atom-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { registerPwa } from "./pwa/pwa.ts";
import { App } from "./ui/app.tsx";

registerPwa();

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <RegistryProvider>
        <App />
      </RegistryProvider>
    </StrictMode>,
  );
