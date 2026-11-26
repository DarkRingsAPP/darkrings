/* Static site + API proxy. The browser talks to /api/rpc (Solana RPC) and
   /api/spr (unified Photon indexer + TEE prover); the Helius key lives only
   here, in the HELIUS_API_KEY env var. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = process.env.PORT || 3000;
const KEY = process.env.HELIUS_API_KEY;
const DIST = new URL("./dist", import.meta.url).pathname;

/* Prefix routes: the SDK appends subpaths (for example /api/spr/prove/<circuit>/indexed)
   and its own query parameters; both must reach the upstream intact. */
const UPSTREAM = {
  "/api/rpc": "https://mainnet.helius-rpc.com",
  "/api/spr": "https://mainnet.helius-rpc.com/v1/spr",
};

const HOP_BY_HOP = new Set([
  "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
  "proxy-authorization", "proxy-connection", "te", "trailer", "content-length",
  "accept-encoding",
]);

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

async function proxy(req, res, base, url) {
  if (!KEY) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "HELIUS_API_KEY not configured" }));
    return;
  }
  const subpath = url.pathname.slice(base.length);
  const target = new URL(UPSTREAM[base] + subpath);
  for (const [k, v] of url.searchParams) target.searchParams.append(k, v);
  target.searchParams.set("api-key", KEY);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const r = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
      redirect: "manual",
    });
    const out = {};
    for (const [k, v] of r.headers) {
      if (!HOP_BY_HOP.has(k) && k !== "content-encoding") out[k] = v;
    }
    res.writeHead(r.status, out);
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
  const base = Object.keys(UPSTREAM).find(
    (p) => url.pathname === p || url.pathname.startsWith(p + "/"),
  );
  if (base) return proxy(req, res, base, url);
  // static with SPA fallback
  const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
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
