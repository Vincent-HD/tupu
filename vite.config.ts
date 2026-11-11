import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, relative } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const publicFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? publicFiles(path) : [path];
  });

const serviceWorker = (): Plugin => ({
  name: "tupu-service-worker",
  apply: "build",
  enforce: "post",
  generateBundle(_, bundle) {
    const assets = Object.keys(bundle).filter((file) => !file.endsWith(".map"));
    const statics = publicFiles("public")
      .map((file) => relative("public", file))
      .filter((file) => !file.startsWith("screenshots/") && !file.startsWith("_"));
    const precache = [
      ...new Set(["/", "/index.html", ...[...assets, ...statics].map((file) => `/${file}`)]),
    ];
    const buildId = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);
    const source = stripTypeScriptTypes(readFileSync("src/pwa/service.worker.ts", "utf8"))
      .replace(/^export \{\};?\s*$/m, "")
      .replaceAll("__BUILD_ID__", JSON.stringify(buildId))
      .replaceAll("__PRECACHE__", JSON.stringify(precache));
    this.emitFile({ type: "asset", fileName: "sw.js", source });
  },
});

// In development the API server runs separately (pnpm dev:api); the proxy keeps
// the Host header so passkeys are bound to the address open in the browser.
const apiProxy = `http://localhost:${process.env["API_PORT"] ?? "8787"}`;

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    serviceWorker(),
  ],
  optimizeDeps: { exclude: ["@effect/wa-sqlite"] },
  server: { proxy: { "/rpc": apiProxy, "/api/auth": apiProxy } },
  preview: { proxy: { "/rpc": apiProxy, "/api/auth": apiProxy } },
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 900 },
  test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 },
});
