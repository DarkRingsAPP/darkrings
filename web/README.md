# darkrings web

The site and desk, live at [darkrings.app](https://darkrings.app).

- `npm run dev` serves on :3031 with the same /api proxy shape as production (key from `.env.local`, untracked).
- `npm run build` then `node server.mjs` is what production runs; the Helius key lives in the `HELIUS_API_KEY` env var, never in the bundle.
- Deploys: every push to `main` that touches `web/` builds and ships automatically (Railway, root directory `web`). Manual fallback: `railway up --service darkrings` from this folder.
