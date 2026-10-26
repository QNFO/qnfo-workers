// PROBE-AUTHOR-SINK-GUARD-1 offline suite, worker half (qnfo-fleet-control 0.56.0, agent_issues 1000421, pillar security, doctrine section 9).
// 0.54.0 (PROBE-AUTHOR-HARDEN-1) bounds the value of a probe the live-path author writes at birth: the dry run's expected and observed must each be a number or one short token. That is the only gated
// pass. Every later pass re-runs the stored SQL and the remediation tick wrote the first row's expected and observed untruncated into remediation_verifications (and the consumer, through its run log,
// into main of the public repository). A branch not taken at birth, or a free-text column passed through hex() or substr(), reached those sinks.
// Slices the real remediation tick out of worker.js and runs it against node:sqlite. Proves: for a contract whose module is probe-author-1 a pass whose expected or observed is not one short token
// (letters, digits and _ . : + -, 1 to 64 characters) is a probe-error with the reason free-text-value and writes NO verification row, NO evidence row and no audit text containing the value; a
// short token and a number are recorded exactly as before; every other module (and a missing module) keeps recording free text, as the 1919 non-token rows of other probes in 24 hours do by design;
// the guard also covers the observed side, an empty value keeps its old vacuous path, and the contract is stamped probe-error so the autoclose triggers do not read it as a pass.
// Run: node --no-warnings qnfo-fleet-control/probe-author-sink.test.mjs   -> prints "N checks, 0 failure(s)"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("var __RT_WRITE_KW"), b = src.indexOf('__name(rtReopenOnRelapse, "rtReopenOnRelapse");');
if (a < 0 || b < a) throw new Error("remediation block not found in worker.js");
let fails = 0, n = 0;
const check = (c, m, x) => { n++; if (!c) { fails++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };

const vmV = /var VERSION = "(\d+)\.(\d+)\./.exec(src);
check(vmV && (+vmV[1] > 0 || +vmV[2] >= 56), "VERSION is at least 0.56", vmV && vmV[0]);
check(/var RT_SINK_TOKEN_RE = \/\^\[A-Za-z0-9_\.:\+-\]\{1,64\}\$\/;/.test(src), "the token pattern is one to 64 of letters, digits and _ . : + -");
check(/SELECT class FROM remediation_contracts WHERE module = 'probe-author-1'/.test(src) && !/c\.max_attempts, c\.module/.test(src), "the tick reads the authored classes once as a set and does not depend on a module column in its main select");
check(/rtSinkGuard\(\{ module: authoredSet\[c\.class\] \? "probe-author-1" : "" \}, es, os\);/.test(src), "the tick applies the guard to the pair it read");
check(src.includes("free-text-value"), "the closing probe's marker is in worker.js");

const toNamed = (sql, args) => {
  const obj = {};
  let hit = false;
  const s = sql.replace(/\?(\d+)/g, (m, d) => { hit = true; obj["p" + d] = args[Number(d) - 1]; return ":p" + d; });
  return hit ? [s, obj] : [sql, args];
};
const wrap = (db) => {
  const stmt = (sql, args) => {
    const [q, named] = toNamed(sql, args);
    return {
      bind: (...x) => stmt(sql, x),
      run: async () => { const r = db.prepare(q).run(...(Array.isArray(named) ? named : [named])); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
      first: async () => db.prepare(q).get(...(Array.isArray(named) ? named : [named])) || null,
      all: async () => ({ results: db.prepare(q).all(...(Array.isArray(named) ? named : [named])) })
    };
  };
  return { prepare: (sql) => stmt(sql, []) };
};
const mk = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0, module TEXT);
    CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
    CREATE TABLE remediation_evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT, path TEXT DEFAULT 'B:evidence-table');
    CREATE VIEW v_remediation_evidence_all AS SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'verifications' AS src FROM remediation_verifications UNION ALL SELECT id, issue_id, class, probe_url, transport, expected, observed, pass, verified_at, verifier, 'evidence' AS src FROM remediation_evidence;
    CREATE TABLE path_liveness (path TEXT PRIMARY KEY, checked_at TEXT, checked_by TEXT, detail TEXT);
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, close_channel TEXT, updated_at INTEGER);
    CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  return db;
};
const errs = [];
const ctx = vm.createContext({ VERSION: "test", __name: (f) => f, Date, Math, Number, String, JSON, Object, Array, RegExp, URL, AbortController, setTimeout, clearTimeout, console: { error: (x) => errs.push(String(x)), log() {} }, fetch: async () => ({ status: 599, headers: { get: () => null }, text: async () => "" }) });
const W = vm.runInContext(src.slice(a, b) + "\n;({ remediationContractsTick, rtSinkGuard, RT_SINK_TOKEN_RE });", ctx, { filename: "fleet-control#PROBE-AUTHOR-SINK-GUARD-1" });

const SECRET = "Rowan private note: the sentence that must never reach a verification row";
const q = (s) => s.replace(/'/g, "''");
async function runOne(module, expected, observed) {
  const db = mk();
  db.exec("INSERT INTO agent_issues (id, title, status) VALUES (1, 'x', 'open')");
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, expected_cadence_h, module) VALUES ('issue-1', 1, ?, 'd1-query', 1, ?)")
    .run("SELECT '" + q(expected) + "' AS expected, '" + q(observed) + "' AS observed", module);
  errs.length = 0;
  const out = await W.remediationContractsTick({ AUDIT: wrap(db) });
  return {
    out, db, errs: errs.slice(),
    rows: db.prepare("SELECT expected, observed, pass FROM remediation_verifications").all(),
    ev: db.prepare("SELECT expected, observed FROM remediation_evidence").all(),
    events: db.prepare("SELECT text FROM cloud_ops_events").all(),
    contract: db.prepare("SELECT last_verdict, status FROM remediation_contracts WHERE class = 'issue-1'").get()
  };
}

// pure guard
check(W.rtSinkGuard({ module: "other" }, SECRET, SECRET) === undefined, "another module: the guard returns quietly");
let thrown = null;
try { W.rtSinkGuard({ module: "probe-author-1" }, "ok", SECRET); } catch (e) { thrown = e; }
check(thrown && thrown.message === "free-text-value", "the pure guard throws free-text-value and nothing else", thrown && thrown.message);
check(thrown && !String(thrown.message).includes(SECRET), "the thrown message does not carry the value");
for (const good of ["ok", "0", "17", "closed", "a.b:c+d_e-f", "x".repeat(64)]) { let t = null; try { W.rtSinkGuard({ module: "probe-author-1" }, good, good); } catch (e) { t = e; } check(t === null, "the guard passes the token " + JSON.stringify(good.slice(0, 12))); }
for (const bad of ["x".repeat(65), "two words", "a,b", "a/b", "(null)", "tab\there", "line\nbreak", "ünï"]) { let t = null; try { W.rtSinkGuard({ module: "probe-author-1" }, "ok", bad); } catch (e) { t = e; } check(t && t.message === "free-text-value", "the guard refuses " + JSON.stringify(bad.slice(0, 12))); }
let t0 = null; try { W.rtSinkGuard({ module: "probe-author-1" }, "", ""); } catch (e) { t0 = e; } check(t0 === null, "empty values are left to the old vacuous path");

// the tick: free text in observed
let r = await runOne("probe-author-1", "ok", SECRET);
check(r.rows.length === 0 && r.ev.length === 0, "free text in observed writes no verification row and no evidence row", { rows: r.rows, ev: r.ev });
check(r.contract.last_verdict === "probe-error", "the contract is stamped probe-error", r.contract);
check(r.out.skipped === 1 && r.out.pass === 0 && r.out.fail === 0, "it counts as skipped", r.out);
check(r.events.length === 1 && /error=free-text-value/.test(r.events[0].text) && !r.events[0].text.includes(SECRET), "one remediation.probe-error audit row names the reason and not the value", r.events);
check(!r.errs.join(" ").includes(SECRET) && r.errs.some((e) => /free-text-value/.test(e)), "the console line names the reason and not the value", r.errs);
// ... in expected
r = await runOne("probe-author-1", SECRET, "ok");
check(r.rows.length === 0 && r.contract.last_verdict === "probe-error", "free text in expected is refused the same way", { rows: r.rows, c: r.contract });
// ... a long token
r = await runOne("probe-author-1", "ok", "y".repeat(65));
check(r.rows.length === 0 && r.contract.last_verdict === "probe-error", "a 65 character token is refused", r.contract);

// tokens are recorded as before
r = await runOne("probe-author-1", "ok", "ok");
check(r.rows.length === 1 && r.rows[0].pass === 1 && r.contract.last_verdict === "pass", "a matching token pass is recorded", { rows: r.rows, c: r.contract });
r = await runOne("probe-author-1", "0", "3");
check(r.rows.length === 1 && r.rows[0].pass === 0 && r.rows[0].observed === "3" && r.contract.last_verdict === "fail", "a failing number is recorded", { rows: r.rows, c: r.contract });

// another module and no module keep recording free text
for (const m of [null, "", "probe-template-v3-generic", "failure-mode", "Probe-Author-1", "probe-author-2"]) {
  r = await runOne(m, "ok", "stale: the filing loop did not close it within 48h");
  check(r.rows.length === 1 && r.rows[0].observed.startsWith("stale:") && r.contract.last_verdict === "fail", "module " + JSON.stringify(m) + " keeps its old behaviour", { rows: r.rows, c: r.contract });
}

// an empty observation keeps its path
r = await runOne("probe-author-1", "ok", "");
check(r.rows.length === 1 && r.rows[0].observed === "(null)" && r.contract.last_verdict === "fail", "an empty observation is still recorded as (null), not as free text", { rows: r.rows, c: r.contract });
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
check(mirror === src, "deployed-current.worker.js is identical to worker.js");

console.log(n + " checks, " + fails + " failure(s)");
if (fails) process.exit(1);
