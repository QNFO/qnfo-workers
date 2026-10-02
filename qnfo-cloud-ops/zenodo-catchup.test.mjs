// ZENODO-CATCHUP-1 + ZENODO-REFUSAL-STOP-1 + JOB-REASON-1 offline suite (qnfo-cloud-ops 1.18.3). Loads the real worker.js
// (the cloudflare:sockets import swapped for a stub) and drives its scheduled handler against in-memory SQLite D1s and a
// stubbed fetch. Proves: the daily release-check slot runs zenodo-stats as a catch-up when zenodo_stats is older than 180h
// and no zenodo-stats run started in 20h (the five-week freeze after the 2026-09-25..30 trigger outage), after its own job,
// logged as its own job-run row; it does not run when the weekly data is still inside its cadence, twice in a day, or
// from another slot; a failed Sunday run is retried the next day; a run Zenodo refuses stops after 20 reads and says why
// in meta.reason; and a grant-followup run without GMAIL_PASS writes a 'degraded' job-run row whose meta.reason names the
// unread mailbox, which qnfo-fleet-dashboard's WATCHMAKER_OPS grant-followup entry reads as counted, with that reason
// (not "never ran").
// Run: node qnfo-cloud-ops/zenodo-catchup.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var connect = function () { throw new Error('no sockets offline'); };")).toString("base64"));
const W = mod.default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const audit = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE scheduler_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE audit_sessions (session_id TEXT, agent TEXT, start_time TEXT, end_time TEXT, tasks_completed INTEGER, tasks_total INTEGER, notes TEXT);
CREATE TABLE zenodo_stats (doi TEXT PRIMARY KEY, conceptdoi TEXT, title TEXT, slug TEXT, downloads INTEGER, unique_downloads INTEGER, views INTEGER,
  unique_views INTEGER, version_downloads INTEGER, prev_downloads INTEGER, prev_views INTEGER, fetched_at TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE zenodo_attribution_audit (doi TEXT PRIMARY KEY, creators TEXT, related TEXT, creator_ok INTEGER, obsoleted_ok INTEGER, audited_at TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, headers_json TEXT, received_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE worker_invocations (worker_name TEXT, endpoint TEXT, status_code INTEGER, duration_ms INTEGER, created_at TEXT);
INSERT INTO scheduler_state (key, value) VALUES ('cron_offset', '2');`);
const living = new DatabaseSync(":memory:");
living.exec("CREATE TABLE papers (zenodo_doi TEXT, slug TEXT, status TEXT)");
const setCorpus = (n) => {
  living.exec("DELETE FROM papers");
  for (let i = 1; i <= n; i++) living.prepare("INSERT INTO papers VALUES (?, ?, 'published')").run("10.5281/zenodo." + (1000 + i), "p" + i);
};
setCorpus(3);
function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
      };
      return st;
    }
  };
}
const env = { AUDIT: d1(audit), LIVING: d1(living) };   // no GMAIL_PASS, no CF_TOKEN, no SEND_EMAIL

let zenodoMode = "ok";
const calls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  calls.push(u);
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json" } });
  if (u.startsWith("https://api.cloudflare.com/")) return J({ success: false, errors: [{ message: "offline" }] }, 403);   // schedule self-repair stays a no-op
  if (u === "https://api.github.com/repos/ThinkInAIXYZ/deepchat/releases/latest") return J({ tag_name: "v1.0.0", body: "" });
  if (u.startsWith("https://zenodo.org/api/records/")) {
    if (zenodoMode === "refuse") return new Response("<html>403 Forbidden</html>", { status: 403 });
    const id = u.split("/").pop();
    return J({ doi: "10.5281/zenodo." + id, metadata: { title: "Paper " + id, creators: [{ name: "Quni-Gudzinas, Rowan Brad" }] }, stats: { downloads: 7, unique_downloads: 5, views: 11, unique_views: 9, version_downloads: 7 } });
  }
  return new Response("{}", { status: 200 });   // worker-health endpoints
};
const ctx = { waitUntil() {} };
const RELEASE = "15 4 * * *";   // release-check, 06:15 Amsterdam at offset +2
const zCalls = () => calls.filter((u) => u.startsWith("https://zenodo.org/")).length;
const runs = (job) => audit.prepare("SELECT id, ts, status, text, meta FROM cloud_ops_events WHERE id >= ? AND id < ? ORDER BY ts, id").all("jr-" + job + "-", "jr-" + job + ".");
const reset = (dataAgeH, lastRunAgeH, lastRunStatus) => {
  audit.exec("DELETE FROM zenodo_stats; DELETE FROM cloud_ops_events");
  if (dataAgeH != null) audit.prepare("INSERT INTO zenodo_stats (doi, downloads, views, fetched_at, updated_at) VALUES ('10.5281/zenodo.1001', 1, 2, '20260829', datetime('now', ?))").run("-" + dataAgeH + " hours");
  if (lastRunAgeH != null) audit.prepare("INSERT INTO cloud_ops_events (id, ts, kind, job, status) VALUES ('jr-zenodo-stats-old', ?, 'job-run', 'zenodo-stats', ?)").run(new Date(Date.now() - lastRunAgeH * 36e5).toISOString(), lastRunStatus || "ok");
  calls.length = 0;
};

// 1. The live state of 2026-10-02: zenodo_stats last written 2026-08-29 (~818h), last run the 09-19 error (~314h).
reset(818, 314, "error");
await W.scheduled({ cron: RELEASE }, env, ctx);
let z = runs("zenodo-stats").filter((r) => r.id !== "jr-zenodo-stats-old");
const rc = runs("release-check");
ok(rc.length === 1 && rc[0].status === "ok", "the slot's own job (release-check) still runs and is logged");
ok(z.length === 1 && z[0].status === "ok" && JSON.parse(z[0].meta).via === "catch-up:release-check", "stale zenodo_stats and no run in 20h: the catch-up runs zenodo-stats, logged as its own job-run row (meta " + (z[0] && z[0].meta) + ")");
ok(rc.length === 1 && z.length === 1 && rc[0].ts <= z[0].ts, "the catch-up runs after the slot's own job");
ok(audit.prepare("SELECT COUNT(*) n FROM zenodo_stats WHERE julianday(updated_at) > julianday('now', '-1 hour')").get().n === 3 && zCalls() === 3, "all three records are fetched and zenodo_stats is fresh again");

// 2. A second tick the same day does nothing more.
calls.length = 0;
await W.scheduled({ cron: RELEASE }, env, ctx);
ok(runs("zenodo-stats").length === 2 && zCalls() === 0, "a second release-check tick the same day does not run it again");

// 3. The weekly cadence is left alone: Sunday's run is 165h old at the next Sunday's 04:15Z check.
reset(165, 165, "ok");
await W.scheduled({ cron: RELEASE }, env, ctx);
ok(runs("zenodo-stats").length === 1 && zCalls() === 0, "data inside the weekly cadence: no catch-up");

// 4. A failed Sunday run is retried on Monday (data 189h old, the failed run 21h ago).
reset(189, 21, "error");
await W.scheduled({ cron: RELEASE }, env, ctx);
ok(runs("zenodo-stats").length === 2 && zCalls() === 3, "a failed weekly run is retried the next morning");

// 5. At most once a day: a run (even a failed one) 5h ago holds the catch-up back.
reset(818, 5, "error");
await W.scheduled({ cron: RELEASE }, env, ctx);
ok(runs("zenodo-stats").length === 1 && zCalls() === 0, "a zenodo-stats run within 20h holds the catch-up back");

// 6. No data at all counts as stale.
reset(null, null);
await W.scheduled({ cron: RELEASE }, env, ctx);
ok(runs("zenodo-stats").length === 1 && zCalls() === 3, "an empty zenodo_stats is caught up");

// 7. Only the listed slot carries the catch-up; an unmapped cron still records its no-op and runs nothing.
reset(818, 314, "error");
await W.scheduled({ cron: "1 1 * * *" }, env, ctx);
ok(runs("zenodo-stats").length === 1 && zCalls() === 0 && audit.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'cron-noop'").get().n === 1, "an unmapped cron runs no catch-up (CRON-DISPATCH-NOOP-1 row only)");

// 8. ZENODO-REFUSAL-STOP-1: a Zenodo that refuses every read is asked 20 times, not 300, and the row says why.
setCorpus(300);
zenodoMode = "refuse";
reset(818, 314, "error");
await W.scheduled({ cron: RELEASE }, env, ctx);
z = runs("zenodo-stats").filter((r) => r.id !== "jr-zenodo-stats-old");
const zm = z[0] && JSON.parse(z[0].meta);
ok(zCalls() === 20, "an all-refused run stops after 20 reads (made " + zCalls() + ")");
ok(z.length === 1 && z[0].status === "error" && /"stopped_after":20/.test(z[0].text) && /"403":20/.test(z[0].text), "the run is an error with the 403s and the stop in its notes");
ok(zm && zm.via === "catch-up:release-check" && /no Zenodo record read: 20 failed \{"403":20\}, stopped after 20/.test(zm.reason || ""), "meta.reason says why (" + (zm && zm.reason) + ")");
await W.scheduled({ cron: RELEASE }, env, ctx);
ok(zCalls() === 20, "the refused run counts as today's attempt: no second try the same day");
zenodoMode = "ok";
setCorpus(3);

// 9. JOB-REASON-1: grant-followup rides worker-health (05:05 and 17:05 Amsterdam); without GMAIL_PASS its row is degraded
// and names the unread mailbox.
audit.exec("DELETE FROM cloud_ops_events");
await W.scheduled({ cron: "5 3,15 * * *" }, env, ctx);
const g = runs("grant-followup");
const gm = g[0] && JSON.parse(g[0].meta);
ok(g.length === 1 && g[0].status === "degraded" && /"gmail":"no-credential: GMAIL_PASS unset"/.test(g[0].text), "a run without GMAIL_PASS is a degraded job-run row (" + (g[0] && g[0].text.slice(0, 120)) + ")");
ok(gm && gm.job === "grant-followup" && gm.reason === "Gmail not read: the GMAIL_PASS secret is unset", "meta.reason names the unread mailbox (" + JSON.stringify(gm) + ")");
ok(runs("worker-health").some((r) => r.status === "ok"), "the slot's own worker-health job still runs");

// 10. The dashboard's WATCHMAKER_OPS grant-followup entry reads that real row as run, counted, with the reason.
const dsrc = readFileSync(new URL("../qnfo-fleet-dashboard/worker.js", import.meta.url), "utf8");
const da = dsrc.indexOf("var WATCHMAKER_OPS = ["), db_ = dsrc.indexOf("\n];", da);
if (da < 0 || db_ < da) throw new Error("WATCHMAKER_OPS not found in qnfo-fleet-dashboard/worker.js");
const OPS = vm.runInNewContext(dsrc.slice(da, db_ + 3) + "\nWATCHMAKER_OPS;");
const gop = OPS.find((o) => o.key === "grant-followup");
const last = audit.prepare(gop.sql).get().last;
ok(last === g[0].ts, "the watchmaker sql dates the degraded run as the runner's last run (not 'never ran')");
const params = (gop.stuck_hours || [48]).map((h) => new Date(Date.now() - h * 36e5).toISOString());
let st = audit.prepare(gop.stuck_sql).get(...params);
ok(Number(st.stuck) === 1 && Number(st.gmail_pass_unset) === 1, "its stuck_sql still counts the op, with the reason as a column (" + JSON.stringify(st) + ")");
audit.prepare("INSERT INTO cloud_ops_events (id, ts, kind, job, status, meta) VALUES ('jr-grant-followup-full', ?, 'job-run', 'grant-followup', 'ok', ?)").run(new Date(Date.now() + 1000).toISOString(), JSON.stringify({ job: "grant-followup", status: "ok" }));
st = audit.prepare(gop.stuck_sql).get(...params);
ok(Number(st.stuck) === 0, "once a run reads both mailboxes the op is clear");

// CRON-SINGLE-TRIGGER-1: the one tick drives the real handler. Sunday 2026-10-04 07:00Z is 09:00 in Amsterdam: zenodo-stats.
const TICK = "*/10 * * * *", SUN0900 = Date.UTC(2026, 9, 4, 7, 0);
zenodoMode = "ok";
audit.exec("DELETE FROM zenodo_stats; DELETE FROM cloud_ops_events; DELETE FROM scheduler_state WHERE key LIKE 'slot:%'");
calls.length = 0;
await W.scheduled({ cron: TICK, scheduledTime: SUN0900 }, env, ctx);
z = runs("zenodo-stats");
ok(z.length === 1 && z[0].status === "ok" && zCalls() === 3, "the tick at Sunday 09:00 Amsterdam runs zenodo-stats (" + z.length + " run(s), " + zCalls() + " reads)");
ok(audit.prepare("SELECT value FROM scheduler_state WHERE key = 'slot:zenodo-stats'").get().value === "2026-10-04 09:00", "the slot is recorded");
await W.scheduled({ cron: TICK, scheduledTime: SUN0900 + 600000 }, env, ctx);
ok(runs("zenodo-stats").length === 1, "the next tick looks back over the same slot and does not run it again");
await W.scheduled({ cron: TICK, scheduledTime: SUN0900 + 1800000 }, env, ctx);
ok(runs("zenodo-stats").length === 1 && audit.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'job-run'").get().n === 1, "a tick with nothing due runs nothing");
audit.exec("DELETE FROM cloud_ops_events; DELETE FROM scheduler_state WHERE key LIKE 'slot:%'");
await W.scheduled({ cron: TICK, scheduledTime: Date.UTC(2026, 9, 5, 3, 10) }, env, ctx);   // Monday 05:10 Amsterdam
const mon = audit.prepare("SELECT job FROM cloud_ops_events WHERE kind = 'job-run' ORDER BY job").all().map((r) => r.job);
ok(mon.includes("worker-health") && mon.includes("overdue-guard") && mon.includes("grant-followup"), "the 05:10 tick runs worker-health (05:05) with its companion and overdue-guard (05:10): " + mon.join(","));
await W.scheduled({ cron: "0 7 * * 1", scheduledTime: SUN0900 + 7 * 864e5 }, env, ctx);   // a per-slot trigger still registered
await W.scheduled({ cron: TICK, scheduledTime: SUN0900 + 7 * 864e5 }, env, ctx);
ok(runs("zenodo-stats").length === 1, "a legacy per-slot trigger and the tick on the same slot run the job once");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
