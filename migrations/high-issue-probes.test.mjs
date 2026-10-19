// HIGH-ISSUE-PROBES-1 offline suite: applies 2026-10-19-high-issue-probes.sql on SQLite and proves, for each of the five re-pointed contracts,
// that the stored probe (1) is a literal read-only SELECT the real runners accept (scripts/remediation_consumer.py is_literal_select,
// parse_code_probe, run_code_probe and the fleet-control write-keyword and external-https rules, read from source), (2) never reads the issue's
// own status, (3) reads a failure while the defect stands and ok once the fleet changes (fixtures), (4) fails closed on stale data.
// Run: node migrations/high-issue-probes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = join(here, "..");
const sql = readFileSync(join(here, "2026-10-19-high-issue-probes.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

// ---- the live shapes the migration touches ----
const SCHEMA = `
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
-- the live trigger that rewrites a ';' in a d1-query probe (remediation_probe_semicolon_upd): a probe that survives it unchanged has none
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class; END;
CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class; END;
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ai_spend_owner_local (day TEXT NOT NULL, gateway TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, PRIMARY KEY (day, gateway, provider, model));
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 hours')), released_at TEXT, outcome TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT, transport TEXT, verified_at TEXT, pass INTEGER);
CREATE TABLE transport_trust (transport TEXT PRIMARY KEY, trusted INTEGER, independent INTEGER, runtime_observable INTEGER);`;
// NB: no agent_issues table exists in the fixture, so a probe that read an issue's status would fail with "no such table".

const db = new DatabaseSync(":memory:");
db.exec(SCHEMA);
const CLASSES = ["issue-2750", "issue-2805", "issue-2830", "issue-2927", "issue-2081"];
const oldVerdict = { "issue-2750": "superseded:probe-unusable (no machine-executable probe)", "issue-2805": "superseded:probe-unusable (no machine-executable probe)", "issue-2830": "superseded:probe-unusable (x)", "issue-2927": "superseded:closure-observing-probe (x)", "issue-2081": "superseded:open-twin" };
const ins = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, attempts, module) VALUES (?, ?, 'old', 'old', ?, 'd1-query', 'qnfo-fleet-control', 'superseded', ?, 7, 'old-module')");
for (const c of CLASSES) ins.run(c, Number(c.slice(6)), "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + c.slice(6) + ") AS observed", oldVerdict[c]);

db.exec(sql);
const row = (c) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);

// ---- 1. what the apply did ----
for (const c of CLASSES) {
  const r = row(c);
  ok(r.status === "active", c + " is active", r.status);
  ok(r.next_due_at && r.next_due_at >= "2026", c + " is due now (next_due_at set)", r.next_due_at);
  ok(r.module === "measuring-probe-high-issues-1" && r.attempts === 0 && r.max_attempts === 24, c + " module, attempts and park threshold set", [r.module, r.attempts, r.max_attempts]);
  ok(r.last_verdict.startsWith("rearmed: HIGH-ISSUE-PROBES-1 (was " + oldVerdict[c].slice(0, 20)), c + " keeps the old verdict in its new one", r.last_verdict);
  ok(r.action.startsWith("MEASURES") && r.precondition.startsWith("HIGH-ISSUE-PROBES-1:"), c + " says what it measures", r.action.slice(0, 40));
  ok(!/agent_issues/.test(r.verify_probe), c + " probe never reads agent_issues", r.verify_probe.slice(0, 80));
  ok(!/needs-machine-probe|metric_registry|v_metric/.test(r.verify_probe), c + " avoids the red-drain park markers", r.verify_probe.slice(0, 80));
}
const second = row("issue-2830-required-check");
ok(second && second.issue_id === 2830 && second.status === "active" && second.verify_transport === "external-https" && second.max_attempts === 24, "issue 2830 has its second contract", second && second.status);
ok(db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 6, "exactly one contract added");
const transports = Object.fromEntries(CLASSES.map((c) => [c, row(c).verify_transport]));
ok(JSON.stringify(transports) === JSON.stringify({ "issue-2750": "d1-query", "issue-2805": "d1-query", "issue-2830": "code-read", "issue-2927": "external-https", "issue-2081": "d1-query" }), "transports as documented", transports);
const bak = db.prepare("SELECT class, status, last_verdict FROM bak_20261019_high_issue_probes ORDER BY class").all();
ok(bak.length === 5 && bak.every((b) => b.status === "superseded"), "backup holds the five rows as they were", bak.length);
const dl = db.prepare("SELECT predicted_outcome, action FROM decision_log").all();
ok(dl.length === 1 && /^issues_without_next_action <= \d+ within \d+ h$/.test(dl[0].predicted_outcome) && dl[0].action.startsWith("HIGH-ISSUE-PROBES-1:"), "one decision_log row with a parsed prediction", dl);

// ---- 2. the runners' own gates, read from source ----
const consumerSrc = readFileSync(join(root, "scripts", "remediation_consumer.py"), "utf8");
const fleetSrc = readFileSync(join(root, "qnfo-fleet-control", "worker.js"), "utf8");
const consumerKw = [...consumerSrc.match(/WRITE_KW = \(([\s\S]*?)\n\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const fleetKw = [...fleetSrc.match(/var __RT_WRITE_KW = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
ok(consumerKw.length >= 10 && fleetKw.length >= 10, "write-keyword lists read from source", [consumerKw.length, fleetKw.length]);
const d1Rows = CLASSES.map(row).filter((r) => r.verify_transport.startsWith("d1-query"));
for (const r of d1Rows) {
  const q = r.verify_probe, low = q.toLowerCase();
  ok(!q.includes(";"), r.class + " has no semicolon (the live trigger would rewrite it)");
  ok(/^(select|with) /.test(low), r.class + " starts with select or with");
  ok(!consumerKw.some((k) => low.includes(k)), r.class + " passes the consumer's write-keyword gate", consumerKw.filter((k) => low.includes(k)));
  ok(!fleetKw.some((k) => low.includes(" " + k)), r.class + " passes fleet-control's write-keyword gate", fleetKw.filter((k) => low.includes(" " + k)));
  ok(!/(?:LIKE|GLOB)\s+'[^']{51,}'/i.test(q), r.class + " has no LIKE pattern over 50 bytes");
}
// the python consumer's own is_literal_select on the stored text
const py = spawnSync("python3", ["-I", "-c", `
import json, sys
sys.path.insert(0, ${JSON.stringify(join(root, "scripts"))})
import remediation_consumer as r
rows = json.loads(sys.stdin.read())
out = {}
for c in rows:
    if c["t"].startswith("d1-query"):
        out[c["class"]] = list(r.is_literal_select(c["p"]))
    elif c["t"] == "code-read":
        spec, why = r.parse_code_probe(c["p"])
        out[c["class"]] = [spec is not None, why]
        import tempfile, os
        base = tempfile.mkdtemp()
        os.makedirs(os.path.join(base, ".github", "workflows"))
        def put(text):
            open(os.path.join(base, ".github", "workflows", "deploy-gate.yml"), "w").write(text)
        put("on:\\n  push:\\n    branches: [main]\\n  pull_request:\\n  merge_group:\\n")
        out[c["class"] + ":with-trigger"] = r.run_code_probe(spec, base)
        put("on:\\n  push:\\n    branches: [main]\\n  pull_request:\\n")
        out[c["class"] + ":without"] = r.run_code_probe(spec, base)
        put("on:\\n  push:\\n  # merge_group: later\\n")
        out[c["class"] + ":comment-only"] = r.run_code_probe(spec, base)
print(json.dumps(out))
`], { input: JSON.stringify(CLASSES.map(row).map((r) => ({ class: r.class, t: r.verify_transport, p: r.verify_probe }))), encoding: "utf8" });
ok(py.status === 0, "python consumer module imports and runs", py.stderr && py.stderr.slice(0, 300));
const pj = py.status === 0 ? JSON.parse(py.stdout) : {};
for (const r of d1Rows) ok(pj[r.class] && pj[r.class][0] === true, r.class + " is a literal select for the consumer", pj[r.class]);
ok(pj["issue-2830"] && pj["issue-2830"][0] === true, "issue-2830 code-read spec parses", pj["issue-2830"]);
ok(pj["issue-2830:with-trigger"] === "ok", "code-read reads ok once deploy-gate has the merge_group trigger", pj["issue-2830:with-trigger"]);
ok(pj["issue-2830:without"] === ".github/workflows/deploy-gate.yml".replace(/^/, "missing-marker:"), "code-read reads missing-marker while it has none", pj["issue-2830:without"]);
ok(pj["issue-2830:comment-only"] === "missing-marker:.github/workflows/deploy-gate.yml", "a comment that mentions merge_group is not the trigger", pj["issue-2830:comment-only"]);
ok(existsSync(join(root, ".github", "workflows", "deploy-gate.yml")), "the code-read path exists on main");

// external-https: fleet-control's own spec and observe functions, extracted from source
const a = fleetSrc.indexOf("var RT_TRANSPORTS"), b = fleetSrc.indexOf("async function rtHttpProbe");
const rt = new Function(fleetSrc.slice(a, b) + "; return { rtHttpSpec, rtHttpObserve, rtHttpFleetHost };")();
const rules = (types) => JSON.stringify(types.map((t) => ({ type: t, ruleset_source_type: "Repository", ruleset_source: "QNFO/qnfo-workers", ruleset_id: 1 })), null, 2);
for (const c of ["issue-2927", "issue-2830-required-check"]) {
  const r = row(c), sp = rt.rtHttpSpec(r.verify_probe);
  ok(sp.ok && sp.method === "GET" && sp.check === "body-contains:required_status_checks" && sp.expected === "present", c + " is a valid external-https spec", sp);
  ok(!rt.rtHttpFleetHost(r.verify_probe), c + " is not a fleet host (no same-account artifact)");
  const get = () => null;
  ok(rt.rtHttpObserve(sp, 200, get, rules(["deletion", "non_fast_forward"])) !== sp.expected, c + " reads a failure on the live ruleset (deletion and non_fast_forward only)");
  ok(rt.rtHttpObserve(sp, 200, get, rules(["deletion", "non_fast_forward", "required_status_checks"])) === sp.expected, c + " passes once the ruleset requires status checks");
  ok(rt.rtHttpObserve(sp, 403, get, JSON.stringify({ message: "API rate limit exceeded" })) !== sp.expected, c + " fails closed on a rate-limited answer");
}

// ---- 3. behaviour of the d1 probes ----
const run = (d, cls, text) => { const r = d.prepare(text).get(); return [r.expected, r.observed]; };
const probe = (cls) => row(cls).verify_probe;
const passes = ([e, o]) => e === o;
const reset = () => { for (const t of ["cloud_ops_events", "ai_spend_owner_local", "work_claims", "remediation_verifications", "transport_trust"]) db.exec("DELETE FROM " + t); };
const isoAgo = (mod) => db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?) AS t").get(mod).t;
const dayAgo = (n) => db.prepare("SELECT date('now', ?) AS d").get("-" + n + " days").d;

// 2750
reset();
const ingest = (ago) => db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES (?, ?, 'owner-local-ingest', 'ok')").run("o" + Math.random(), isoAgo(ago));
const spend = (days, provider, usd) => db.prepare("INSERT INTO ai_spend_owner_local (day, gateway, provider, model, calls, usd) VALUES (?, 'default', ?, ?, 10, ?)").run(dayAgo(days), provider, "m" + Math.random(), usd);
ingest("-10 minutes");
spend(1, "anthropic", 97.03); spend(2, "anthropic", 55.02);
let r1 = run(db, "", probe("issue-2750"));
ok(!passes(r1) && r1[1].startsWith("burn: anthropic owner-local spend") && r1[1].includes("97.03"), "2750 reads the burn while a day is over the cap", r1);
db.exec("DELETE FROM ai_spend_owner_local"); spend(3, "anthropic", 97.03); spend(0, "anthropic", 4.5); spend(1, "anthropic", 5.0); spend(1, "deepseek", 400);
r1 = run(db, "", probe("issue-2750"));
ok(passes(r1), "2750 passes when the last 3 UTC days are at or under the cap (older burn and other providers do not count)", r1);
db.exec("DELETE FROM ai_spend_owner_local"); spend(1, "Anthropic", 6); spend(1, "anthropic", 6);
ok(!passes(run(db, "", probe("issue-2750"))), "2750 sums a day across models and reads provider case-insensitively (12 over 10)");
db.exec("DELETE FROM ai_spend_owner_local"); db.exec("DELETE FROM cloud_ops_events"); ingest("-5 hours");
r1 = run(db, "", probe("issue-2750"));
ok(!passes(r1) && r1[1].startsWith("ingest-stale"), "2750 fails closed when the ingest is stale, even with no spend rows", r1);

// 2805
reset();
const claim = (path, ago) => db.prepare("INSERT INTO work_claims (path, intent, holder, claimed_at) VALUES (?, 'x', 'h', ?)").run(path, isoAgo(ago).replace(/\.\d+Z$/, "Z"));
let r2 = run(db, "", probe("issue-2805"));
ok(!passes(r2) && r2[1].startsWith("no-claim"), "2805 reads no-claim with no claim", r2);
claim("qnfo-ai/system-prompt-qnfo.md", "-1 hours"); claim("prompt-stores/sync_system_prompt.py", "-20 days"); claim(".deepchat/system-prompt-v2.7.md", "-1 hours"); claim("prompt-stores/other.py", "-1 hours");
ok(!passes(run(db, "", probe("issue-2805"))), "2805 ignores a claim on an unrelated prompt file, on the canonical prompt file, on another prompt-stores file and an old claim on the sync");
claim("prompt-stores/sync_system_prompt.py", "-2 days");
ok(passes(run(db, "", probe("issue-2805"))), "2805 passes once the sync has taken a claim in the window");
db.exec("UPDATE work_claims SET released_at = '2026-10-19T00:00:00Z', outcome = 'merged'");
ok(passes(run(db, "", probe("issue-2805"))), "2805 counts a claim that was released (the lock was taken and let go)");

// 2081
reset();
db.exec("INSERT INTO transport_trust VALUES ('d1-query', 1, 1, 0), ('runner-https', 1, 1, 1), ('external-https', 1, 1, 1), ('worker-same-zone', 0, 0, 1)");
const ver = (n, transport, ts) => { const s = db.prepare("INSERT INTO remediation_verifications (class, transport, verified_at, pass) VALUES ('c', ?, ?, 1)"); for (let i = 0; i < n; i++) s.run(transport, ts); };
const stamp = db.prepare("SELECT datetime('now', '-30 minutes') AS t").get().t;
const stampIso = stamp.replace(" ", "T") + ".000Z";
ver(92, "d1-query", stamp); ver(8, "runner-https", stampIso);
let r4 = run(db, "", probe("issue-2081"));
ok(!passes(r4) && r4[1].startsWith("monoculture: 8.0 percent"), "2081 reads the monoculture share (8 of 100, ISO and plain timestamps both counted)", r4);
ver(5, "worker-same-zone", stamp);
r4 = run(db, "", probe("issue-2081"));
ok(!passes(r4) && r4[1].startsWith("monoculture: 7.6 percent"), "2081 does not count an untrusted same-zone transport as runtime evidence", r4);
ver(10, "external-https", stamp);
r4 = run(db, "", probe("issue-2081"));
ok(passes(r4), "2081 passes at 18 of 115 (15.7 percent)", r4);
db.exec("DELETE FROM remediation_verifications WHERE transport IN ('runner-https', 'external-https')"); ver(4, "runner-https", dayAgo(3) + " 10:00:00");
r4 = run(db, "", probe("issue-2081"));
ok(!passes(r4), "2081 ignores runtime verifications older than 24 h", r4);
reset(); db.exec("INSERT INTO transport_trust VALUES ('runner-https', 1, 1, 1)"); ver(20, "runner-https", stamp);
r4 = run(db, "", probe("issue-2081"));
ok(!passes(r4) && r4[1].startsWith("too-few"), "2081 fails closed under 50 verifications", r4);

// the Rollback header restores the old rows and removes the added contract
const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback:")).slice(12);
db.exec(rb);
for (const c of CLASSES) {
  const r = row(c);
  ok(r.status === "superseded" && r.last_verdict === oldVerdict[c] && r.module === "old-module" && r.attempts === 7 && r.max_attempts === 3 && /closed/.test(r.verify_probe), c + " is restored by the Rollback header", [r.status, r.last_verdict, r.max_attempts]);
}
ok(!row("issue-2830-required-check"), "the Rollback header removes the added contract");

console.log(`high-issue-probes: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
