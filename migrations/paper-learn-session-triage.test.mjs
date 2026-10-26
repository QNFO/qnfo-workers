// PAPER-LEARN-SESSION-TRIAGE-1 offline suite: replays migrations/2026-10-26-paper-learn-session-triage.sql on SQLite.
// Proves: the 21 learnings of the five oldest open PAPER-LEARN-1 issues (100311, 100319, 100325, 100338, 100353) each get the intended disposition and a
// PL-TRIAGE-1 note, so the closing probe of each issue reads 0; a learning of another version, an analogy-only one and one a person already settled are untouched;
// every rejected note names a reason and every routed note names its successor issue; the three new catalogue probes are one read-only SELECT that reads ok on a
// healthy fleet and absent when their evidence is missing; the note appended to issue 1000043 and the decision are written once; a second apply changes nothing; the
// Rollback line restores the 21 rows and removes the three mechanisms.
// Run: node --no-warnings migrations/paper-learn-session-triage.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-paper-learn-session-triage.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261026_paper_learnings$/m.test(sql), "the opt-in, DB and BACKUP headers are present");

const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE paper_learnings (id INTEGER PRIMARY KEY, slug TEXT, version TEXT, claim TEXT, kind TEXT, applicability TEXT, fleet_status TEXT DEFAULT 'proposed', status_note TEXT, issue_id INTEGER, updated_at TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, job TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_refreshed TEXT, last_value TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, description TEXT, updated_at INTEGER);`);
const papers = {
  100311: ["quantifying-the-reuse-barrier-in-published-omics-data-dispersal-cost-and-feasibi", "2.0.0", [644, 645, 646, 647, 650]],
  100319: ["quniverse-fleet-lessons", "1.7.0", [696, 697, 698, 699, 700, 701, 703]],
  100325: ["physical-irrelevance-of-uncountability-computable-reals-suffice-for-continuum-ph", "2.0.0", [774, 776]],
  100338: ["direction-of-epistemic-risk-as-a-criterion-distinguishing-science-from-numerolog", "1.1.1", [847, 848, 849, 850, 851, 852]],
  100353: ["sacred-numbers-as-optima-of-an-ultrametric-divisibility-landscape", "1.0.0", [940]],
};
let all = 0;
for (const [iss, [slug, ver, ids]] of Object.entries(papers)) for (const id of ids) { d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability, issue_id, status_note) VALUES (?, ?, ?, 'claim', 'derived', 'direct', ?, 'PL-TRIAGE-1 apply (one model)')").run(id, slug, ver, Number(iss)); all++; }
ok(all === 21, "the fixture holds the 21 learnings", all);
d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability) VALUES (9001, 'quniverse-fleet-lessons', '1.6.0', 'x', 'derived', 'direct')").run();
d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability) VALUES (9002, 'quniverse-fleet-lessons', '1.7.0', 'x', 'derived', 'analogy')").run();
d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, kind, applicability, fleet_status, status_note) VALUES (9003, 'quniverse-fleet-lessons', '1.7.0', 'x', 'derived', 'direct', 'applied', 'by hand')").run();
d.prepare("INSERT INTO agent_issues (id, title, status, description) VALUES (1000043, 'cf_analytics under-reports', 'open', 'original text')").run();
// a healthy fleet for the new catalogue probes
d.prepare("INSERT INTO ops_config (key, value) VALUES ('research_ready_cap', '192')").run();
d.prepare("INSERT INTO cloud_ops_events (id, ts, kind, job) VALUES ('bp1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'research-backpressure', 'qnfo-fleet-control')").run();
for (const m of ["remedy_efficacy_30d", "fix_hold_rate_30d", "prediction_logged_share_7d"]) d.prepare("INSERT INTO metric_registry (metric, last_refreshed, last_value) VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), '1')").run(m);
d.prepare("INSERT INTO decision_log (actor, outcome_matched) VALUES ('x', 1)").run();
const snapshot = () => JSON.stringify(d.prepare("SELECT id, fleet_status, status_note FROM paper_learnings ORDER BY id").all());
d.exec(sql);
const decisions = d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'PAPER-LEARN-SESSION-TRIAGE-1:%'").get().n;
const row = (id) => d.prepare("SELECT * FROM paper_learnings WHERE id = ?").get(id);

const want = {
  "already-in-place": [646, 696, 847],
  routed: [698, 699],
  rejected: [644, 645, 647, 650, 697, 700, 701, 703, 774, 776, 848, 849, 850, 851, 852, 940],
};
let n = 0;
for (const [st, ids] of Object.entries(want)) for (const id of ids) {
  n++;
  const r = row(id);
  ok(r.fleet_status === st && /^PL-TRIAGE-1 /.test(r.status_note) && r.status_note.includes("session-old-issues-6d-2038") && r.status_note.length <= 700 && r.status_note.length > 120, "learning " + id + " is " + st + " with a PL-TRIAGE-1 note", r);
  if (st === "rejected") ok(/^PL-TRIAGE-1 rejected \([^)]*; [^)]+\): /.test(r.status_note), "learning " + id + " names the rejection category and its reason");
  if (st === "routed") ok(/routed to issue (1000459|1000043)/.test(r.status_note), "learning " + id + " names the successor issue", r.status_note);
  if (st === "already-in-place") ok(/ - /.test(r.status_note) && /probe ok 2026-10-26/.test(r.status_note), "learning " + id + " cites its mechanism and a probe that read ok", r.status_note);
}
ok(n === 21, "all 21 learnings have a disposition", n);
// the closing probe of each issue (PAPER-LEARN-1 writes exactly this form)
for (const [iss, [slug, ver]] of Object.entries(papers)) {
  const c = d.prepare("SELECT COUNT(*) AS n FROM paper_learnings WHERE slug = ? AND version = ? AND applicability = 'direct' AND fleet_status = 'proposed'").get(slug, ver).n;
  ok(c === 0, "issue " + iss + ": no direct learning of the paper and version is still proposed", c);
}
ok(row(9001).fleet_status === "proposed" && row(9002).fleet_status === "proposed", "another version and an analogy-only learning are left to the hourly triage");
ok(row(9003).fleet_status === "applied" && row(9003).status_note === "by hand", "a row someone else settled is untouched");
ok(/retry/i.test(row(644).status_note) && /24 of 89/.test(row(644).status_note) && /4 of 40/.test(row(644).status_note), "learning 644 carries the measured retry numbers");
ok(/299\.84/.test(row(650).status_note) && /299\.84/.test(row(700).status_note), "learnings 650 and 700 carry the measured spend");
ok(/531 of 706/.test(row(776).status_note) && /438 of 706/.test(row(940).status_note), "learnings 776 and 940 carry the measured prevalence");

// catalogue
const mechs = d.prepare("SELECT * FROM paper_learning_mechanisms ORDER BY mech_key").all();
ok(mechs.map((m) => m.mech_key).join() === "forward-outcome-scoring,remedy-efficacy,research-backpressure" && mechs.every((m) => m.status === "active"), "three active mechanisms", mechs.map((m) => m.mech_key));
for (const m of mechs) {
  ok(/^SELECT /.test(m.evidence_probe) && !m.evidence_probe.includes(";") && !/(insert|update|delete|drop)\s/i.test(m.evidence_probe), "probe of " + m.mech_key + " is one read-only SELECT");
  ok(d.prepare(m.evidence_probe).get().observed === "ok", "probe of " + m.mech_key + " reads ok on a healthy fleet", d.prepare(m.evidence_probe).get());
  ok(m.citation.length > 60, "citation of " + m.mech_key);
}
ok(mechs.filter((m) => m.terms !== "").map((m) => m.mech_key).join() === "research-backpressure" && mechs.find((m) => m.mech_key === "research-backpressure").terms === "research_ready_cap|ready queue cap", "only one narrow auto-match term set is added");
const probe = (k) => d.prepare(d.prepare("SELECT evidence_probe FROM paper_learning_mechanisms WHERE mech_key = ?").get(k).evidence_probe).get().observed;
d.exec("DELETE FROM cloud_ops_events");
ok(probe("research-backpressure") === "absent", "research-backpressure reads absent without a recent tick event");
d.exec("DELETE FROM ops_config");
ok(probe("research-backpressure") === "absent", "research-backpressure reads absent without research_ready_cap");
d.exec("UPDATE metric_registry SET last_refreshed = '2026-01-01T00:00:00Z' WHERE metric = 'remedy_efficacy_30d'");
ok(probe("remedy-efficacy") === "absent", "remedy-efficacy reads absent when the metric is stale");
d.exec("DELETE FROM decision_log");
ok(probe("forward-outcome-scoring") === "absent", "forward-outcome-scoring reads absent without a matched outcome");

// the appended note and the decision
const desc = d.prepare("SELECT description FROM agent_issues WHERE id = 1000043").get().description;
ok(desc.startsWith("original text") && desc.split("PAPER-LEARN-1 learning 699").length === 2 && /paper's cents-as-dollars/.test(desc), "issue 1000043 keeps its text and gains the note once", desc);
ok(decisions === 1, "one decision is logged", decisions);

// idempotence and rollback
const before = snapshot(), descBefore = desc;
d.exec(sql);
ok(snapshot() === before && d.prepare("SELECT description FROM agent_issues WHERE id = 1000043").get().description === descBefore && d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'PAPER-LEARN-SESSION-TRIAGE-1:%'").get().n === 1, "a second apply changes nothing and logs one decision");
d.exec(rollback);
ok([644, 646, 698, 699, 940].every((id) => row(id).fleet_status === "proposed" && row(id).status_note === "PL-TRIAGE-1 apply (one model)"), "Rollback returns the learnings to proposed with their earlier note");
ok(d.prepare("SELECT COUNT(*) AS n FROM paper_learning_mechanisms").get().n === 0, "Rollback removes the three mechanisms");
ok(row(9003).status_note === "by hand", "Rollback leaves the row someone else settled");
console.log("paper-learn-session-triage: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
