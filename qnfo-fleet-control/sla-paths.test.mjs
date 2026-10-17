// SLA-PATHS-1 offline suite (qnfo-fleet-control 0.33.4, owner directive 2026-10-17, pillar autonomy).
// The directive: every step and every process carries an SLA and more than one execution / remediation / workaround
// path to a successful definition of done. Evidence persistence had one path - INSERT INTO remediation_verifications -
// and that path is refused at prepare time with 400 7500 "triggers nested too deep" whenever the agent_issues trigger
// chain reaches its depth limit (issue 2817, re-measured 2026-10-17T16:12Z: the same values land in
// remediation_evidence and are refused by remediation_verifications). While that lasted the tick recorded nothing,
// so no verdict was auditable and no issue could close. This suite proves the second path is load-bearing rather than
// a sink with no writer:
//   1. path A refused -> the identical row lands on path B with the primary error logged, and the verdict survives;
//   2. readers count path-B rows (they read v_remediation_evidence_all), so a hold/closure decision is the same;
//   3. a pass recorded on path B can still close its issue in code, with close_evidence naming the evidence row;
//   4. when path A works, nothing is written to path B and no code closure runs (the trigger keeps owning it).
// Run: node --no-warnings qnfo-fleet-control/sla-paths.test.mjs   -> prints "N checks, 0 failure(s)"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var __RT_WRITE_KW"), b = src.indexOf('__name(rtReopenOnRelapse, "rtReopenOnRelapse");');
if (a < 0 || b < a) throw new Error("remediation block not found in worker.js");
let fails = 0, n = 0;
const check = (c, m, x) => { n++; if (!c) { fails++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };

const v = /var VERSION = "0\.(\d+)\.(\d+)-sla-paths";/.exec(src);
check(!!v && +v[1] === 33 && +v[2] >= 5, "VERSION is the SLA-PATHS-1 release (0.33.5-sla-paths or later)", v && v[0]);

// node:sqlite on Node 22.16 refuses positional binding to ?N placeholders ("column index out of range"), so the
// shim rewrites ?N to :pN and binds by name, the same workaround the other remediation shims use.
const toNamed = (sql, args) => {
  const obj = {};
  const s = sql.replace(/\?(\d+)/g, (m, d) => { obj["p" + d] = args[Number(d) - 1]; return ":p" + d; });
  return [s, obj];
};
const wrap = (db) => {
  const stmt = (sql, args) => {
    const [q, named] = toNamed(sql, args);
    return {
      bind: (...x) => stmt(sql, x),
      run: async () => { const r = db.prepare(q).run(named); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
      first: async () => db.prepare(q).get(named) || null,
      all: async () => ({ results: db.prepare(q).all(named) })
    };
  };
  return { prepare: (sql) => stmt(sql, []) };
};

const SCHEMA = `CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0);
  CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
  CREATE TABLE remediation_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT, path TEXT DEFAULT 'B:evidence-table');
  CREATE VIEW v_remediation_evidence_all AS SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'verifications' AS src FROM remediation_verifications UNION ALL SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'evidence' AS src FROM remediation_evidence;
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, close_channel TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE path_liveness (path TEXT PRIMARY KEY, checked_at TEXT, checked_by TEXT, detail TEXT);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);`;

// The production refusal, reproduced: any INSERT into the primary table aborts at prepare time.
const REFUSAL = `CREATE TRIGGER zz_nested_too_deep BEFORE INSERT ON remediation_verifications BEGIN SELECT RAISE(ABORT, 'triggers nested too deep: SQLITE_ERROR'); END;`;

const mk = (refuse) => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  if (refuse) db.exec(REFUSAL);
  return db;
};
const seed = (db, cls, issueId) => {
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, expected_cadence_h, max_attempts, status) VALUES (?,?,?,?,1,3,'active')")
    .run(cls, issueId, "SELECT 'ok' AS expected, 'ok' AS observed", "d1-query");
};
const ctx = vm.createContext({ VERSION: "0.33.5-sla-paths", __name: (f) => f, Date, Math, Number, String, JSON, Object, Array, console, URL, AbortController, setTimeout, clearTimeout, fetch: async () => ({ status: 599, headers: { get: () => null }, text: async () => "" }) });
const W = vm.runInContext(src.slice(a, b) + "\n;({ remediationContractsTick, rtRecordVerification, rtCloseOnVerifiedEvidence, rtPassStreakDays });", ctx, { filename: "fleet-control#SLA-PATHS-1" });

// 1. path A refused: the row still lands, on path B, and the verdict survives
{
  const db = mk(true);
  seed(db, "c-refused", null);
  const errors = []; const realErr = console.error;
  console.error = (m) => errors.push(String(m));
  const out = await W.remediationContractsTick({ AUDIT_DB: wrap(db) });
  console.error = realErr;
  const ev = db.prepare("SELECT class, path, pass, expected, observed FROM remediation_evidence").all();
  check(db.prepare("SELECT COUNT(*) n FROM remediation_verifications").get().n === 0, "path A is refused for every row (the production 7500)");
  check(ev.length === 1 && ev[0].path === "B:tick" && ev[0].pass === 1, "the identical row lands on path B with path=B:tick", ev);
  check(ev[0] && ev[0].expected === "ok" && ev[0].observed === "ok", "the fallback row carries the real expected/observed pair, not a placeholder", ev[0]);
  check(db.prepare("SELECT last_verdict FROM remediation_contracts WHERE class='c-refused'").get().last_verdict === "pass", "the verdict survives the refusal (last_verdict=pass)");
  check(out.pass === 1 && out.fail === 0, "the tick reports the pass it recorded", out);
  check(errors.some((e) => /evidence-fallback/.test(e) && /nested too deep/.test(e)), "the primary error is logged with the fallback row (attributable, not swallowed)", errors);
  check(out.evidence_paths_live === 1, "the path-count check sees one live path, not two on paper", out);
  const sp = db.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'SINGLE-PATH-1:%' AND status = 'open'").get();
  check(sp.n === 1, "a single live path files SINGLE-PATH-1 (an incident, not a review item)", sp);
}

// 2. readers see path B: a pass streak written only on path B still drives the hold decision
{
  const db = mk(true);
  seed(db, "c-streak", null);
  db.prepare("INSERT INTO remediation_evidence (issue_id, class, transport, expected, observed, pass, verified_at, path) VALUES (NULL,'c-streak','d1-query','ok','ok',1,datetime('now','-8 days'),'B:seed')").run();
  const days = await W.rtPassStreakDays(wrap(db), "c-streak");
  check(days >= 7.9 && days <= 8.1, "rtPassStreakDays reads a path-B row as the start of the streak", days);
  const out = await W.remediationContractsTick({ AUDIT_DB: wrap(db) });
  check(db.prepare("SELECT status FROM remediation_contracts WHERE class='c-streak'").get().status === "closed", "an 8-day pass streak closes the contract, whether the rows came from A or B", out);
}

// 3. step 3 (close/reopen decided) also has a second path: a path-B pass closes the issue in code, with evidence
{
  const db = mk(true);
  seed(db, "c-close", 42);
  db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (42,'x','','open')").run();
  db.prepare("INSERT INTO remediation_evidence (issue_id, class, transport, expected, observed, pass, verified_at, path) VALUES (42,'c-close','d1-query','ok','ok',1,datetime('now','-8 days'),'B:seed')").run();
  const out = await W.remediationContractsTick({ AUDIT_DB: wrap(db) });
  const iss = db.prepare("SELECT status, close_channel FROM agent_issues WHERE id=42").get();
  const tri = db.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id=42").get();
  check(iss.status === "closed", "the issue closes on a path-B pass instead of waiting for a trigger that cannot fire", iss);
  check(iss.close_channel === "auto:verified-remediation-path-b", "the closure names the path that carried it", iss);
  check(!!tri && /^v_remediation_evidence_all#evidence:\d+/.test(tri.close_evidence || ""), "close_evidence names the evidence row (issue_close_evidence_required still holds)", tri);
  check(out.closed_by_code === 1, "the tick reports the code closure", out);
}

// 4. path A healthy: no path-B row, and the trigger path keeps ownership (no double closure from code)
{
  const db = mk(false);
  seed(db, "c-healthy", 43);
  db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (43,'y','','open')").run();
  db.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verified_at) VALUES (43,'c-healthy','d1-query','ok','ok',1,datetime('now','-8 days'))").run();
  const out = await W.remediationContractsTick({ AUDIT_DB: wrap(db) });
  check(db.prepare("SELECT COUNT(*) n FROM remediation_evidence").get().n === 0, "nothing is written to path B while path A works");
  check(db.prepare("SELECT COUNT(*) n FROM remediation_verifications WHERE class='c-healthy'").get().n === 2, "the verification row lands on path A", out);
  check(!out.closed_by_code, "the degraded closure does not run when path A carried the row", out);
  check(out.evidence_paths_live === 2, "two live paths when the primary works and the fallback is drilled", out);
  check(out.path_b_drilled === 1, "the fallback is drilled so its availability is proven, not assumed", out);
  check(db.prepare("SELECT COUNT(*) n FROM remediation_evidence").get().n === 0, "the drill row removes itself (no evidence pollution)");
  check(db.prepare("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'SINGLE-PATH-1:%'").get().n === 0, "no single-path incident while both paths are live");
  check(db.prepare("SELECT COUNT(*) n FROM path_liveness").get().n === 2, "both paths hold a heartbeat");
}

// 5. the CI consumer carries the same second path (static: it is the other writer of the same evidence)
{
  const py = readFileSync(new URL("../scripts/remediation_consumer.py", import.meta.url), "utf8");
  check(/def record_verification\(/.test(py), "the consumer has a fallback writer");
  check(/INSERT INTO remediation_evidence/.test(py), "the consumer can write path B");
  check(/v_remediation_evidence_all/.test(py), "the consumer counts path-B rows when it decides reopen/close");
  check(!/INSERT INTO remediation_verifications[\s\S]{0,400}\n\s+\)\s*\n/.test(py.replace(/def record_verification\([\s\S]*?\n\ndef d1_plane/, "")), "no bare insert into the primary table survives outside the fallback helper");
}

// 6. no reader in the worker still counts the primary table alone
{
  const block = src.slice(a, b);
  const bare = block.split("\n").filter((l) => /FROM remediation_verifications WHERE/.test(l));
  check(bare.length === 0, "every hold/close reader reads the union", bare.slice(0, 2));
}

console.log(n + " checks, " + fails + " failure(s)");
if (fails) process.exit(1);
