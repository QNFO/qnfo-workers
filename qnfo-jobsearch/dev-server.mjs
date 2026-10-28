// Local copy of qnfo-jobsearch for user testing: the real worker.js, an in-memory SQLite standing in for D1, and a test mailbox that
// captures the sign-in code (GET /__code, test only). Live job feeds are fetched once at start so the page has real data.
// Run: node qnfo-jobsearch/dev-server.mjs [port]   then open http://localhost:8787/
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
let lastCode = null;
const env = { JOBS_DB: { prepare: (s) => stmt(s), batch: async (a) => { for (const x of a) await x.run(); return []; } },
  EMAIL: { fetch: async (u, init) => { const b = JSON.parse(init.body); lastCode = (b.body.match(/\b(\d{6})\b/) || [])[1]; console.log("[test mailbox] to " + b.to + ": code " + lastCode); return new Response("{}", { status: 200 }); } } };
const ctx = { waitUntil: (p) => { Promise.resolve(p).catch((e) => console.log("waitUntil error", e.message)); } };
const port = +process.argv[2] || 8787;
http.createServer(async (req, res) => {
  const url = "http://localhost:" + port + req.url;
  if (req.url === "/__code") { res.writeHead(200, { "content-type": "text/plain" }); return res.end(String(lastCode)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }), env, ctx);
  const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
  const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : []; if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(r.status, headers); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, async () => {
  console.log("listening on http://localhost:" + port + "  (first run fetching live feeds, about 30 s)");
  const t = Date.now(); await worker.scheduled({}, env, ctx);
  console.log("ready: first run finished in " + Math.round((Date.now() - t) / 1000) + " s");
});
