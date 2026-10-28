// PAPER-PIDS-HASH-1 offline suite (qnfo-gateway 3.46.0): the immutable version URL and its SHA-256.
// Run: node qnfo-gateway/paper-pid-hash.test.mjs
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 300) : "")); } };
const CUR = "# Title\n\nCurrent body, version 2.0.\n";
const OLD = "# Title\n\nOld body, version 1.0.\n";
const row = { slug: "alpha", title: "Alpha", authors: '["Rowan Brad Quni-Gudzinas"]', abstract: "Abs", created_at: "2026-07-01 00:00:00", updated_at: "2026-10-01 00:00:00", first_published_at: "2026-07-01", last_revised_at: "2026-10-01 00:00:00", version_semver: "2.0", version_count: 2, doi: null, version: "v2.0", language: "en", keywords: "[]", license: "CC-BY-4.0", body_md: CUR };
const stmt = (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; },
  async all() { return { results: [] }; },
  async first() {
    if (/paper_change_ledger/.test(sql)) return st.a[0] === "alpha" && (st.a[1] === "1.0" || st.a[2] === "v1.0") ? { body_md: OLD } : null;
    if (/COUNT/.test(sql)) return { n: 1 };
    return st.a[st.a.length - 1] === "alpha" ? row : null;
  },
  async run() { return {}; } }; return st; };
const env = { LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, QNFO_BUCKET: { get: async () => null } };
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const get = async (path, method) => { const r = await gw.fetch(new Request("https://papers.qnfo.org" + path, { method: method || "GET" }), env, { waitUntil() {} }); return { s: r.status, t: await r.text(), h: r.headers }; };
const sha = (t) => createHash("sha256").update(t).digest("hex");

let r = await get("/papers/alpha/v/2.0");
ok(r.s === 200 && r.t === CUR && r.h.get("X-Content-SHA256") === sha(CUR), "current version served with its sha256", [r.s, r.h.get("X-Content-SHA256")]);
ok(!/immutable/.test(r.h.get("Cache-Control")), "the current version is not cached as immutable");
r = await get("/papers/alpha/v/1.0");
ok(r.s === 200 && r.t === OLD && r.h.get("X-Content-SHA256") === sha(OLD) && /immutable/.test(r.h.get("Cache-Control")), "superseded version comes from the ledger bodies and is immutable-cached", [r.s, r.t]);
r = await get("/papers/alpha/v/9.9");
ok(r.s === 404, "a version with no recoverable body is 404, never the current text", [r.s, r.t]);
r = await get("/papers/nope/v/1.0");
ok(r.s === 404, "unknown paper is 404");
r = await get("/api/papers/alpha/v/v1.0");
ok(r.s === 200 && r.t === OLD, "api alias and a leading v are accepted");
r = await get("/papers/alpha/v/2.0", "HEAD");
ok(r.s === 200 && r.t === "" && r.h.get("X-Content-SHA256") === sha(CUR), "HEAD returns the hash with no body");
r = await get("/api/papers/alpha");
const j = JSON.parse(r.t);
ok(j.sha256 === sha(CUR) && /\/papers\/alpha\/v\/2\.0$/.test(j.version_url || ""), "api record carries sha256 and version_url", j.sha256);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
