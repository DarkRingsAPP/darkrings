import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev mirrors production's /api proxy (server.mjs); the key stays out of the
// bundle in both. Dev reads HELIUS_API_KEY from web/.env.local (untracked).
export default defineConfig(({ mode }) => {
  const key = loadEnv(mode, process.cwd(), "").HELIUS_API_KEY ?? "";
  return {
  plugins: [react(), tailwindcss()],
  server: {
    port: 3031,
    proxy: {
      "/api/rpc": {
        target: "https://mainnet.helius-rpc.com",
        changeOrigin: true,
        rewrite: () => `/?api-key=${key}`,
      },
      "/api/spr": {
        target: "https://mainnet.helius-rpc.com",
        changeOrigin: true,
        rewrite: () => `/v1/spr?api-key=${key}`,
      },
    },
  },
  };
});
