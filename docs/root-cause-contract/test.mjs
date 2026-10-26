// ROOT-CAUSE-CONTRACT-1 offline suite (node --no-warnings test.mjs). Fixture = live DDL (schema.sql) on node:sqlite.
// Proves the arming statement, its probe, the gates the probers apply, the no-deadlock lifecycle, the workflow step, the migration file, the Rollback line and a mutant list.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import * as B from "./build.mjs";

const here = new URL(".", import.meta.url).pathname;
const schema = readFileSync(here + "schema.sql", "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const sec = (t) => console.log("\n== " + t);
const mkdb = () => { const d = new DatabaseSync(":memory:"); d.exec(schema); return d; };
const H = 3600 * 1000;
const q = (db, s, ...a) => db.prepare(s).all(...a).map((r) => ({ ...r }));
const one = (db, s, ...a) => { const r = db.prepare(s).get(...a); return r ? { ...r } : undefined; };

// ---------- ports of the gates (qnfo-fleet-control/worker.js:11513,11639-11640 and scripts/remediation_consumer.py:88-92,257-273)
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
const tickGate = (probe) => { const qq = String(probe || "").trim(); const ql = " " + qq.toLowerCase().replace(/\s+/g, " ") + " "; return /^(select|with) /.test(qq.toLowerCase()) && qq.indexOf(";") === -1 && !RT_WRITE_KW.some((k) => ql.indexOf(" " + k) !== -1); };
const CONSUMER_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const consumerGate = (sql) => { const s = String(sql || "").trim(); if (!s) return false; const low = s.toLowerCase(); if (!(low.startsWith("select") || low.startsWith("with"))) return false; for (const kw of CONSUMER_KW) if (low.includes(kw)) return false; let body = s.trimEnd(); if (body.endsWith(";")) body = body.slice(0, -1); return body.indexOf(";") === -1; };
const circular = (probe, id) => probe.includes("needs-machine-probe") || probe.includes("SELECT status FROM agent_issues WHERE id =") || probe.includes("agent_issues WHERE id = " + id + ")");
const WORDS = /\b(insert|update|delete|drop|alter|create|replace)\b/i;

// ---------- independent oracle: the exact probe text the statement must write, and the observed value it must read
const famOf = (title) => title.slice(14, title.indexOf(" keeps recurring"));
const expectedProbe = (title, id) => `SELECT '0' AS expected, CAST((SELECT COALESCE(SUM(r.reopens_24h + r.opens_24h), 0) FROM issue_recurrence_now r WHERE r.family = '${famOf(title).replaceAll("'", "''")}') + (SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END FROM issue_recurrence_now) + COALESCE((SELECT CASE WHEN x.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000 THEN 0 ELSE 1 END FROM agent_issues x WHERE x.id = ${id}), 0) AS TEXT) AS observed`;

// ---------- fixture
const T = (fam) => "ROOT-CAUSE-1: " + fam + " keeps recurring";
// id, family, age in hours, recurrence [reopens_24h, opens_24h] or null (family absent), oracle N with a filled table
const ARMED = [
  [1000301, "CF-OBS-ISSUE-1", 6.6, [9, 22], 32, "young + busy family"],
  [1000302, "FLEET-JOURNEY-FAILED-1", 30, [6, 4], 10, "old + busy family"],
  [1000303, "LOOP-BREAKER-1", 30, null, 0, "old + family absent (quiet)"],
  [1000304, "METRIC-REGRESSION-1", 30, [0, 0], 0, "old + family row with 0/0 (quiet)"],
  [1000305, "PORTFOLIO-GAP", 1, null, 1, "young + family absent"],
  [1000306, "O'BRIEN-1", 30, [2, 0], 2, "family with a single quote"],
  [1000307, "METRIC-TRIGGER-5182", 25, [20, 0], 20, "METRIC-TRIGGER family name, 25 h old"],
  [1000308, "A'B''C", 30, [0, 3], 3, "family with quotes in a row"],
  [1000310, "a%b_c", 30, [1, 0], 1, "family with LIKE wildcards"],
  [1000316, "TWO-CONTRACTS-1", 30, [0, 0], 0, "ticket with a second (BACKFILL) contract"],
  [1000317, "NULL-ISSUE-ID-1", 30, [4, 0], 4, "contract whose issue_id is NULL (the step repairs it)"],
];
function seed(db, opt = {}) {
  const ins = db.prepare("INSERT INTO agent_issues (id, title, description, source, status, priority, created_at, updated_at) VALUES (?, ?, 'x', 'management-personas', ?, 'critical', ?, ?)");
  const now = Date.now();
  const add = (id, title, ageH, status = "open") => ins.run(id, title, status, Math.round(now - ageH * H), Math.round(now - ageH * H));
  for (const [id, fam, ageH, rec] of ARMED) {
    add(id, T(fam), ageH);
    if (rec) db.prepare("INSERT INTO issue_recurrence_now (family, reopens_7d, issues_7d, reopens_24h, opens_24h) VALUES (?, 9, 9, ?, ?)").run(fam, rec[0], rec[1]);
  }
  // controls: a ';' in the title, a closed ticket, a non-ROOT-CAUSE title, a hand-written active probe, a contract that is not VACUOUS, a title that does not end in 'keeps recurring'
  add(1000309, T("FOO;BAR"), 30);
  add(1000311, T("CLOSED-1"), 30, "closed");
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module, last_verdict, attempts) VALUES ('issue-1000311', 1000311, 'p', 'VACUOUS-PROBE-V3-1: closed ticket', 'SELECT 1 AS expected, 1 AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'superseded', 'probe-template-v3-generic', 'superseded:x', 0)").run();
  add(1000312, "METRIC-TRIGGER-9 something else", 30);
  add(1000313, T("HAND-1"), 30);
  db.prepare("UPDATE remediation_contracts SET status = 'active', action = 'hand written', verify_probe = 'SELECT ''1'' AS expected, ''1'' AS observed', module = 'by-hand', last_verdict = 'pass', attempts = 3 WHERE class = 'issue-1000313'").run();
  add(1000314, T("TWIN-1"), 30);
  db.prepare("UPDATE remediation_contracts SET action = 'MEASURES something else', last_verdict = 'superseded:twin-of-5' WHERE class = 'issue-1000314'").run();
  add(1000315, T("DUP-1") + " (dup)", 30);
  add(1000318, T("ACTIVE-VACUOUS-1"), 30);
  db.prepare("UPDATE remediation_contracts SET status = 'active', last_verdict = 'pass' WHERE class = 'issue-1000318'").run(); // armed by hand, action text still VACUOUS-PROBE-V3-1
  // second contract of 1000316 and a NULL issue_id on 1000317
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module, last_verdict, attempts) VALUES ('issue-1000316-BACKFILL-1', 1000316, 'p', 'VACUOUS-PROBE-V3-1: second contract', 'SELECT 1 AS expected, 1 AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'superseded', 'probe-template-v3-generic', 'superseded:x', 0)").run();
  db.prepare("UPDATE remediation_contracts SET issue_id = NULL WHERE class = 'issue-1000317'").run();
  // a stale attempts counter and a stale deferred_since on one armed ticket, to prove the reset
  db.prepare("UPDATE remediation_contracts SET attempts = 7, deferred_since = '2026-10-19 00:00:00', next_due_at = '2026-10-18 00:00:00' WHERE class = 'issue-1000302'").run();
  return db;
}
const snapshot = (db, cls) => one(db, "SELECT * FROM remediation_contracts WHERE class = ?", cls);
const UNTOUCHED = ["issue-1000318", "issue-1000309", "issue-1000311", "issue-1000312", "issue-1000313", "issue-1000314", "issue-1000315", "issue-1000316-BACKFILL-1"];

// =====================================================================================================================
sec("1. The statement is one statement, escaped-free, and parses");
const SQL = B.backfill;
const scan = (s) => { let inq = false, semi = 0, qm = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === "'") inq = !inq; else if (!inq && c === ";") semi++; else if (!inq && c === "?") qm++; } return { semi, qm, openQuote: inq }; };
const sc = scan(SQL);
ok(sc.semi === 0 && sc.qm === 0 && !sc.openQuote, "no ';' and no '?' outside string literals, quotes balanced", sc);
ok(!/["\\\n\r\t]/.test(SQL), "no double quote, backslash, newline or tab: the JSON string needs no escape beyond the surrounding quotes");
ok(/^UPDATE remediation_contracts SET /.test(SQL), "starts with UPDATE remediation_contracts");
{ const d = mkdb(); const st = d.prepare(SQL); ok(!!st, "prepares on SQLite " + one(d, "select sqlite_version() v").v); }
ok(Buffer.byteLength(SQL) < 100 * 1024, "far under the 100 KB D1 statement size", Buffer.byteLength(SQL));
{ const like = [...SQL.matchAll(/LIKE '((?:[^']|'')*)'/g)].map((m) => m[1]); ok(like.every((l) => Buffer.byteLength(l) <= 50), "LIKE patterns are at most 50 bytes", like); }

// =====================================================================================================================
sec("2. Arming: which contracts change, which do not");
const db = seed(mkdb());
const before = Object.fromEntries(q(db, "SELECT class FROM remediation_contracts").map((r) => [r.class, snapshot(db, r.class)]));
ok(ARMED.every(([id]) => before["issue-" + id].status === "superseded" && before["issue-" + id].module === "probe-template-v3-generic" && before["issue-" + id].action.startsWith("VACUOUS-PROBE-V3-1")), "before: every armed-to-be ticket is born superseded by the v3 generic trigger (live shape)");
const orphanSql = "SELECT COUNT(*) AS n FROM agent_issues a WHERE a.status = 'open' AND a.title LIKE 'ROOT-CAUSE-1: % keeps recurring' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding', 'monitoring', 'escalated'))";
const orphansBefore = one(db, orphanSql).n;
const vacuousSql = "SELECT COUNT(*) AS n FROM agent_issues a JOIN remediation_contracts c ON c.class = 'issue-' || a.id WHERE a.status = 'open' AND a.title LIKE 'ROOT-CAUSE-1:%' AND c.status = 'superseded'";
const vacuousBefore = one(db, vacuousSql).n;
const r1 = db.prepare(SQL).run();
ok(Number(r1.changes) === ARMED.length, "changes exactly the " + ARMED.length + " expected contracts", Number(r1.changes));
for (const cls of UNTOUCHED) ok(JSON.stringify(snapshot(db, cls)) === JSON.stringify(before[cls]), "untouched: " + cls);
ok(JSON.stringify(snapshot(db, "issue-1000309")) === JSON.stringify(before["issue-1000309"]), "a title carrying ';' is left superseded (the semicolon trigger would corrupt the family literal)");
const rows = [];
for (const [id, fam, ageH, rec, N, label] of ARMED) {
  const cls = "issue-" + id, c = snapshot(db, cls), title = T(fam);
  ok(c.status === "active" && c.last_verdict === null && c.attempts === 0 && c.deferred_since === null, `${cls} active, last_verdict NULL, attempts 0, deferred_since NULL`, [c.status, c.last_verdict, c.attempts, c.deferred_since]);
  ok(c.verify_transport === "d1-query" && c.module === "probe-template-v4-root-cause" && c.expected_cadence_h === 1 && c.max_attempts === 3 && c.escalate_to === "qnfo-fleet-control" && c.issue_id === id, `${cls} transport/module/cadence/max_attempts/escalate_to and issue_id set to ${id}`, c);
  ok(c.next_due_at && Math.abs(Date.parse(c.next_due_at.replace(" ", "T") + "Z") - Date.now()) < 120000, `${cls} next_due_at is now`, c.next_due_at);
  ok(c.action.startsWith("MEASURES") && !c.action.startsWith("VACUOUS-PROBE-V3-1") && c.precondition.includes("ROOT-CAUSE-CONTRACT-1"), `${cls} action/precondition rewritten`);
  ok(c.verify_probe === expectedProbe(title, id), `${cls} verify_probe is byte-identical to the independent oracle text`);
  const r = one(db, c.verify_probe);
  ok(r.expected === "0" && r.observed === String(N), `${cls} reads expected '0' / observed '${N}' (${label})`, r);
  rows.push({ class: cls, family: fam, age_h: ageH, status: c.status, verdict: c.last_verdict, expected: r.expected, observed: r.observed, oracle: N });
}
console.table(rows);
ok(one(db, orphanSql).n < orphansBefore && one(db, vacuousSql).n < vacuousBefore, "PROBE-NEEDED-1 filer orphan count and ROOT-CAUSE-PROBE-AT-BIRTH-1 vacuous count fall", { orphans: [orphansBefore, one(db, orphanSql).n], vacuous: [vacuousBefore, one(db, vacuousSql).n] });
const r2 = db.prepare(SQL).run();
ok(Number(r2.changes) === 0, "replay changes 0 rows (the VACUOUS marker is gone)");

sec("3. The probe is live: it follows the snapshot, the clock and the family, without being re-armed");
{
  const p = (id) => one(db, snapshot(db, "issue-" + id).verify_probe).observed;
  const saved = q(db, "SELECT * FROM issue_recurrence_now");
  db.exec("DELETE FROM issue_recurrence_now");
  ok(p(1000303) === "1" && p(1000301) === "2" && p(1000302) === "1", "empty snapshot (mid-refresh): old ticket reads 1, young ticket reads 2", [p(1000303), p(1000301), p(1000302)]);
  for (const r of saved) db.prepare("INSERT INTO issue_recurrence_now (family, reopens_7d, issues_7d, reopens_24h, opens_24h, last_issue_id, program_code, project_code, computed_at) VALUES (?,?,?,?,?,?,?,?,?)").run(r.family, r.reopens_7d, r.issues_7d, r.reopens_24h, r.opens_24h, r.last_issue_id, r.program_code, r.project_code, r.computed_at);
  ok(p(1000302) === "10" && p(1000303) === "0", "snapshot refilled: back to 10 and 0");
  db.prepare("UPDATE agent_issues SET created_at = ? WHERE id = 1000305").run(Date.now() - 25 * H);
  ok(p(1000305) === "0", "ticket 1000305 turns 24 hours old: the +1 leaves, reads 0", p(1000305));
  db.prepare("UPDATE agent_issues SET created_at = ? WHERE id = 1000305").run(Date.now() - 1 * H);
  db.prepare("UPDATE issue_recurrence_now SET reopens_24h = 0, opens_24h = 0 WHERE family = 'FLEET-JOURNEY-FAILED-1'").run();
  ok(p(1000302) === "0", "family goes quiet: 1000302 reads 0");
  db.prepare("UPDATE issue_recurrence_now SET reopens_24h = 1 WHERE family = 'FLEET-JOURNEY-FAILED-1'").run();
  ok(p(1000302) === "1", "one reopen in the family: reads 1 (any activity keeps it open)");
  db.prepare("UPDATE issue_recurrence_now SET reopens_24h = 0 WHERE family = 'FLEET-JOURNEY-FAILED-1'").run();
  db.prepare("UPDATE agent_issues SET created_at = NULL WHERE id = 1000303").run();
  ok(p(1000303) === "1", "NULL created_at counts as young (conservative, like the view's NULL < x)");
  db.prepare("DELETE FROM agent_issues WHERE id = 1000303").run();
  ok(one(db, snapshot(db, "issue-1000303").verify_probe).observed === "0", "a ticket row that vanished still reads a number, never NULL", one(db, snapshot(db, "issue-1000303").verify_probe));
}

// =====================================================================================================================
sec("4. The gates the probers apply (ports of worker.js:11639-11640 and remediation_consumer.py:257-273)");
{
  const db2 = seed(mkdb()); db2.prepare(SQL).run();
  const gateRows = [];
  for (const [id, fam] of ARMED) {
    const c = snapshot(db2, "issue-" + id), pr = c.verify_probe;
    const subs = ["insert", "update", "delete", "drop", "alter", "create", "replace"].filter((w) => pr.toLowerCase().includes(w));
    gateRows.push({ class: c.class, tick_gate: tickGate(pr), consumer_gate: consumerGate(pr), circular: circular(pr, id), semicolon: pr.includes(";"), whole_word_hit: WORDS.test(pr), substring_hits: subs.join("|") || "-", starts_select: pr.startsWith("SELECT ") });
    ok(tickGate(pr) && consumerGate(pr) && !circular(pr, id) && !pr.includes(";") && !WORDS.test(pr) && pr.startsWith("SELECT "), `${c.class}: passes the tick gate, the consumer gate, is not circular, has no ';' and no write word`);
  }
  console.table(gateRows.slice(0, 3));
  const subHits = new Set(gateRows.flatMap((g) => g.substring_hits.split("|")));
  ok([...subHits].every((w) => w === "-" || w === "create"), "the only write-word substring anywhere is 'create' inside the column name created_at (a naive substring check would trip, the probers' word-bounded gates do not)", [...subHits]);
  // the three markers the repo uses to call a probe circular (rtLivePathProbe, red-drain step 7, agent_issues_reopen_live_path_upd)
  ok(!snapshot(db2, "issue-1000301").verify_probe.includes("agent_issues WHERE id = 1000301)") && snapshot(db2, "issue-1000301").verify_probe.includes("agent_issues x WHERE x.id = 1000301)"), "the ticket is read through an alias, so the instr() markers do not match");
  // PROBE-NEEDED-1 twin closing probe, text copied from rtLivePathProbe (worker.js:12061)
  const twin = (n) => "SELECT 'ok' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = " + n + " AND x.status = 'open') THEN 'ok' WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = " + n + " AND c.status IN ('active', 'holding') AND instr(c.verify_probe, 'needs-machine' || '-probe') = 0 AND instr(c.verify_probe, 'SELECT status FROM agent_issues WHERE' || ' id =') = 0 AND instr(c.verify_probe, 'agent_issues WHERE id = " + n + ")') = 0) THEN 'ok' ELSE 'pending: issue " + n + " has no probe of its own yet, a doer writes one' END AS observed";
  const tw = (n) => one(db2, twin(n));
  ok(tw(1000301).observed === "ok" && tw(1000302).observed === "ok", "the PROBE-NEEDED-1 twin closing probe reads ok for an armed ticket", [tw(1000301), tw(1000302)]);
  ok(tw(1000309).observed.startsWith("pending"), "and still reads pending for the one ticket left superseded (1000309)", tw(1000309));
  // the Python consumer: classify() and deferral rule
  const classify = (e, o) => { const E = e == null ? "" : String(e).trim(), O = o == null ? "" : String(o).trim(); if (!E || !O) return "vacuous"; return E === O ? "pass" : "fail"; };
  const r = one(db2, snapshot(db2, "issue-1000304").verify_probe), r2 = one(db2, snapshot(db2, "issue-1000302").verify_probe);
  ok(classify(r.expected, r.observed) === "pass" && classify(r2.expected, r2.observed) === "fail", "consumer classify(): quiet family passes, busy family fails (never 'vacuous', never a deferral)", [r, r2]);
  ok(typeof r.observed === "string" && typeof r.expected === "string", "both columns are TEXT");
}

// =====================================================================================================================
sec("5. Lifecycle with the live view and the live close triggers: no deadlock");
const probeOnce = (db, cls, verifier = "emul") => { // tick-style: verification row first, then the contract stamp
  const c = snapshot(db, cls); const qq = String(c.verify_probe).trim();
  if (!tickGate(qq)) { db.prepare("UPDATE remediation_contracts SET last_verdict = 'probe-not-machine-executable', attempts = attempts + 1 WHERE class = ?").run(cls); return { verdict: "probe-not-machine-executable" }; }
  const r = db.prepare(qq).get(); const keys = Object.keys(r); const exp = r.expected !== undefined ? r.expected : r[keys[0]]; const obs = r.observed !== undefined ? r.observed : r[keys[1]];
  let verdict, p = null;
  if (exp == null || String(exp).trim() === "") verdict = "vacuous-probe-result";
  else if (obs == null || String(obs).trim() === "") { p = 0; verdict = "fail"; }
  else if (/^pending/i.test(String(obs).trim())) verdict = "deferred";
  else { p = String(exp).trim() === String(obs).trim() ? 1 : 0; verdict = p ? "pass" : "fail"; }
  if (p !== null) db.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verifier) VALUES (?, ?, 'd1-query', ?, ?, ?, ?)").run(c.issue_id, cls, String(exp), obs == null ? null : String(obs), p, verifier);
  db.prepare("UPDATE remediation_contracts SET last_verdict = ?, attempts = attempts + 1, last_attempt_at = datetime('now') WHERE class = ?").run(verdict, cls);
  return { verdict, exp, obs };
};
const inView = (db, id) => q(db, "SELECT issue_id FROM v_root_cause_quiet").some((r) => r.issue_id === id);
const issueStatus = (db, id) => one(db, "SELECT status, close_channel FROM agent_issues WHERE id = ?", id);
const RC_EVIDENCE = "INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT issue_id, 'recurrence-stopped', 'triaged', 'management-personas', datetime('now'), evidence FROM v_root_cause_quiet WHERE 1 ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence";
const RC_CLOSE = "UPDATE agent_issues SET status = 'closed', close_channel = 'auto:management-personas', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id IN (SELECT issue_id FROM v_root_cause_quiet)";
{
  const d = mkdb(); const add = (id, fam, ageH) => d.prepare("INSERT INTO agent_issues (id, title, description, source, status, priority, created_at, updated_at) VALUES (?, ?, 'x', 'management-personas', 'open', 'critical', ?, ?)").run(id, T(fam), Date.now() - ageH * H, Date.now() - ageH * H);
  add(1000401, "FAM-L", 30); add(1000402, "FAM-U", 30); add(1000403, "FAM-V", 30);
  for (const f of ["FAM-L", "FAM-U", "FAM-V"]) d.prepare("INSERT INTO issue_recurrence_now (family, reopens_7d, issues_7d, reopens_24h, opens_24h) VALUES (?, 6, 6, 3, 2)").run(f);
  d.prepare(SQL).run();
  const tl = [];
  for (let i = 0; i < 4; i++) { const r = probeOnce(d, "issue-1000401"); tl.push({ step: "busy probe " + (i + 1), verdict: r.verdict, observed: r.obs, attempts: snapshot(d, "issue-1000401").attempts, in_view: inView(d, 1000401), status: issueStatus(d, 1000401).status }); }
  ok(tl.every((t) => t.verdict === "fail" && t.in_view === false && t.status === "open"), "busy family: the contract reads fail, the ticket stays open, nothing aborts or reopens");
  for (let i = 0; i < 20; i++) probeOnce(d, "issue-1000401");
  const exempt = one(d, "SELECT (issue_id IS NOT NULL AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%') AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.class <> remediation_contracts.class AND c2.status IN ('active','holding'))) AS exempt, attempts FROM remediation_contracts WHERE class = 'issue-1000401'");
  ok(exempt.exempt === 1 && exempt.attempts > 15, "after " + exempt.attempts + " failing reads the contract is exempt from red-drain step 2 (PARKED-REARM-2: sole live contract of an open non-METRIC-TRIGGER issue)", exempt);
  d.prepare("UPDATE issue_recurrence_now SET reopens_24h = 0, opens_24h = 0 WHERE family = 'FAM-L'").run();
  const a = probeOnce(d, "issue-1000401");
  tl.push({ step: "family quiet: first read", verdict: a.verdict, observed: a.obs, attempts: snapshot(d, "issue-1000401").attempts, in_view: inView(d, 1000401), status: issueStatus(d, 1000401).status });
  ok(a.verdict === "pass" && a.obs === "0", "first read after the family goes quiet passes");
  ok(issueStatus(d, 1000401).status === "open", "that first pass does NOT close the issue by trigger: the stale 'fail' verdict is still on the contract when the pass row lands (documented order: verification row, then stamp)");
  ok(inView(d, 1000401) === true, "after the stamp the ticket is listed by v_root_cause_quiet (the deadlock of a probe that reads the view is absent)");
  d.exec(RC_EVIDENCE); d.exec(RC_CLOSE);
  const st = issueStatus(d, 1000401);
  tl.push({ step: "rc-close-evidence + rc-close", verdict: "-", observed: "-", attempts: snapshot(d, "issue-1000401").attempts, in_view: inView(d, 1000401), status: st.status });
  ok(st.status === "closed" && st.close_channel === "auto:management-personas" && /recurrence stopped: family FAM-L/.test(one(d, "SELECT close_evidence FROM issue_triage WHERE issue_id = 1000401").close_evidence), "rc-close closes it with the workflow's own evidence text, without 'close-while-contract-fails'", st);
  console.table(tl);

  // second ticket: the verification trigger closes it on the second consecutive pass, before rc-close runs
  probeOnce(d, "issue-1000402"); // busy: fail
  d.prepare("UPDATE issue_recurrence_now SET reopens_24h = 0, opens_24h = 0 WHERE family = 'FAM-U'").run();
  probeOnce(d, "issue-1000402"); const mid = issueStatus(d, 1000402).status; const second = probeOnce(d, "issue-1000402"); const after = issueStatus(d, 1000402);
  ok(mid === "open" && after.status === "closed" && after.close_channel === "auto:verified-remediation-trigger", "other path: the second pass closes it through remediation_verification_autoclose_ins", { mid, after, second: second.verdict });
  ok(/^remediation_verifications#\d+ pass=1 class=issue-1000402 transport=d1-query/.test(one(d, "SELECT close_evidence FROM issue_triage WHERE issue_id = 1000402").close_evidence), "with its verification row as close_evidence");

  // negative control: the naive probe that reads v_root_cause_quiet (what ROOT-CAUSE-PROBE-AT-BIRTH-1's description prescribes)
  d.prepare("UPDATE issue_recurrence_now SET reopens_24h = 0, opens_24h = 0 WHERE family = 'FAM-V'").run();
  d.prepare("UPDATE agent_issues SET created_at = ? WHERE id = 1000403").run(Date.now() - 1 * H); // starts young, as every new ticket does
  d.prepare("UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CAST((SELECT COUNT(*) FROM v_root_cause_quiet WHERE issue_id = 1000403) AS TEXT) AS observed', last_verdict = NULL, attempts = 0 WHERE class = 'issue-1000403'").run();
  const naive = []; naive.push(probeOnce(d, "issue-1000403").verdict); // young: view empty -> fail, which hides the ticket from the view
  d.prepare("UPDATE agent_issues SET created_at = ? WHERE id = 1000403").run(Date.now() - 30 * H); // now old and quiet: the view WOULD list it but for the fail verdict
  for (let i = 0; i < 5; i++) naive.push(probeOnce(d, "issue-1000403").verdict);
  ok(naive.every((v) => v === "fail") && !inView(d, 1000403) && issueStatus(d, 1000403).status === "open", "NEGATIVE CONTROL: the naive view-reading probe fails for ever once it has failed young (6 reads: " + naive.join(",") + "), the view never lists the ticket", naive);
  d.prepare("UPDATE remediation_contracts SET verify_probe = ?, last_verdict = NULL, attempts = 0 WHERE class = 'issue-1000403'").run(expectedProbe(T("FAM-V"), 1000403));
  d.prepare("UPDATE remediation_contracts SET last_verdict = 'fail' WHERE class = 'issue-1000403'").run(); // it was failing: the worst start
  const rec = probeOnce(d, "issue-1000403");
  ok(rec.verdict === "pass" && inView(d, 1000403), "the same ticket, same moment, with the measuring probe: pass, and it is listed (the measuring probe recovers even from a standing 'fail')");

  // TOCTOU between rc-close-evidence and rc-close (a new exposure this change creates, quantified in the risks)
  const d3 = mkdb(); d3.prepare("INSERT INTO agent_issues (id, title, description, source, status, priority, created_at, updated_at) VALUES (1000501, ?, 'x', 'management-personas', 'open', 'critical', ?, ?)").run(T("FAM-T"), Date.now() - 30 * H, Date.now() - 30 * H);
  d3.prepare("INSERT INTO issue_recurrence_now (family, reopens_7d, issues_7d, reopens_24h, opens_24h) VALUES ('FAM-T', 6, 6, 0, 0)").run(); d3.prepare(SQL).run();
  d3.prepare("UPDATE remediation_contracts SET last_verdict = 'fail' WHERE class = 'issue-1000501'").run();
  d3.exec(RC_EVIDENCE); // view excludes it (fail): no evidence row
  d3.prepare("UPDATE remediation_contracts SET last_verdict = 'pass' WHERE class = 'issue-1000501'").run(); // the probe flips fail->pass in the gap
  let abort = null; try { d3.exec(RC_CLOSE); } catch (e) { abort = String(e.message); }
  ok(abort && /close-without-evidence/.test(abort), "TOCTOU reproduced: a fail->pass flip between rc-close-evidence and rc-close aborts the run with 'close-without-evidence' (self-heals next hour; once per ticket lifetime)", abort);
}

// reopen path through the live trigger
{
  const d = mkdb(); d.prepare("INSERT INTO agent_issues (id, title, description, source, status, priority, created_at, updated_at) VALUES (1000601, ?, 'x', 'management-personas', 'open', 'critical', ?, ?)").run(T("FAM-R"), Date.now() - 30 * H, Date.now() - 30 * H);
  d.prepare(SQL).run();
  d.prepare("UPDATE remediation_contracts SET status = 'closed', last_verdict = 'pass', attempts = 99 WHERE class = 'issue-1000601'").run(); // tick: held 7 days, then closed
  d.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (1000601, 'x', 'closed', 'x', datetime('now'), 'recurrence stopped')").run();
  d.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 1000601").run();
  d.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 1000601").run();
  const c = snapshot(d, "issue-1000601");
  ok(c.status === "active" && c.last_verdict === null && c.attempts === 0 && c.verify_probe === expectedProbe(T("FAM-R"), 1000601), "a reopened ticket whose contract was closed gets it back, active, with the same measuring probe (agent_issues_reopen_live_path_upd does not see it as circular)", c);
}

// newborn path with the live rc-file statement
{
  const d = mkdb();
  d.prepare("INSERT INTO issue_recurrence_now (family, reopens_7d, issues_7d, reopens_24h, opens_24h, last_issue_id) VALUES ('NEW-FAM', 6, 8, 2, 1, 4242)").run();
  const RC_FILE = "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT 'ROOT-CAUSE-1: ' || r.family || ' keeps recurring', 'MANAGEMENT-PERSONAS-3 (ECOSYSTEM-LOOP-1): issues of the family ' || r.family || ' were reopened ' || r.reopens_7d || ' times across ' || r.issues_7d || ' issues in 7 days (latest #' || r.last_issue_id || '). A fix that holds changes the producer or the probe that keeps closing and reopening them, not the individual issues.', 'management-personas', 'reliability', 'critical', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000 FROM issue_recurrence_now r WHERE r.reopens_7d >= 5 AND r.reopens_24h + r.opens_24h > 0 AND r.family IN (SELECT family FROM issue_recurrence_now WHERE reopens_7d >= 5 ORDER BY reopens_7d DESC LIMIT 10) AND NOT EXISTS (SELECT 1 FROM agent_issues b WHERE b.title = 'ROOT-CAUSE-1: ' || r.family || ' keeps recurring' AND b.status = 'open') AND COALESCE((SELECT value FROM ops_config WHERE key = 'persona_actions'), 'on') <> 'off'";
  d.exec(RC_FILE);
  const born = one(d, "SELECT c.* FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.title = 'ROOT-CAUSE-1: NEW-FAM keeps recurring'");
  ok(born.status === "superseded" && born.module === "probe-template-v3-generic" && born.action.startsWith("VACUOUS-PROBE-V3-1"), "rc-file (live SQL) files a ticket and the birth chain gives it the vacuous contract", born);
  const step = B.stepObj;
  d.prepare(step.sql).all(); // the runner: prepare(def.sql).all()
  const armed = one(d, "SELECT c.*, a.id AS aid FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.title = 'ROOT-CAUSE-1: NEW-FAM keeps recurring'");
  ok(armed.status === "active" && one(d, armed.verify_probe).observed === "4", "the step run the way fleet-exec runs it arms the newborn in the same run: active, observed 3 + 1 (young) = 4", one(d, armed.verify_probe));
  d.exec(RC_FILE);
  ok(q(d, "SELECT id FROM agent_issues WHERE title = 'ROOT-CAUSE-1: NEW-FAM keeps recurring'").length === 1, "rc-file does not file a second open ticket (dedupe unchanged)");
  const r = d.prepare(step.sql).run();
  ok(Number(r.changes) === 0, "the step is a no-op on the next hourly run");
}

// =====================================================================================================================
sec("6. The workflow step: JSON, json_insert, version bump, replay");
const OLD_STEPS = [
  { type: "sql", name: "recur-clear", db: "AUDIT", sql: "DELETE FROM issue_recurrence_now" },
  { type: "sql", name: "probe-note", db: "AUDIT", sql: "UPDATE ops_config SET note = 'a;b? \"quoted\" it''s' WHERE key = 'x'" },
  { type: "sql", name: "rc-close-evidence", db: "AUDIT", sql: RC_EVIDENCE },
  { type: "sql", name: "rc-close", db: "AUDIT", sql: RC_CLOSE },
];
const mkWf = () => { const d = seed(mkdb()); d.prepare("INSERT INTO fleet_tasks (id, type, definition, version, enabled, updated_at) VALUES ('management-personas', 'workflow', json(?), 8, 1, '2026-10-26T11:02:27Z')").run(JSON.stringify({ steps: OLD_STEPS })); return d; };
const stepsOf = (d) => JSON.parse(one(d, "SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
{
  const parsed = JSON.parse(B.stepJson);
  ok(JSON.stringify(Object.keys(parsed)) === '["type","name","db","sql"]' && parsed.type === "sql" && parsed.db === "AUDIT" && parsed.name === "rc-contract" && parsed.sql === B.backfill, "step JSON: type sql, db AUDIT, unique name, sql equals the statement byte for byte");
  ok(B.stepJson === B.stepJson.replace(/\\/g, "") , "the JSON text contains no backslash escape at all (the SQL has no double quote, backslash or newline)");
  const d = mkWf();
  const defBefore = one(d, "SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition;
  const res = d.prepare(B.jsonInsertSql).run();
  const row = one(d, "SELECT * FROM fleet_tasks WHERE id = 'management-personas'");
  const st = stepsOf(d);
  ok(Number(res.changes) === 1 && row.version === 9 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(row.updated_at) && row.updated_at !== "2026-10-26T11:02:27Z", "one row updated, version 8 -> 9, updated_at restamped", row);
  ok(st.length === OLD_STEPS.length + 1 && JSON.stringify(st.slice(0, -1)) === JSON.stringify(OLD_STEPS), "the old steps are untouched and in order (quotes, ';', '?' inside literals survive)");
  ok(JSON.stringify(st.at(-1)) === B.stepJson && st.at(-1).sql === B.backfill, "the appended step equals the step JSON, sql byte-identical to the statement");
  ok(one(d, "SELECT json_valid(definition) AS v FROM fleet_tasks WHERE id = 'management-personas'").v === 1, "stored definition is valid JSON");
  ok(row.definition.slice(0, defBefore.length - 2) === defBefore.slice(0, -2), "definition text: everything before the closing of the steps array is unchanged (append only)");
  const res2 = d.prepare(B.jsonInsertSql).run();
  ok(Number(res2.changes) === 0 && one(d, "SELECT version FROM fleet_tasks").version === 9 && stepsOf(d).length === OLD_STEPS.length + 1, "replay: name guard makes it a no-op (no second step, no version bump)");
  const d2 = mkWf(); d2.prepare(B.jsonInsertLiteralSql).run();
  ok(one(d2, "SELECT definition FROM fleet_tasks").definition === row.definition, "the precedent form json('<literal>') gives a byte-identical definition to the json_object form");
  // run the whole stored workflow the way the runner does: in array order, prepare(sql).all(), first throw ends the run
  const ran = []; for (const s of stepsOf(d)) { try { d.prepare(s.sql).all(); ran.push(s.name); } catch (e) { ran.push(s.name + "!" + e.message); break; } }
  ok(ran.length === OLD_STEPS.length + 1 && ran.every((n) => !n.includes("!")), "all steps run through prepare().all(), including the new last one", ran);
  const dn = seed(mkdb()); dn.prepare("INSERT INTO fleet_tasks (id, type, definition, version, enabled) VALUES ('management-personas', 'workflow', json(?), 8, 1)").run(JSON.stringify({ steps: [] }));
  dn.prepare(B.jsonInsertSql).run(); ok(stepsOf(dn).length === 1, "works on an empty steps array");
  const dx = mkdb(); dx.prepare("INSERT INTO fleet_tasks (id, type, definition, version) VALUES ('management-personas', 'workflow', 'not json', 8)").run();
  ok(Number(dx.prepare(B.jsonInsertSql).run().changes) === 0, "a definition that is not valid JSON is left alone (json_valid guard)");
  const dz = mkdb(); dz.prepare("INSERT INTO fleet_tasks (id, type, definition, version) VALUES ('other', 'workflow', ?, 3)").run(JSON.stringify({ steps: [] }));
  ok(Number(dz.prepare(B.jsonInsertSql).run().changes) === 0, "another workflow is never touched");
}

// =====================================================================================================================
sec("7. The migration file end to end, then the Rollback line from its header");
{
  const d = mkWf(); const preSteps = stepsOf(d); const preContracts = q(d, "SELECT * FROM remediation_contracts ORDER BY class");
  const mig = B.migration; const hdr = mig.split("\n").filter((l) => l.startsWith("-- "));
  ok(/^-- APPLY-BY: ci$/m.test(mig) && /^-- DB: qnfo-audit$/m.test(mig) && /^-- BACKUP: bak_\w+$/m.test(mig) && mig.split("\n").filter((l) => /^-- Rollback:/.test(l)).length === 1, "headers: APPLY-BY ci, DB qnfo-audit, BACKUP, exactly one single-line Rollback");
  d.exec(mig);
  const bw = one(d, `SELECT COUNT(*) AS n, json_array_length(definition, '$.steps') AS steps, version FROM ${B.BAK_WF}`), bc = one(d, `SELECT COUNT(*) AS n FROM ${B.BAK_CT}`);
  ok(bw.n === 1 && bw.steps === OLD_STEPS.length && bw.version === 8, "workflow backup holds the pre-migration definition and version", bw);
  ok(bc.n === ARMED.length, "contract backup holds the " + ARMED.length + " contracts the file armed", bc);
  const armedNow = q(d, "SELECT class FROM remediation_contracts WHERE module = 'probe-template-v4-root-cause'");
  ok(armedNow.length === ARMED.length && stepsOf(d).at(-1).name === "rc-contract" && one(d, "SELECT version FROM fleet_tasks").version === 9, "migration armed the existing tickets at merge (no wait for the next :36 run) and appended the step");
  const snap1 = JSON.stringify(q(d, "SELECT * FROM remediation_contracts ORDER BY class").map((r) => ({ ...r, next_due_at: 0 }))), def1 = one(d, "SELECT definition, version FROM fleet_tasks").definition;
  d.exec(mig);
  ok(def1 === one(d, "SELECT definition FROM fleet_tasks").definition && one(d, "SELECT version FROM fleet_tasks").version === 9 && snap1 === JSON.stringify(q(d, "SELECT * FROM remediation_contracts ORDER BY class").map((r) => ({ ...r, next_due_at: 0 }))) && one(d, `SELECT COUNT(*) AS n FROM ${B.BAK_CT}`).n === ARMED.length, "replaying the whole file changes nothing, backups included");
  // a ticket born after the migration is armed by the step and is not in the contract backup
  d.prepare("INSERT INTO agent_issues (id, title, description, source, status, priority, created_at, updated_at) VALUES (1000999, ?, 'x', 'management-personas', 'open', 'critical', ?, ?)").run(T("LATE-FAM"), Date.now(), Date.now());
  for (const s of stepsOf(d)) if (s.name === "rc-contract") d.prepare(s.sql).all();
  ok(snapshot(d, "issue-1000999").status === "active", "a ticket born later is armed by the step");
  // Rollback line exactly as it is in the header
  const rb = mig.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  ok(rb === B.rollbackLine && !rb.includes("\n"), "the header line is the Rollback text, one line, " + Buffer.byteLength(rb) + " bytes");
  d.exec(rb);
  const postSteps = stepsOf(d), postContracts = q(d, "SELECT * FROM remediation_contracts WHERE class <> 'issue-1000999' ORDER BY class");
  ok(JSON.stringify(postSteps) === JSON.stringify(preSteps) && one(d, "SELECT version FROM fleet_tasks").version === 10, "Rollback removes the step by name; the other steps are back as they were (version 8 -> 9 -> 10, a convention)");
  const strip = (r) => ({ ...r, next_due_at: r.next_due_at }); // exact comparison, all columns
  ok(JSON.stringify(postContracts.map(strip)) === JSON.stringify(preContracts.map(strip)), "Rollback restores every pre-migration contract row exactly (all columns), from the backup table");
  const ref = mkdb(); ref.prepare("INSERT INTO agent_issues (id, title, description, source, status, priority, created_at, updated_at) VALUES (1000999, ?, 'x', 'management-personas', 'open', 'critical', ?, ?)").run(T("LATE-FAM"), Date.now(), Date.now());
  const a = snapshot(d, "issue-1000999"), b = snapshot(ref, "issue-1000999");
  const cmp = ["status", "verify_probe", "verify_transport", "last_verdict", "module", "action", "precondition", "attempts", "deferred_since"].filter((k) => a[k] !== b[k]);
  ok(cmp.length === 0, "a contract armed after the migration (not in the backup) is rolled back to the born v3 shape from constants", cmp.map((k) => [k, a[k], b[k]]));
  // the repo's own migration linter, run separately: python3 scripts/apply_migrations.py --check <file>  (see verification_output)
}

// =====================================================================================================================
sec("8. Mutants: each must fail at least one assertion of the battery");
function battery(sqlText, opts = {}) {
  const f = [];
  const chk = (c, m) => { if (!c) f.push(m); };
  try {
    const d = seed(mkdb()); if (opts.noRerun) d.exec("DROP TRIGGER remediation_probe_edit_rerun"); const pre = {}; for (const r of q(d, "SELECT class FROM remediation_contracts")) pre[r.class] = JSON.stringify(snapshot(d, r.class));
    const res = d.prepare(sqlText).run();
    chk(Number(res.changes) === ARMED.length, "count");
    for (const cls of UNTOUCHED) chk(JSON.stringify(snapshot(d, cls)) === pre[cls], "untouched " + cls);
    for (const [id, fam, , , N] of ARMED) {
      const c = snapshot(d, "issue-" + id), title = T(fam);
      chk(c.status === "active", "status " + id); chk(c.last_verdict === null, "verdict " + id); chk(c.attempts === 0 && c.deferred_since === null, "attempts " + id);
      chk(c.module === "probe-template-v4-root-cause" && c.verify_transport === "d1-query" && c.expected_cadence_h === 1, "module " + id);
      chk(c.issue_id === id, "issue_id " + id);
      chk(c.next_due_at !== null && !String(c.next_due_at).startsWith("2026-10-18"), "due " + id);
      chk(c.action.startsWith("MEASURES"), "action " + id);
      chk(c.verify_probe === expectedProbe(title, id), "probe text " + id);
      let r; try { r = one(d, c.verify_probe); } catch { r = null; }
      chk(r && r.expected === "0" && r.observed === String(N), "probe value " + id);
      chk(tickGate(c.verify_probe) && consumerGate(c.verify_probe) && !circular(c.verify_probe, id) && !WORDS.test(c.verify_probe), "gates " + id);
      d.exec("DELETE FROM issue_recurrence_now");
      try { const e = one(d, c.verify_probe); const base = (ARMED.find((a) => a[0] === id)[2] < 24) ? 1 : 0; chk(e && e.observed === String(base + 1), "empty snapshot " + id); } catch { chk(false, "empty snapshot " + id); }
      for (const [, f2, , rec2] of ARMED) if (rec2) d.prepare("INSERT OR REPLACE INTO issue_recurrence_now (family, reopens_7d, issues_7d, reopens_24h, opens_24h) VALUES (?, 9, 9, ?, ?)").run(f2, rec2[0], rec2[1]);
    }
    const r2 = d.prepare(sqlText).run(); chk(Number(r2.changes) === 0, "replay");
  } catch (e) { f.push("threw: " + String(e.message).slice(0, 80)); }
  return f;
}
{
  ok(battery(B.backfill).length === 0, "the battery passes on the real statement", battery(B.backfill));
  const O = B.backfill;
  const rep = (from, to) => (s) => { const n = s.split(from).length - 1; if (n !== 1) throw new Error("anchor occurs " + n + "x: " + from.slice(0, 60)); return s.replace(from, () => to); };
  const all = (...fs) => (s) => fs.reduce((x, f) => f(x), s);
  const M = [
    ["drop the status = 'superseded' guard", rep("WHERE status = 'superseded' AND substr", "WHERE substr")],
    ["drop the VACUOUS-PROBE-V3-1 guard", rep(" AND substr(action, 1, 18) = 'VACUOUS-PROBE-V3-1'", "")],
    ["drop t.status = 'open'", rep(" AND t.status = 'open'", "")],
    ["drop the ROOT-CAUSE title LIKE", rep(" AND t.title LIKE 'ROOT-CAUSE-1: % keeps recurring'", "")],
    ["drop the ';' title guard", rep(" AND instr(t.title, ';') = 0", "")],
    ["do not double the quotes in the family", rep("replace(substr(a.title, 15, instr(a.title, ' keeps recurring') - 15), '''', '''''')", "substr(a.title, 15, instr(a.title, ' keeps recurring') - 15)")],
    ["family off by one", rep("substr(a.title, 15, instr(a.title, ' keeps recurring') - 15)", "substr(a.title, 14, instr(a.title, ' keeps recurring') - 14)")],
    ["expected 1 instead of 0", rep("SELECT ''0'' AS expected", "SELECT ''1'' AS expected")],
    ["drop the empty-snapshot term", rep(" + (SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END FROM issue_recurrence_now)", "")],
    ["drop the young-ticket term", rep(" + COALESCE((SELECT CASE WHEN x.created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 86400) * 1000 THEN 0 ELSE 1 END FROM agent_issues x WHERE x.id = ' || a.id || '), 0)", "")],
    ["invert the age test", rep("THEN 0 ELSE 1 END FROM agent_issues x", "THEN 1 ELSE 0 END FROM agent_issues x")],
    ["count only reopens", rep("SUM(r.reopens_24h + r.opens_24h)", "SUM(r.reopens_24h)")],
    ["count only opens", rep("SUM(r.reopens_24h + r.opens_24h)", "SUM(r.opens_24h)")],
    ["no COALESCE around the SUM (NULL observed when the family is absent)", rep("COALESCE(SUM(r.reopens_24h + r.opens_24h), 0)", "SUM(r.reopens_24h + r.opens_24h)")],
    ["leave the contract superseded", rep("status = 'active', ", "")],
    ["seed last_verdict = 'fail'", rep("last_verdict = NULL", "last_verdict = 'fail'")],
    ["seed last_verdict = 'deferred'", rep("last_verdict = NULL", "last_verdict = 'deferred'")],
    ["keep the old attempts", rep("attempts = 0, ", "")],
    ["keep the old deferred_since", rep("deferred_since = NULL, ", "")],

    ["do not repair issue_id from the class", rep(" issue_id = CAST(substr(remediation_contracts.class, 7) AS INTEGER),", "")],
    ["keep module v3-generic", rep("module = 'probe-template-v4-root-cause'", "module = 'probe-template-v3-generic'")],
    ["leave the VACUOUS action text", rep("action = 'MEASURES the closing", "action = 'VACUOUS-PROBE-V3-1: the closing")],
    ["read the ticket without an alias (circular marker)", all(rep("FROM agent_issues x WHERE x.id = ' || a.id", "FROM agent_issues WHERE id = ' || a.id"), rep("CASE WHEN x.created_at <", "CASE WHEN created_at <"))],
    ["write a ';' into the middle of the probe (the semicolon trigger turns it into ',' and the SQL breaks)", rep("AS expected, CAST(", "AS expected, ; CAST(")],
    ["write 'update ' into the probe", rep("AS TEXT) AS observed'", "AS TEXT) AS observed /* update */'")],
    ["select by issue_id instead of class", rep("t.id = CAST(substr(remediation_contracts.class, 7) AS INTEGER) AND 'issue-' || t.id = remediation_contracts.class", "t.id = remediation_contracts.issue_id")],
    ["drop the class = 'issue-' || id equality (arms the BACKFILL second contract)", rep(" AND 'issue-' || t.id = remediation_contracts.class", "")],
    ["attempt a status flip only on the first match (LIMIT-style narrowing)", rep("WHERE status = 'superseded' AND substr", "WHERE class = (SELECT MIN(class) FROM remediation_contracts) AND status = 'superseded' AND substr")],
  ];
  const out = [];
  for (const [name, fn] of M) {
    let mut; try { mut = fn(O); } catch (e) { ok(false, "mutant '" + name + "' builds: " + e.message); continue; }
    const f = battery(mut);
    out.push({ mutant: name, killed: f.length > 0, first_failure: f[0] || "-", failures: f.length });
    ok(mut !== O && f.length > 0, "killed: " + name + " (" + (f[0] || "SURVIVED") + ")");
  }
  { const mut = rep("next_due_at = datetime('now'), ", "")(O);
    ok(battery(mut).length === 0, "equivalent mutant under the live triggers: dropping next_due_at survives because remediation_probe_edit_rerun re-stamps it on any verify_probe change (the explicit assignment is kept as defence in depth)");
    const f2 = battery(mut, { noRerun: true });
    ok(f2.length > 0, "...and is killed once that trigger is absent (" + (f2[0] || "SURVIVED") + ")"); out.push({ mutant: "keep the old next_due_at (without the rerun trigger)", killed: f2.length > 0, first_failure: f2[0] || "-", failures: f2.length }); }
  console.table(out);
  console.log("mutants:", out.length, "killed:", out.filter((o) => o.killed).length);
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
