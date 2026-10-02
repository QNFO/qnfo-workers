// radar-hub offline suite (1.1.3): JOB-MARKET-INLINE-1, MENTION-RADAR-LEDGER-1, EVENTS-RADAR-CF-DOW-1.
// Loads the real worker.js (the cloudflare:workers import swapped for a stub), drives its scheduled and fetch handlers
// against an in-memory SQLite D1 that carries the live handoffs claim_sheet trigger, with a stubbed fetch. Proves: the
// Monday job-market cron runs the scan itself (never touching the Workflow binding), writes the handoffs row the
// watchmaker reads, with a claim_sheet the live trigger accepts, and still records when the vault write fails; a
// mention-radar run writes one cloud_ops_events row per day, error when every source fails; every declared cron is
// routed, and the events and job-market crons fire on Monday under Cloudflare's numbering (1=Sunday..7=Saturday).
// Run: node radar-hub/radar-hub.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.startsWith(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const W = mod.default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE handoffs (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, project_id TEXT NOT NULL, phase_completed INTEGER, summary TEXT,
  pending_work TEXT, next_action TEXT, r2_handoff_path TEXT, timestamp TEXT NOT NULL DEFAULT (datetime('now')), wbs_code TEXT, dod_verdict TEXT, claim_sheet TEXT);
CREATE TRIGGER handoffs_claim_sheet_required_ins BEFORE INSERT ON handoffs WHEN NEW.claim_sheet IS NULL OR length(NEW.claim_sheet) < 3 BEGIN SELECT RAISE(ABORT, 'FRAMEWORK-DOGFOOD-1: handoffs.claim_sheet required'); END;
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE external_mentions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, title TEXT, url TEXT, author TEXT, score INTEGER, created TEXT, first_seen TEXT, UNIQUE(source, url));
CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL,
  quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));`);
function stmtOn(sql) {
  let args = [];
  const s = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  };
  return s;
}
const AUDIT = { prepare: (sql) => stmtOn(sql) };

// ---------- the live trigger really refuses the old insert (defect 2) ----------
let refused = false;
try { db.prepare("INSERT INTO handoffs (session_id, project_id, summary, timestamp) VALUES ('cloud-workflow', 'job-market-watch-workflow-x', 's', 't')").run(); } catch (e) { refused = /claim_sheet required/.test(String(e.message)); }
ok(refused, "the handoffs trigger refuses a row without a claim_sheet, as the old record step wrote it");

// ---------- JOB-MARKET-INLINE-1 ----------
const calls = [];
let lever = 200;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  calls.push({ u, ua: init && init.headers && init.headers["User-Agent"] });
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json" } });
  if (u.startsWith("https://api.lever.co/")) return lever === 200 ? J([{ text: "Research Scientist" }, { text: "Data Engineer" }]) : new Response("no", { status: lever });
  if (u.startsWith("https://api.ashbyhq.com/")) return J({ jobs: [{ title: "Quantum Engineer" }] });
  if (u === "https://forecastingresearch.org/careers") return new Response('<a href="/j/1">Senior Research Analyst</a> info@forecastingresearch.org', { status: 200 });
  // mention radar sources
  if (u.startsWith("https://api.openalex.org/")) return J({ error: "Rate limit exceeded" }, 429);
  if (u.startsWith("https://api.datacite.org/")) return J({ data: [], links: {} });
  if (u.startsWith("https://api.bsky.app/xrpc/app.bsky.feed.searchPosts")) return J({ posts: [{ uri: "at://did:plc:other/app.bsky.feed.post/r1", author: { did: "did:plc:other", handle: "reader.bsky.social", displayName: "A Reader" }, record: { text: "Reading https://papers.qnfo.org/papers/x/ today", createdAt: "2026-10-01T00:00:00Z" }, likeCount: 1 }] });
  if (u.startsWith("https://hn.algolia.com/")) return J({ hits: [] });
  return new Response("not found", { status: 404 });
};
const puts = [];
let vaultFails = false;
const VAULT = { async put(key, body) { if (vaultFails) throw new Error("R2 put failed"); puts.push({ key, body }); } };
const JOB_MARKET_WATCH = { create() { throw new Error("the cron must not depend on the Workflow resource"); } };
const env = { AUDIT, AUDIT_DB: AUDIT, RADAR_DB: AUDIT, VAULT, JOB_MARKET_WATCH, RADAR_TOKEN: "t" };
const today = new Date().toISOString().slice(0, 10);

await W.scheduled({ cron: "0 7 * * 2" }, env, { waitUntil() {} });
let h = db.prepare("SELECT * FROM handoffs ORDER BY id DESC LIMIT 1").get();
ok(h && h.session_id === "cloud-workflow" && h.project_id === "job-market-watch-workflow-" + today && h.wbs_code === "JOB-MARKET-WATCH", "the Monday cron writes the handoffs row itself (no Workflow instance)");
const cs = h && JSON.parse(h.claim_sheet);
ok(cs && /3 boards \(1 GREEN \/ 2 RED\), 3 read, 4 roles/.test(cs.claim) && cs.status === "verified" && cs.boards.length === 3, "the claim_sheet states what was read (" + (cs && cs.claim) + ")");
ok(h.r2_handoff_path === "notes/v1/" + today.slice(0, 4) + "/" + today.slice(5, 7) + "/" + today + "/_job-market-watch-workflow-" + today + ".md" && puts.length === 1 && /Research Scientist/.test(puts[0].body), "the vault note is written and its key recorded");
ok(/Monday 07:00Z \(cron 0 7 \* \* 2\)/.test(h.next_action), "the next-run note names the real weekday");
ok(calls.filter((c) => /lever|ashby|forecasting/.test(c.u)).every((c) => /^QNFO-job-market-watch\//.test(c.ua || "")), "board reads name the client honestly");
// The watchmaker proof query (qnfo-fleet-dashboard WATCHMAKER_OPS job-market-watch).
const proof = db.prepare("SELECT MAX(timestamp) AS last FROM handoffs WHERE project_id >= 'job-market-watch-workflow-' AND project_id < 'job-market-watch-workflow.'").get().last;
ok(proof === h.timestamp && /^\d{4}-\d{2}-\d{2}T/.test(proof), "the watchmaker proof query reads the run");
vaultFails = true; lever = 503;
await W.scheduled({ cron: "0 7 * * 2" }, env, { waitUntil() {} });
h = db.prepare("SELECT * FROM handoffs ORDER BY id DESC LIMIT 1").get();
ok(db.prepare("SELECT COUNT(*) n FROM handoffs").get().n === 2 && h.r2_handoff_path === null && /vault note not written: R2 put failed/.test(h.claim_sheet) && /epoch:error HTTP 503/.test(h.claim_sheet), "a vault failure or a dead board still records the run, saying what failed");
ok(typeof mod.JobMarketWatchWorkflow === "function", "JobMarketWatchWorkflow stays exported for the declared binding and manual instances");

// ---------- MENTION-RADAR-LEDGER-1 ----------
const run = async () => (await W.fetch(new Request("https://radar-hub.example/mentions/run", { method: "POST", headers: { authorization: "Bearer t" } }), env, {})).json();
let mr = await run();
let ev = db.prepare("SELECT * FROM cloud_ops_events WHERE id = ?").get("mention-radar-" + today);
ok(mr.recorded === true && ev && ev.kind === "mention-radar" && ev.job === "radar-hub" && ev.status === "degraded", "a run writes mention-radar-<day> (openalex refused, so degraded)");
ok(JSON.parse(ev.meta).sources.openalex.startsWith("error:") && JSON.parse(ev.meta).sources.bluesky === "ok:1" && db.prepare("SELECT COUNT(*) n FROM external_mentions").get().n === 1, "the row names each source's outcome and the mention is stored");
await run();
ok(db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE id LIKE 'mention-radar-%'").get().n === 1, "a second run the same day replaces the row");
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("down", { status: 503 });
mr = await run();
ev = db.prepare("SELECT * FROM cloud_ops_events WHERE id = ?").get("mention-radar-" + today);
ok(mr.status === "error" && ev.status === "error", "a run whose every source fails is recorded as an error, not left silent");
globalThis.fetch = realFetch;
const mproof = db.prepare("SELECT MAX(ts) AS last FROM cloud_ops_events WHERE id >= 'mention-radar-' AND id < 'mention-radar.' AND status IN ('ok', 'degraded')").get().last;
ok(mproof === null, "the watchmaker proof ignores an error run");

// ---------- EVENTS-RADAR-CF-DOW-1 and cron routing ----------
const NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const cfDays = (field) => { if (field === "*") return NAMES.slice(); const out = []; for (const part of field.split(",")) { const [a, b] = part.split("-").map(Number); for (let n = a; n <= (b || a); n++) out.push(NAMES[n - 1]); } return out; };
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
// CRON-SINGLE-TRIGGER-1: wrangler.toml declares the one hourly tick; the nine former crons are CRON_TABLE in worker.js.
ok(/^crons = \["0 \* \* \* \*"\]$/m.test(toml), "wrangler.toml declares the single hourly tick");
const m = /var CRON_TABLE = \[([^\]]*)\];/.exec(src);
const crons = m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [];
ok(crons.length === 9, "nine table entries, as before (net-zero; got " + crons.length + ")");
const sched = src.slice(src.indexOf("    return cronTickDispatch(event, async function (event) {\n    const c = event.cron;"));
ok(crons.every((c) => sched.includes('"' + c + '"')), "every declared cron is routed by the hub's scheduled handler");
ok(crons.includes("0 5 * * 2") && !crons.includes("0 5 * * 1") && cfDays("2").join() === "MON", "the events radar cron fires Monday, the day it reads its weekly sources");
ok(cfDays(crons.find((c) => c.startsWith("0 7 ")).split(" ")[4]).join() === "MON", "the job-market cron fires Monday 07:00Z");
ok(/strftime\('%w','now'\) AS INTEGER\)=1/.test(src), "the events radar still reads weekly sources on strftime %w = 1 (Monday)");
const h1 = await (await W.fetch(new Request("https://radar-hub.example/health"), {}, {})).json();
ok(h1.version === (/var VERSION = "([^"]+)"/.exec(src) || [])[1], "/health reports the hub VERSION (" + h1.version + ")");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
