/* Static site + API proxy. The browser talks to /api/rpc (Solana RPC) and
   /api/spr (unified Photon indexer + TEE prover); the Helius key lives only
   here, in the HELIUS_API_KEY env var. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = process.env.PORT || 3000;
const KEY = process.env.HELIUS_API_KEY;
const DIST = new URL("./dist", import.meta.url).pathname;

const UPSTREAM = {
  "/api/rpc": `https://mainnet.helius-rpc.com/?api-key=${KEY}`,
  "/api/spr": `https://mainnet.helius-rpc.com/v1/spr?api-key=${KEY}`,
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

async function proxy(req, res, upstream) {
  if (!KEY) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "HELIUS_API_KEY not configured" }));
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const r = await fetch(upstream, {
      method: req.method,
      headers: { "content-type": req.headers["content-type"] ?? "application/json" },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
    });
    res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `upstream: ${e.message}` }));
  }
}

async function serveFile(res, path) {
  const file = await readFile(path);
  res.writeHead(200, {
    "content-type": MIME[extname(path)] ?? "application/octet-stream",
    "cache-control": path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(file);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const base = url.pathname;
  const upstream = UPSTREAM[base];
  if (upstream) return proxy(req, res, upstream);
  // static with SPA fallback
  const safe = normalize(base).replace(/^(\.\.[/\\])+/, "");
  let path = join(DIST, safe === "/" ? "index.html" : safe);
  try {
    const s = await stat(path);
    if (s.isDirectory()) path = join(path, "index.html");
    await serveFile(res, path);
  } catch {
    try {
      await serveFile(res, join(DIST, "index.html"));
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }
}).listen(PORT, () => console.log(`darkrings web + proxy on :${PORT}`));
