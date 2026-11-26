import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev mirrors production's /api proxy (server.mjs); the key stays out of the
// bundle in both. Dev reads HELIUS_API_KEY from web/.env.local (untracked).
export default defineConfig(({ mode }) => {
  const key = loadEnv(mode, process.cwd(), "").HELIUS_API_KEY ?? "";
  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Deep paths into the SDK dist that its export map does not list; the
      // mainnet spike pinned and proved them (see spike/live-lib.mjs).
      "@spr-dist": fileURLToPath(new URL("./node_modules/@heliuslabs/spr/dist", import.meta.url)),
    },
  },
  server: {
    port: 3031,
    proxy: {
      // Subpaths and query strings pass through: the prover lives at
      // /api/spr/prove/<circuit>/indexed and the SDK adds its own params.
      "/api/rpc": {
        target: "https://mainnet.helius-rpc.com",
        changeOrigin: true,
        rewrite: (p) => {
          const [path, q] = p.slice("/api/rpc".length).split("?");
          return `${path || "/"}?${q ? `${q}&` : ""}api-key=${key}`;
        },
      },
      "/api/spr": {
        target: "https://mainnet.helius-rpc.com",
        changeOrigin: true,
        rewrite: (p) => {
          const [path, q] = p.slice("/api/spr".length).split("?");
          return `/v1/spr${path}?${q ? `${q}&` : ""}api-key=${key}`;
        },
      },
    },
  },
  };
});
