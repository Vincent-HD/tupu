import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    ssr: "server/main.ts",
    outDir: "dist-server",
    target: "node24",
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: "server.mjs" } },
  },
  ssr: { noExternal: true, target: "node" },
});
