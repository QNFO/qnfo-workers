// INFRA-CANONICAL-1 offline suite: replays migrations/2026-10-26-infra-canonical.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, a BACKUP table that the file creates first, nothing deleted or dropped, decision_log only inserted into); issue 1000161 ends with two
// active contracts, a d1-query one on canonical_refresh rows and a code-read one on the bucket declaration in qnfo-ops/wrangler.toml, each accepted by the consumer's own gate (is_literal_select, parse_code_probe) and
// returning only short tokens; the code-read probe PASSES against this tree; the d1 probe reads no-refresh-yet, ok and refresh-failed on a crafted events table (rows older than the window, rows of other kinds,
// skipped rows and old errors are not counted; a recent ok row without a recent error is); the probe's kind and statuses are the ones qnfo-ops/worker.js writes; one dated update is appended to the issue once with
// the previous description in the backup table; one decision_log row; a replay adds nothing; the Rollback line restores the description and supersedes both contracts.
// Output MUST contain "0 failed" on success.   node migrations/infra-canonical.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-infra-canonical.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(header.some((l) => /^-- BACKUP: bak_20261026_rem_a6_canonical_desc\s*$/.test(l)) && /CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_canonical_desc AS/.test(body), "the BACKUP table is named and created first");
ok(body.indexOf("CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_canonical_desc") < body.indexOf("UPDATE agent_issues"), "the backup is created before the update of the issue");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");
ok(![...body.matchAll(/LIKE\s+'((?:[^']|'')*)'/gi)].some((m) => Buffer.byteLength(m[1]) > 50), "no LIKE pattern above 50 bytes (D1 limit)");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL DEFAULT '', verify_transport TEXT NOT NULL DEFAULT 'd1-query', max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT 'x', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  for (const id of [1000161, 999001]) w.prepare("INSERT INTO agent_issues (id, title, description, updated_at) VALUES (?, ?, ?, 1)").run(id, "t" + id, "ORIGINAL-" + id);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict, module, attempts) VALUES ('issue-1000161', 1000161, ?, 'd1-query', 'superseded', 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic', 0)")
    .run("SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 1000161) AS observed");
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, module) VALUES ('issue-9999999', 9999999, 'x', 'd1-query', 'superseded', 'other')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const w = world();
w.exec(sql);
const rc = (cls) => q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", cls);

// contracts
const main = rc("issue-1000161"), bind = rc("issue-1000161-binding");
ok(main && main.status === "active" && main.verify_transport === "d1-query" && main.last_verdict === null && main.attempts === 0 && main.module === "infra-canonical-1" && main.issue_id === 1000161, "issue-1000161 is active on d1-query with a clean slate and the module infra-canonical-1", main && { s: main.status, t: main.verify_transport, v: main.last_verdict, m: main.module });
ok(bind && bind.status === "active" && bind.verify_transport === "code-read" && bind.issue_id === 1000161 && bind.last_verdict === null && bind.attempts === 0 && bind.module === "infra-canonical-1", "issue-1000161-binding is a second active code-read contract of the same issue", bind && { s: bind.status, t: bind.verify_transport, i: bind.issue_id });
ok(rc("issue-9999999").status === "superseded", "a contract that is not named is not touched");
ok(!/closed/.test(main.verify_probe), "the placeholder that observed the issue's own status is gone");

// code-read probe: parsed by the consumer's parser and PASSING against this tree
const spec = JSON.parse(bind.verify_probe);
ok(Array.isArray(spec.paths) && spec.paths.length === 1 && spec.paths[0] === "qnfo-ops/wrangler.toml" && spec.contains === 'bucket_name = "qnfo-canonical"' && !("absent" in spec), "the code-read spec names qnfo-ops/wrangler.toml and the bucket line", spec);
ok(existsSync(join(root, spec.paths[0])) && readFileSync(join(root, spec.paths[0]), "utf8").includes(spec.contains), "the bucket declaration is in qnfo-ops/wrangler.toml of this tree (the probe passes)");
{
  const toml = readFileSync(join(root, "qnfo-ops/wrangler.toml"), "utf8");
  ok((toml.match(/bucket_name = "qnfo-canonical"/g) || []).length === 1 && /\[\[r2_buckets\]\]\s*\nbinding = "CANONICAL"\s*\nbucket_name = "qnfo-canonical"/.test(toml), "and it is one r2_buckets block with the binding CANONICAL");
}

// the consumer's own gates
{
  const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
  if (!PY) console.log("note: no python 3 on this host, the consumer gate checks are skipped");
  else {
    const prog = "import sys, json, os\nos.environ.setdefault('CLOUDFLARE_ACCOUNT_ID','a'); os.environ.setdefault('CLOUDFLARE_API_TOKEN','t'); os.environ.setdefault('CF_API_TOKEN','t')\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\nd = json.loads(sys.stdin.read())\np, why = r.parse_code_probe(d['code'])\nprint(json.dumps([p is not None, why, list(r.is_literal_select(d['sql']))]))";
    const run = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: JSON.stringify({ code: bind.verify_probe, sql: main.verify_probe }), encoding: "utf8" });
    let parsed = null;
    try { parsed = JSON.parse(String(run.stdout).trim().split("\n").pop()); } catch (e) { parsed = null; }
    ok(run.status === 0 && parsed && parsed[0] === true, "the consumer's own parse_code_probe accepts the code-read spec", { status: run.status, parsed, err: String(run.stderr).slice(0, 200) });
    ok(run.status === 0 && parsed && parsed[2][0] === true && parsed[2][1] === "ok", "and is_literal_select accepts the d1 probe (a single literal read-only SELECT, no write keyword even inside a literal)", parsed && parsed[2]);
  }
}

// the d1 probe on a crafted events table (ts in the format the worker writes: toISOString)
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const H = 3600e3, D = 24 * H;
let ev = 0;
const put = (kind, status, msAgo) => w.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, 't', '{}', 'qnfo-ops', ?)").run("e" + (++ev), iso(msAgo), kind, status);
const probe = () => q1(w, main.verify_probe);
const TOKEN = /^[A-Za-z0-9_.:+-]{1,64}$/;
{
  const p0 = probe();
  ok(p0.expected === "ok" && p0.observed === "no-refresh-yet" && TOKEN.test(p0.expected) && TOKEN.test(p0.observed), "no canonical_refresh row at all reads no-refresh-yet (fails, as it must before the first refresh)", p0);
  put("canonical_refresh", "skipped", 1 * H);
  put("ops_stream_abort", "ok", 1 * H);
  put("compat-verify", "ok", 1 * H);
  ok(probe().observed === "no-refresh-yet", "skipped rows and ok rows of other kinds are not a refresh", probe());
  put("canonical_refresh", "ok", 8 * D);
  ok(probe().observed === "no-refresh-yet", "an ok refresh older than 7 days is outside the window", probe());
  put("canonical_refresh", "ok", 3 * H);
  const p1 = probe();
  ok(p1.observed === "ok" && p1.observed === p1.expected, "a recent ok refresh and no recent error pass", p1);
  put("canonical_refresh", "error", 2 * D);
  ok(probe().observed === "ok", "an error older than a day does not fail it", probe());
  put("canonical_refresh", "error", 2 * H);
  const p2 = probe();
  ok(p2.observed === "refresh-failed" && TOKEN.test(p2.observed), "an error row in the last day reads refresh-failed", p2);
  put("compat-verify", "error", 1 * H);
  ok(probe().observed === "refresh-failed", "(other kinds with status error change nothing)", probe());
}
{
  const s = readFileSync(join(root, "qnfo-ops/worker.js"), "utf8");
  ok(/VALUES \(\?1, \?2, 'canonical_refresh', \?3, \?4, 'qnfo-ops', \?5\)/.test(s), "qnfo-ops/worker.js writes kind canonical_refresh into cloud_ops_events");
  ok(/const status = r\.ok \? "ok" : r\.skipped \? "skipped" : "error";/.test(s), "and the statuses are ok, skipped and error, the three the probe reads");
}

// the note on the issue, the backup, the decision row
{
  const d = q1(w, "SELECT description d, updated_at u FROM agent_issues WHERE id = 1000161");
  ok(d.d.startsWith("ORIGINAL-1000161\n\nREM-A6 2026-10-26 (update to the note above") && d.u > 1 && /qnfo-ops 2\.59\.4/.test(d.d) && /Next, if the d1 contract reads no-refresh-yet/.test(d.d), "the issue keeps its description and gains one dated update with the next step", d.d.slice(-160));
  ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 999001").d === "ORIGINAL-999001", "an unrelated issue keeps its description");
  const bak = qa(w, "SELECT id, description FROM bak_20261026_rem_a6_canonical_desc");
  ok(bak.length === 1 && bak[0].id === 1000161 && bak[0].description === "ORIGINAL-1000161", "the backup holds the previous description");
  ok(d.d.length < 4000 + "ORIGINAL-1000161".length, "the update is under 4000 characters", d.d.length);
  ok(qa(w, "SELECT * FROM decision_log").length === 1 && /^INFRA-CANONICAL-1: qnfo-ops 2\.59\.4 binds/.test(q1(w, "SELECT action a FROM decision_log").a), "one decision_log row");
}

// replay appends nothing
{
  const before = JSON.stringify([q1(w, "SELECT description d FROM agent_issues WHERE id = 1000161").d, rc("issue-1000161").verify_probe, qa(w, "SELECT class FROM remediation_contracts ORDER BY class")]);
  w.exec(sql);
  const after = JSON.stringify([q1(w, "SELECT description d FROM agent_issues WHERE id = 1000161").d, rc("issue-1000161").verify_probe, qa(w, "SELECT class FROM remediation_contracts ORDER BY class")]);
  ok(before === after && qa(w, "SELECT * FROM decision_log").length === 1 && qa(w, "SELECT * FROM bak_20261026_rem_a6_canonical_desc").length === 1, "a replay appends no second update, adds no contract or decision row and keeps the backup");
}

// rollback
{
  const rb = (header.find((l) => /^-- Rollback:/.test(l)) || "").replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 1000161").d === "ORIGINAL-1000161", "the Rollback line restores the description from the backup");
  ok(rc("issue-1000161").status === "superseded" && rc("issue-1000161-binding").status === "superseded" && rc("issue-9999999").status === "superseded", "and supersedes both contracts (the unrelated one was already superseded)");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
