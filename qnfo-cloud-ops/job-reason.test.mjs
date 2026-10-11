// JOB-REASON-1 + CRON-SINGLE-TRIGGER-1 offline suite (qnfo-cloud-ops). Loads the real worker.js (the cloudflare:sockets import
// swapped for a stub) and drives its scheduled handler against in-memory SQLite D1s and a stubbed fetch. Proves: a
// grant-followup run whose Gmail read fails writes a 'degraded' job-run row whose meta.reason names the unread mailbox, which
// qnfo-fleet-dashboard's WATCHMAKER_OPS grant-followup entry reads as counted, with that reason (without GMAIL_PASS the run is
// ok and not counted: GRANT-GMAIL-UNGRADED-1); the one tick drives the real handler and runs a slot once.
// Run: node qnfo-cloud-ops/job-reason.test.mjs   -> prints "N passed, 0 failed"
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
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, headers_json TEXT, received_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE worker_invocations (worker_name TEXT, endpoint TEXT, status_code INTEGER, duration_ms INTEGER, created_at TEXT);
INSERT INTO scheduler_state (key, value) VALUES ('cron_offset', '2');`);
const living = new DatabaseSync(":memory:");
living.exec("CREATE TABLE papers (slug TEXT, status TEXT)");
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

const calls = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  calls.push(u);
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "Content-Type": "application/json" } });
  if (u.startsWith("https://api.cloudflare.com/")) return J({ success: false, errors: [{ message: "offline" }] }, 403);   // schedule self-repair stays a no-op
  if (u === "https://api.github.com/repos/ThinkInAIXYZ/deepchat/releases/latest") return J({ tag_name: "v1.0.0", body: "" });
  return new Response("{}", { status: 200 });   // worker-health endpoints
};
const ctx = { waitUntil() {} };
const runs = (job) => audit.prepare("SELECT id, ts, status, text, meta FROM cloud_ops_events WHERE id >= ? AND id < ? ORDER BY ts, id").all("jr-" + job + "-", "jr-" + job + ".");

// 9. JOB-REASON-1: grant-followup rides worker-health (05:05 and 17:05 Amsterdam). GRANT-GMAIL-UNGRADED-1 (1.22.1): without
// GMAIL_PASS the owner keeps Gmail outside the fleet, so the run is ok and reports Gmail as not graded; with the credential
// set, a Gmail read that fails makes the row degraded and names the unread mailbox.
audit.exec("DELETE FROM cloud_ops_events");
await W.scheduled({ cron: "5 3,15 * * *" }, env, ctx);
let g = runs("grant-followup");
ok(g.length === 1 && g[0].status === "ok" && /"gmail":"no-credential: GMAIL_PASS unset"/.test(g[0].text) && /"gmail_graded":false/.test(g[0].text), "a run without GMAIL_PASS is an ok job-run row that reports Gmail as not graded (" + (g[0] && g[0].status + " " + g[0].text.slice(0, 160)) + ")");
ok(runs("worker-health").some((r) => r.status === "ok"), "the slot's own worker-health job still runs");
audit.exec("DELETE FROM cloud_ops_events");
await W.scheduled({ cron: "5 3,15 * * *" }, Object.assign({}, env, { GMAIL_PASS: "set-but-unreachable" }), ctx);
g = runs("grant-followup");
const gm = g[0] && JSON.parse(g[0].meta);
ok(g.length === 1 && g[0].status === "degraded" && /"gmail":"error:/.test(g[0].text), "with GMAIL_PASS set, a failed Gmail read is a degraded job-run row (" + (g[0] && g[0].status + " " + g[0].text.slice(0, 160)) + ")");
ok(gm && gm.job === "grant-followup" && /^Gmail not read \(error:/.test(gm.reason || ""), "meta.reason names the unread mailbox (" + JSON.stringify(gm) + ")");

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
ok(Number(st.stuck) === 1 && Number(st.gmail_pass_unset) === 0, "its stuck_sql counts the failed read, and no unset credential (" + JSON.stringify(st) + ")");
audit.prepare("INSERT INTO cloud_ops_events (id, ts, kind, job, status, meta) VALUES ('jr-grant-followup-full', ?, 'job-run', 'grant-followup', 'ok', ?)").run(new Date(Date.now() + 1000).toISOString(), JSON.stringify({ job: "grant-followup", status: "ok" }));
st = audit.prepare(gop.stuck_sql).get(...params);
ok(Number(st.stuck) === 0, "once a run reads every mailbox it holds a credential for, the op is clear");

// CRON-SINGLE-TRIGGER-1: the one tick drives the real handler.
const TICK = "*/10 * * * *";
audit.exec("DELETE FROM cloud_ops_events; DELETE FROM scheduler_state WHERE key LIKE 'slot:%'");
const MON0510 = Date.UTC(2026, 9, 5, 3, 10);   // Monday 05:10 Amsterdam
await W.scheduled({ cron: TICK, scheduledTime: MON0510 }, env, ctx);
const mon = audit.prepare("SELECT job FROM cloud_ops_events WHERE kind = 'job-run' ORDER BY job").all().map((r) => r.job);
ok(mon.includes("worker-health") && mon.includes("overdue-guard") && mon.includes("grant-followup"), "the 05:10 tick runs worker-health (05:05) with its companion and overdue-guard (05:10): " + mon.join(","));
const n1 = runs("worker-health").length;
await W.scheduled({ cron: TICK, scheduledTime: MON0510 + 600000 }, env, ctx);
ok(runs("worker-health").length === n1, "the next tick looks back over the same slot and does not run it again");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
