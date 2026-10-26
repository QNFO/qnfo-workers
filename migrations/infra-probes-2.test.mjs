// INFRA-PROBES-2 offline suite: replays migrations/2026-10-26-infra-probes-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, a BACKUP table created first, nothing deleted or dropped, decision_log only inserted into); issue-1000162 (parked by the probe review) ends active
// on code-read with a spec the consumer's parse_code_probe accepts and that PASSES against this tree (OPS-STREAM-ABORT-1 in qnfo-ops/worker.js); the detector fm-ops-stream-incomplete-long and the bounded
// fm-ops-capped-reply-logged-ok are literal read-only SELECTs (the consumer's is_literal_select) that return short tokens and measure what they say on crafted ops_ai_log rows (turns before the bound are never counted,
// a recent defect row is, short turns, ok turns, unstreamed turns and honest-line replies are not); a failure mode row, one dated update on 1000162 and one decision_log row are written; a replay appends nothing;
// the Rollback line restores the two contracts and the description and supersedes the new detector.
// Output MUST contain "0 failed" on success.   node migrations/infra-probes-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-infra-probes-2.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(header.some((l) => /^-- BACKUP: bak_20261026_rem_a6_probes2\s*$/.test(l)) && /CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_probes2 AS/.test(body) && /CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_probes2_desc AS/.test(body), "both BACKUP tables are created, the contract one is named");
ok(body.indexOf("CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_probes2 ") < body.indexOf("UPDATE remediation_contracts") && body.indexOf("CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_probes2_desc") < body.indexOf("UPDATE remediation_contracts"), "the backups are created before the first update");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(![...body.matchAll(/LIKE\s+'((?:[^']|'')*)'/gi)].some((m) => Buffer.byteLength(m[1]) > 50), "no LIKE pattern above 50 bytes (D1 limit)");

const OLD_CAPPED = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM ops_ai_log WHERE ok = 1 AND completion_tokens IN (8000, 8192) AND instr(response, 'The reply was cut at the output cap') <> 1 AND ts > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')) AS TEXT) AS observed";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL DEFAULT '', verify_transport TEXT NOT NULL DEFAULT 'd1-query', max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT 'x', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE ops_ai_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, ok INTEGER, streamed INTEGER, latency_ms INTEGER, completion_tokens INTEGER, response TEXT);`);
  for (const id of [1000162, 999001]) w.prepare("INSERT INTO agent_issues (id, title, description, updated_at) VALUES (?, ?, ?, 1)").run(id, "t" + id, "ORIGINAL-" + id);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict, module, attempts) VALUES ('issue-1000162', 1000162, 'SELECT 1', 'd1-query', 'probe-review-refused', 'probe-review-refused', 'infra-probes-1', 1)").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict, module, attempts) VALUES ('fm-ops-capped-reply-logged-ok', NULL, ?, 'd1-query', 'active', 'fail', 'failure-mode', 2)").run(OLD_CAPPED);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, module) VALUES ('issue-9999999', 9999999, 'x', 'd1-query', 'superseded', 'other')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const w = world();
w.exec(sql);
const rc = (cls) => q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", cls);

const c62 = rc("issue-1000162"), cap = rc("fm-ops-capped-reply-logged-ok"), det = rc("fm-ops-stream-incomplete-long");
ok(c62.status === "active" && c62.verify_transport === "code-read" && c62.last_verdict === null && c62.attempts === 0 && c62.module === "infra-probes-2", "issue-1000162 leaves probe-review-refused: active on code-read with a clean slate", { s: c62.status, t: c62.verify_transport });
ok(cap.status === "active" && cap.last_verdict === null && cap.attempts === 0 && cap.module === "failure-mode" && cap.verify_probe !== OLD_CAPPED, "the capped-reply detector keeps its module and gets a new probe with a clean slate");
ok(det && det.status === "active" && det.verify_transport === "d1-query" && det.issue_id === null && det.module === "failure-mode", "the stream detector is an active d1-query failure-mode contract with no issue (an issue contract could be reviewed against the issue's done condition)", det && { s: det.status, i: det.issue_id });
ok(rc("issue-9999999").status === "superseded", "a contract that is not named is not touched");
const fmRow = q1(w, "SELECT * FROM failure_modes WHERE fm_key = 'ops-stream-incomplete-long'");
ok(fmRow && fmRow.issue_id === 1000162 && fmRow.probe_class === "fm-ops-stream-incomplete-long" && /instrumentation/i.test(fmRow.remediation) && /Not found/.test(fmRow.root_cause), "the failure mode is registered against issue 1000162 and states that the root cause is not found", fmRow && { k: fmRow.fm_key });

// the code-read spec: parsed by the consumer and passing against this tree
const spec = JSON.parse(c62.verify_probe);
ok(Array.isArray(spec.paths) && spec.paths.length === 1 && spec.paths[0] === "qnfo-ops/worker.js" && spec.contains === "OPS-STREAM-ABORT-1" && !("absent" in spec), "the code-read spec names qnfo-ops/worker.js and OPS-STREAM-ABORT-1", spec);
ok(readFileSync(join(root, spec.paths[0]), "utf8").includes(spec.contains), "the marker is in qnfo-ops/worker.js of this tree (the probe passes)");
{
  const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
  if (!PY) console.log("note: no python 3 on this host, the consumer gate checks are skipped");
  else {
    const prog = "import sys, json, os\nos.environ.setdefault('CLOUDFLARE_ACCOUNT_ID','a'); os.environ.setdefault('CLOUDFLARE_API_TOKEN','t'); os.environ.setdefault('CF_API_TOKEN','t')\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\nd = json.loads(sys.stdin.read())\np, why = r.parse_code_probe(d['code'])\nprint(json.dumps([p is not None, why, list(r.is_literal_select(d['a'])), list(r.is_literal_select(d['b']))]))";
    const run = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: JSON.stringify({ code: c62.verify_probe, a: det.verify_probe, b: cap.verify_probe }), encoding: "utf8" });
    let parsed = null;
    try { parsed = JSON.parse(String(run.stdout).trim().split("\n").pop()); } catch (e) { parsed = null; }
    ok(run.status === 0 && parsed && parsed[0] === true, "the consumer's own parse_code_probe accepts the code-read spec", { status: run.status, parsed, err: String(run.stderr).slice(0, 200) });
    ok(run.status === 0 && parsed && parsed[2][0] === true && parsed[3][0] === true, "and is_literal_select accepts both d1 probes (single literal read-only SELECT, no write keyword even in a literal)", parsed && [parsed[2], parsed[3]]);
  }
}

// the d1 probes on crafted ops_ai_log rows
const TOKEN = /^[A-Za-z0-9_.:+-]{1,64}$/;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const H = 3600e3, D = 24 * H;
const put = (ts, o) => w.prepare("INSERT INTO ops_ai_log (ts, ok, streamed, latency_ms, completion_tokens, response) VALUES (?, ?, ?, ?, ?, ?)").run(ts, o.ok, o.streamed, o.latency_ms || 0, o.completion_tokens || 0, o.response || "");
const run1 = (probe) => q1(w, probe);
{
  const p0 = run1(det.verify_probe), p1 = run1(cap.verify_probe);
  ok(p0.expected === "0" && p0.observed === "0" && TOKEN.test(p0.observed) && p1.expected === "0" && p1.observed === "0", "both probes read 0 on an empty log", [p0, p1]);
  // rows from before the bound (the three long turns and the twelve capped turns the probes must not count)
  put("2026-10-24T14:14:58.209Z", { ok: 0, streamed: 1, latency_ms: 410096, response: "The agent ran 46 tool call(s) ... no final answer within this turn" });
  put("2026-10-21T14:08:16.172Z", { ok: 0, streamed: 1, latency_ms: 506898, response: "The agent ran 48 tool call(s) ... no final answer within this turn" });
  put("2026-10-25T08:42:58.743Z", { ok: 1, streamed: 0, completion_tokens: 8000, response: "Let me reconstruct where I am." });
  put("2026-10-26T18:30:00.000Z", { ok: 1, streamed: 1, completion_tokens: 8192, response: "Let me analyze" });
  ok(run1(det.verify_probe).observed === "0" && run1(cap.verify_probe).observed === "0", "turns from before the bound are never counted (3 long and 4 capped rows planted)", [run1(det.verify_probe), run1(cap.verify_probe)]);
  // rows that must not count even when recent
  put(iso(1 * H), { ok: 0, streamed: 1, latency_ms: 100000, response: "no final answer within this turn" });
  put(iso(1 * H), { ok: 1, streamed: 1, latency_ms: 400000, response: "no final answer within this turn" });
  put(iso(1 * H), { ok: 0, streamed: 0, latency_ms: 400000, response: "no final answer within this turn" });
  put(iso(1 * H), { ok: 0, streamed: 1, latency_ms: 400000, response: "a different failure" });
  put(iso(1 * H), { ok: 1, streamed: 1, completion_tokens: 8192, response: "The reply was cut at the output cap of 8192 tokens" });
  put(iso(1 * H), { ok: 1, streamed: 1, completion_tokens: 4000, response: "a long but uncapped answer" });
  ok(run1(det.verify_probe).observed === "0" && run1(cap.verify_probe).observed === "0", "short, ok, unstreamed, other-failure, honest-line and uncapped rows are not counted", [run1(det.verify_probe), run1(cap.verify_probe)]);
  // the defect rows, recent
  put(iso(30 * 60e3), { ok: 0, streamed: 1, latency_ms: 300000, response: "The agent ran 12 tool call(s) ... no final answer within this turn" });
  put(iso(30 * 60e3), { ok: 1, streamed: 0, completion_tokens: 8000, response: "Let me reconstruct where I am." });
  put(iso(20 * 60e3), { ok: 1, streamed: 1, completion_tokens: 8192, response: "Let me analyze the results." });
  const d1 = run1(det.verify_probe), d2 = run1(cap.verify_probe);
  ok(d1.observed === "1" && d2.observed === "2" && TOKEN.test(d1.observed) && TOKEN.test(d2.observed), "a recent long incomplete turn and two recent capped replies are counted", [d1, d2]);
  void D;
}

// note, backups, decision row
{
  const d = q1(w, "SELECT description d, updated_at u FROM agent_issues WHERE id = 1000162");
  ok(d.d.startsWith("ORIGINAL-1000162\n\nREM-A6 2026-10-26 (update to the note above, which named an outcome probe") && d.u > 1 && /OPS-STREAM-ABORT-1/.test(d.d) && /fm-ops-stream-incomplete-long/.test(d.d) && /Next, when that detector fails/.test(d.d) && d.d.length < 4000, "issue 1000162 keeps its description and gains one dated update with the next step");
  ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 999001").d === "ORIGINAL-999001", "an unrelated issue keeps its description");
  const bak = qa(w, "SELECT class, status, last_verdict FROM bak_20261026_rem_a6_probes2 ORDER BY class");
  ok(bak.length === 2 && bak.find((r) => r.class === "issue-1000162").status === "probe-review-refused" && bak.find((r) => r.class === "fm-ops-capped-reply-logged-ok").last_verdict === "fail", "the contract backup holds the two previous rows");
  ok(qa(w, "SELECT * FROM bak_20261026_rem_a6_probes2_desc").length === 1 && qa(w, "SELECT * FROM decision_log").length === 1 && /^INFRA-PROBES-2: issue-1000162 re-pointed/.test(q1(w, "SELECT action a FROM decision_log").a), "the description backup and one decision_log row exist");
}
// replay appends nothing
{
  const before = JSON.stringify([q1(w, "SELECT description d FROM agent_issues WHERE id = 1000162").d, qa(w, "SELECT class FROM remediation_contracts ORDER BY class"), qa(w, "SELECT fm_key FROM failure_modes")]);
  w.exec(sql);
  const after = JSON.stringify([q1(w, "SELECT description d FROM agent_issues WHERE id = 1000162").d, qa(w, "SELECT class FROM remediation_contracts ORDER BY class"), qa(w, "SELECT fm_key FROM failure_modes")]);
  ok(before === after && qa(w, "SELECT * FROM decision_log").length === 1 && qa(w, "SELECT * FROM bak_20261026_rem_a6_probes2").length === 2, "a replay appends nothing: no second update, contract, failure mode or decision row, and the backups are kept");
}
// rollback
{
  const rb = (header.find((l) => /^-- Rollback:/.test(l)) || "").replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  ok(rc("issue-1000162").status === "probe-review-refused" && rc("issue-1000162").verify_probe === "SELECT 1" && rc("fm-ops-capped-reply-logged-ok").verify_probe === OLD_CAPPED && rc("fm-ops-capped-reply-logged-ok").last_verdict === "fail", "the Rollback line restores both contract rows from the backup");
  ok(rc("fm-ops-stream-incomplete-long").status === "superseded" && q1(w, "SELECT description d FROM agent_issues WHERE id = 1000162").d === "ORIGINAL-1000162", "supersedes the new detector and restores the description");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
