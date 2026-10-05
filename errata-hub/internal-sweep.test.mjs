// ERRATA-INTERNAL-SWEEP-1 offline suite (#1164): drives the real errata-hub scheduled() and fetch handlers against an
// in-memory SQLite qnfo-audit built from the live schema of internal_errata and errata_queue (read 2026-10-05), and proves:
// the :00 tick moves an open internal_errata row that has no queue row (the qnfo-ops err-20260926-001 case) into
// errata_queue with email_id NULL, the internal source and status internal-open; a second tick adds nothing; closed,
// resolved and rejected rows stay out; the sweep makes no model call, sends no mail and calls nothing outside; respond
// and publish never act on the swept row even with pipeline_flags.errata_publish_enabled = '1'; an erratum queued by
// POST /internal-errata is not queued twice (also on a repeated POST); a tick queues at most 20; a sweep failure leaves
// the email triage running; the real hourly tick runs the sweep; /health states it.
// Run: node errata-hub/internal-sweep.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const self = {
        bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
      };
      return self;
    }
  };
}

const audit = new DatabaseSync(":memory:");
// internal_errata and errata_queue: verbatim from qnfo-audit sqlite_master (2026-10-05).
audit.exec(`CREATE TABLE internal_errata (id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_ref TEXT NOT NULL, detected_at TEXT NOT NULL, detected_by TEXT, severity TEXT DEFAULT 'high', claim_text TEXT, falsification TEXT, evidence TEXT, remediation TEXT, status TEXT DEFAULT 'open', owner TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE "errata_queue" (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER UNIQUE, source TEXT NOT NULL DEFAULT 'inbound-email', sender TEXT, subject TEXT, paper_doi TEXT, claim TEXT, confidence REAL, status TEXT DEFAULT 'detected', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE errata_watch (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, classification TEXT DEFAULT 'general', received_at TEXT DEFAULT (datetime('now')));
CREATE TABLE errata_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, queue_id INTEGER NOT NULL, email_id INTEGER, paper_doi TEXT, slug TEXT, version_from TEXT, version_to TEXT, risk TEXT DEFAULT 'low', clarification TEXT, acknowledgement TEXT, changelog TEXT, corrected_md TEXT, status TEXT DEFAULT 'drafted', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE email_suppression (email TEXT PRIMARY KEY, reason TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);`);
const papers = new DatabaseSync(":memory:");
papers.exec("CREATE TABLE papers (slug TEXT PRIMARY KEY, title TEXT, version TEXT, doi TEXT, zenodo_doi TEXT, body_md TEXT, r2_path TEXT, r2_key TEXT, updated_at TEXT)");
const graph = new DatabaseSync(":memory:");
graph.exec("CREATE TABLE nodes (id TEXT PRIMARY KEY, properties TEXT, updated_at TEXT)");

// The live state of 2026-10-05: one inbound-email queue row, and the qnfo-ops erratum that never reached the queue.
audit.prepare("INSERT INTO errata_queue (email_id, source, sender, subject, paper_doi, claim, confidence, status) VALUES (3, 'inbound-email', 'author@example.edu', 'AW: a paper', '10.5281/zenodo.22144215', 'misattribution', 0.8, 'implemented')").run();
const LIVE_ID = "err-20260926-001";
const LIVE_CLAIM = "Cosmic inflation is the epoch when the universe cooled and expanded enough for stable periodic processes to emerge.";
const addErr = (id, status, detectedBy, extra) => {
  const x = Object.assign({ kind: "chat_log", ref: "t-thread:a:1", claim: "claim of " + id, at: "2026-09-26T14:22:00Z" }, extra || {});
  audit.prepare("INSERT INTO internal_errata (id, target_kind, target_ref, detected_at, detected_by, severity, claim_text, status, owner) VALUES (?1, ?2, ?3, ?4, ?5, 'high', ?6, ?7, ?5)").run(id, x.kind, x.ref, x.at, detectedBy, x.claim, status);
};
addErr(LIVE_ID, "open", "qnfo-ops", { ref: "t-differences-between-sequence-ste-2026-09-17:a:1243978561", claim: LIVE_CLAIM });
addErr("err-closed", "closed", "qnfo-ops");
addErr("err-resolved", "resolved", "qnfo-ops");
addErr("err-rejected", "rejected", "qnfo-ops");

const aiCalls = [];
const AI = { async run(model) { aiCalls.push(model); return { response: "{}" }; } };
const sends = [];
const SEND_EMAIL = { async send(m) { sends.push(m); } };
const mirrorPuts = [];
const MIRROR = { async put(k) { mirrorPuts.push(k); } };
const fetches = [];
globalThis.fetch = async (url, init) => { fetches.push({ url: String(url && url.url || url), method: (init && init.method) || "GET" }); return new Response("{}", { status: 404 }); };
const env = { AI, SEND_EMAIL, MIRROR, ERRATA_TOKEN: "t0k", ZENODO_TOKEN: "test-zenodo", WATCH_DB: d1(audit), AUDIT_DB: d1(audit), PAPERS_DB: d1(papers), GRAPH_DB: d1(graph) };
const ctx = { waitUntil() {}, passThroughOnException() {} };

const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const quiet = async (fn) => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };
const tick = async (cron) => quiet(() => worker.scheduled({ cron, scheduledTime: Date.now(), tickEntry: true }, env, ctx));
const tickRow = (m) => { const r = audit.prepare("SELECT value FROM errata_watch WHERE key = ?").get("tick:" + m); return r ? JSON.parse(r.value) : null; };
const internalRows = () => audit.prepare("SELECT * FROM errata_queue WHERE email_id IS NULL ORDER BY id").all();
const queueCount = () => audit.prepare("SELECT COUNT(*) n FROM errata_queue").get().n;
const rowsFor = (id) => audit.prepare("SELECT * FROM errata_queue WHERE email_id IS NULL AND subject = ?").all(id);
const inboundBefore = JSON.stringify(audit.prepare("SELECT * FROM errata_queue WHERE email_id IS NOT NULL").all());
// The remediation contract issue-1164 probe, verbatim.
const PROBE = "SELECT '1' AS expected, CAST(CASE WHEN COUNT(*) >= 1 THEN 1 ELSE 0 END AS TEXT) AS observed FROM errata_queue WHERE email_id IS NULL";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

ok(audit.prepare(PROBE).get().observed === "0", "before the sweep the issue-1164 probe reads 0 (the live defect)");

// 1. The first :00 tick queues the open erratum, once, as internal-open.
await tick("0 * * * *");
let q = internalRows();
ok(q.length === 1, "exactly one new queue row with email_id NULL (" + q.length + ")");
const r1 = q[0] || {};
ok(r1.subject === LIVE_ID && r1.source === "internal_audit" && r1.sender === "qnfo-ops", "the row names the erratum and its internal source (" + JSON.stringify([r1.subject, r1.source, r1.sender]) + ")");
ok(r1.status === "internal-open" && r1.confidence === 1 && r1.claim === LIVE_CLAIM && r1.paper_doi === null, "the row enters as internal-open with the intake's confidence and the erratum's claim");
ok(queueCount() === 2 && JSON.stringify(audit.prepare("SELECT * FROM errata_queue WHERE email_id IS NOT NULL").all()) === inboundBefore, "the inbound-email row is untouched");
ok(["err-closed", "err-resolved", "err-rejected"].every((id) => rowsFor(id).length === 0), "closed, resolved and rejected errata are not swept");
let w = tickRow("errata-watch");
ok(w && w.ok === true && w.internal_sweep && w.internal_sweep.ok === true && w.internal_sweep.queued === 1 && w.internal_sweep.ids[0] === LIVE_ID, "tick:errata-watch records the sweep (" + JSON.stringify(w && w.internal_sweep) + ")");
ok(audit.prepare(PROBE).get().observed === "1", "the issue-1164 probe now reads 1");
ok(aiCalls.length === 0 && sends.length === 0 && fetches.length === 0, "the tick made no model call, sent no mail and called nothing outside");
ok(audit.prepare("SELECT COUNT(*) n FROM pipeline_flags").get().n === 0, "the sweep does not touch the publish gate");

// 2. A second tick adds nothing.
await tick("0 * * * *");
ok(internalRows().length === 1 && queueCount() === 2, "the second tick adds no row (" + queueCount() + ")");
w = tickRow("errata-watch");
ok(w.internal_sweep.ok === true && w.internal_sweep.candidates === 0 && w.internal_sweep.queued === 0, "the second tick finds no candidate");

// 3. Nothing publishes, even with the gate open.
audit.prepare("INSERT INTO pipeline_flags (key, value) VALUES ('errata_publish_enabled', '1')").run();
await tick("15 * * * *");
await tick("30 * * * *");
ok(audit.prepare("SELECT COUNT(*) n FROM errata_actions").get().n === 0, "errata-respond drafts nothing for the swept row");
ok((audit.prepare("SELECT status FROM errata_queue WHERE subject = ?").get(LIVE_ID) || {}).status === "internal-open", "the swept row stays internal-open");
const pub = tickRow("errata-publish");
ok(pub && pub.ok === true && pub.processed === 0 && pub.published.length === 0, "errata-publish processes nothing (" + JSON.stringify(pub && { processed: pub.processed, published: pub.published }) + ")");
ok(aiCalls.length === 0 && sends.length === 0 && fetches.length === 0 && mirrorPuts.length === 0, "no model call, mail, Zenodo call or R2 write");
audit.exec("DELETE FROM pipeline_flags");

// 4. An erratum filed through POST /internal-errata is queued once, also when the POST is repeated.
const post = (body) => quiet(async () => (await worker.fetch(new Request("https://errata-hub.example/internal-errata", { method: "POST", headers: { "content-type": "application/json", "X-Erratta-Token": "t0k" }, body: JSON.stringify(body) }), env, ctx)).json());
const RT = { id: "err-rt-1", source: "red_team", detected_by: "red_team", claim_text: "A red-team finding.", target_kind: "page", target_ref: "https://qnfo.org/x" };
const a1 = await post(RT);
const a2 = await post(RT);
ok(a1.ok === true && a2.ok === true && rowsFor("err-rt-1").length === 1 && rowsFor("err-rt-1")[0].source === "red_team", "a repeated intake POST leaves one queue row (" + rowsFor("err-rt-1").length + ")");
const unauth = await worker.fetch(new Request("https://errata-hub.example/internal-errata", { method: "POST", body: "{}" }), env, ctx);
ok(unauth.status === 401, "the intake still needs the errata token");
addErr("err-rt-2", "open", "red-team-2026q4");
addErr("rev-paper-1", "open", "qnfo-paper-reviser/1.2.7", { kind: "paper", ref: "10.5281/zenodo.123456" });
addErr("err-null-status", null, null);
await tick("0 * * * *");
ok(rowsFor("err-rt-1").length === 1, "the sweep does not queue an intake erratum a second time");
ok(rowsFor("err-rt-2").length === 1 && rowsFor("err-rt-2")[0].source === "red_team", "detected_by naming a red team maps to source red_team");
const rp = rowsFor("rev-paper-1")[0] || {};
ok(rp.source === "internal_audit" && rp.sender === "qnfo-paper-reviser/1.2.7" && rp.paper_doi === "10.5281/zenodo.123456", "a paper erratum carries its DOI (" + JSON.stringify([rp.source, rp.sender, rp.paper_doi]) + ")");
const rn = rowsFor("err-null-status")[0] || {};
ok(rn.source === "internal_audit" && rn.sender === "internal_audit", "a row with no status counts as open and gets the default source");
ok(tickRow("errata-watch").internal_sweep.queued === 3, "this tick queued the three new errata");

// 5. At most 20 per tick; every erratum ends with exactly one queue row.
for (let i = 0; i < 23; i++) addErr("err-bulk-" + String(i).padStart(2, "0"), "open", "qnfo-ops", { at: "2026-10-0" + (1 + (i % 4)) + "T00:00:00Z" });
await tick("0 * * * *");
ok(tickRow("errata-watch").internal_sweep.queued === 20, "a tick queues at most 20 (" + tickRow("errata-watch").internal_sweep.queued + ")");
await tick("0 * * * *");
ok(tickRow("errata-watch").internal_sweep.queued === 3, "the next tick queues the remaining 3");
await tick("0 * * * *");
ok(tickRow("errata-watch").internal_sweep.queued === 0, "then nothing is left");
const dup = audit.prepare("SELECT subject, COUNT(*) n FROM errata_queue WHERE email_id IS NULL GROUP BY subject HAVING n > 1").all();
const open = audit.prepare("SELECT COUNT(*) n FROM internal_errata WHERE COALESCE(status, 'open') NOT IN ('closed', 'resolved', 'rejected')").get().n;
ok(dup.length === 0 && internalRows().length === open, "one queue row per open erratum, no duplicates (" + internalRows().length + " rows, " + open + " open)");

// 6. A sweep failure keeps the email triage running and is recorded.
audit.exec("ALTER TABLE internal_errata RENAME TO internal_errata_gone");
await tick("0 * * * *");
w = tickRow("errata-watch");
ok(w.ok === true && w.internal_sweep.ok === false && /internal_errata/.test(w.internal_sweep.error), "a failed sweep is recorded and the watch tick still succeeds (" + JSON.stringify(w.internal_sweep) + ")");
audit.exec("ALTER TABLE internal_errata_gone RENAME TO internal_errata");

// 7. The real hourly tick (no tickEntry) runs the sweep.
addErr("err-hourly", "open", "qnfo-ops");
await quiet(() => worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 5, 18, 0) }, env, ctx));
ok(rowsFor("err-hourly").length === 1 && tickRow("errata-watch").internal_sweep.ids.join() === "err-hourly", "the hourly tick sweeps");
ok(aiCalls.length === 0 && sends.length === 0 && fetches.length === 0, "still no model call, mail or outside call after every tick");

// 8. /health states the sweep.
const h = await (await worker.fetch(new Request("https://errata-hub.example/health"), env, ctx)).json();
ok(h.internal_sweep === true && h.capabilities.includes("internal-errata-sweep") && /ERRATA-INTERNAL-SWEEP-1/.test(h.limitations.join(" ")) && /^1\.(?:4|[5-9]|[1-9][0-9])\./.test(h.version), "/health states the sweep (" + h.version + ")");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
