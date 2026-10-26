// CONTENT-PIPELINE-SLA-1 offline suite: replays migrations/2026-10-26-content-pipeline-sla-attribution.sql on SQLite against the live
// definition of v_content_pipeline (read from the migration that defined it, equal to qnfo-audit by length on 2026-10-26) and fixtures
// shaped like the rows read live that day.
// Proves: (1) the six finished paper_revision_log statuses leave the SLA (done or rejected) while loop-revision-queued, thin-prior-work-queued and
// flagged still wait; (2) an internal_errata row with an errata_queue mirror carries no SLA, one without a mirror still does, and the queue rows
// (internal-open, detected, an email row) keep theirs; (3) the view keeps its columns in order and the mirror lookup uses idx_errata_queue_subject;
// (4) the unstarted errata remediation rows of one paper merge into the oldest queued one: every sibling text is a marked line of the survivor, the
// sibling is wontfix with the survivor id, nothing else is touched (a started row, a completeness row, a lone row, a paper with one eligible row);
// (5) a survivor claimed between the lines of the file keeps its siblings queued (no text is lost); (6) a second run changes nothing;
// (7) the two detectors read non-zero on the old state and 0 on the new, and are read-only; (8) the issues, the decision and the notes are written once
// and the code anchors the issues name occur exactly once in their files.
// Run: node migrations/content-pipeline-sla-attribution.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(here("2026-10-26-content-pipeline-sla-attribution.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

function viewDdl(file, name) {
  const t = readFileSync(here(file), "utf8");
  const at = t.search(new RegExp("^CREATE VIEW (?:IF NOT EXISTS )?" + name + "\\s+AS", "m"));
  if (at < 0) throw new Error(name + " not found in " + file);
  let q = false, i = at;
  for (; i < t.length; i++) { const c = t[i]; if (c === "'") q = !q; else if (c === ";" && !q) break; }
  return t.slice(at, i).replace(/CREATE VIEW IF NOT EXISTS/, "CREATE VIEW");
}
// quote-aware split of the migration into statements (comment lines dropped)
function statements(text) {
  const body = text.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
  const out = []; let cur = "", q = false;
  for (const c of body) { if (c === "'") q = !q; if (c === ";" && !q) { if (cur.trim()) out.push(cur.trim()); cur = ""; } else cur += c; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const STMTS = statements(sql);
const OLD_VIEW = viewDdl("2026-10-14-03-content-pipeline.sql", "v_content_pipeline");
const ago = (min) => new Date(Date.now() - min * 6e4).toISOString().replace(/\.\d+Z$/, "Z");

function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT DEFAULT 'queued',
  claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, attempt INTEGER DEFAULT 0, error TEXT, published_at TEXT, UNIQUE(source, source_id));
CREATE TABLE research_ready (id TEXT PRIMARY KEY, ready_at TEXT NOT NULL);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, idea TEXT, status TEXT, triaged_at TEXT, created_at TEXT);
CREATE TABLE version_queue (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, status TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, status TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE errata_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER UNIQUE, source TEXT NOT NULL DEFAULT 'inbound-email', sender TEXT, subject TEXT, paper_doi TEXT, claim TEXT, confidence REAL, status TEXT DEFAULT 'detected', created_at TEXT, updated_at TEXT);
CREATE TABLE internal_errata (id TEXT PRIMARY KEY, claim_text TEXT, target_ref TEXT, status TEXT DEFAULT 'open', detected_at TEXT, updated_at TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, status TEXT, posted_at TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE dissemination_tracker (id INTEGER PRIMARY KEY, channel TEXT, paper_title TEXT, paper_slug TEXT, action TEXT, posted_at TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE content_stage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, flow TEXT, item_id TEXT, from_status TEXT, to_status TEXT, ts TEXT);
CREATE TABLE content_stages (stage TEXT PRIMARY KEY, sla_min INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, ts TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, attempts INTEGER, last_verdict TEXT, deferred_since TEXT, next_due_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TRIGGER agent_issues_birth AFTER INSERT ON agent_issues BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
INSERT INTO content_stages (stage, sla_min) VALUES ('queued', 120), ('revise', 120), ('correct', 120), ('published', NULL), ('rejected', NULL), ('review', 120), ('research', 120), ('draft', 120);
INSERT INTO metric_registry VALUES ('content_items_over_stage_sla', 'v_content_pipeline rows past their SLA');
INSERT INTO agent_issues (id, title, description, status) VALUES (1000293, 'ERRATA-ROUTE-PER-PAPER-1: route high-risk errata as one remediation row per paper', 'original text', 'open');
`);
  db.exec(OLD_VIEW);
  const old = ago(600);
  const rev = db.prepare("INSERT INTO paper_revision_log (slug, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
  for (const s of ["claim-corrected", "claim-retracted", "claim-withdrawn", "integrity-restored", "thin-prior-work-rejected", "thin-prior-work-skipped", "loop-revision-queued", "thin-prior-work-queued", "flagged", "published"]) rev.run("p-" + s, "t", s, old, old);
  const ie = db.prepare("INSERT INTO internal_errata (id, claim_text, target_ref, status, detected_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)");
  ie.run("ie-a", "claim a", "paper-a", old, old); ie.run("ie-b", "claim b", "paper-b", old, old); ie.run("ie-c", "claim c, no queue row", "paper-c", old, old);
  const eq = db.prepare("INSERT INTO errata_queue (email_id, source, subject, claim, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  eq.run(null, "internal_audit", "ie-a", "claim a", "internal-open", old, old); eq.run(null, "internal_audit", "ie-b", "claim b", "detected", old, old); eq.run(5, "inbound-email", "hello", "an email erratum", "detected", old, old);
  // research_queue: errata remediation rows
  const rq = db.prepare("INSERT INTO research_queue (id, source, source_id, idea, score, status, paper_slug, created_at, stage, attempt, claimed_at) VALUES (?, ?, ?, ?, 0.95, ?, ?, ?, ?, ?, ?)");
  const idea = (slug, n, claim) => "Correct the published paper '" + slug + "' for erratum pl-" + slug + "-" + n + ": " + claim;
  rq.run("a1", "remediation", "errata:1", idea("A", 1, "claim A1"), "queued", "A", "2026-10-18T09:30:00Z", "ground", 0, null);
  rq.run("a2", "remediation", "errata:2", idea("A", 2, "claim A2"), "deferred", "A", "2026-10-19T09:30:00Z", "ground", 0, null);
  rq.run("a3", "remediation", "errata:3", idea("A", 3, "claim A3"), "queued", "A", "2026-10-20T09:30:00Z", null, 0, null);
  rq.run("a-comp", "remediation", "completeness:zz", "completeness rewrite of A", "queued", "A", "2026-10-17T09:30:00Z", "ground", 0, null);
  rq.run("b1", "remediation", "errata:4", idea("B", 1, "claim B1"), "queued", "B", "2026-10-18T10:30:00Z", "ground", 0, null);
  rq.run("c1", "remediation", "errata:5", idea("C", 1, "claim C1"), "queued", "C", "2026-10-18T11:30:00Z", "revise", 0, null);
  rq.run("c2", "remediation", "errata:6", idea("C", 2, "claim C2"), "queued", "C", "2026-10-19T11:30:00Z", "ground", 0, null);
  rq.run("d1", "remediation", "errata:7", idea("D", 1, "claim D1"), "queued", "D", "2026-10-18T12:30:00Z", "ground", 1, "2026-10-26T01:00:00Z");
  rq.run("d2", "remediation", "errata:8", idea("D", 2, "claim D2"), "queued", "D", "2026-10-19T12:30:00Z", "ground", 0, null);
  rq.run("d3", "remediation", "errata:9", idea("D", 3, "claim D3"), "deferred", "D", "2026-10-20T12:30:00Z", "ground", 0, null);
  rq.run("e1", "remediation", "errata:10", idea("E", 1, "claim E1"), "deferred", "E", "2026-10-17T13:30:00Z", "ground", 0, null);
  rq.run("e2", "remediation", "errata:11", idea("E", 2, "claim E2"), "queued", "E", "2026-10-21T13:30:00Z", "ground", 0, null);
  return db;
}
const one = (db, q, ...a) => db.prepare(q).get(...a);
const all = (db, q, ...a) => db.prepare(q).all(...a);
const run = (db, from = 0, to = STMTS.length) => { for (const s of STMTS.slice(from, to)) db.exec(s); };
const overRows = (db, where) => all(db, "SELECT flow, item_id, raw_status, stage, state FROM v_content_pipeline WHERE over_sla = 1 AND " + where + " ORDER BY flow, item_id");
const cols = (db) => all(db, "PRAGMA table_info(v_content_pipeline)").map((c) => c.name).join(",");
const FINISHED = "('claim-corrected','claim-retracted','claim-withdrawn','integrity-restored','thin-prior-work-rejected','thin-prior-work-skipped')";

// ---- base: the old view, before the file
const base = build();
const baseCols = cols(base);
ok(overRows(base, "flow = 'revision' AND raw_status IN " + FINISHED).length === 6, "base: the six finished revision statuses count as stuck", overRows(base, "flow = 'revision'"));
ok(overRows(base, "flow = 'internal-errata'").length === 3, "base: ie-a, ie-b and ie-c all count (the double count)", overRows(base, "flow = 'internal-errata'"));

// ---- migrated
const db = build();
run(db);
ok(cols(db) === baseCols, "the view keeps its columns in order", { base: baseCols, now: cols(db) });
ok(overRows(db, "flow = 'revision' AND raw_status IN " + FINISHED).length === 0, "migrated: no finished revision status is over SLA", overRows(db, "flow = 'revision'"));
const st = (s) => one(db, "SELECT stage, state FROM v_content_pipeline WHERE flow = 'revision' AND raw_status = ?", s);
ok(st("claim-corrected").stage === "published" && st("claim-corrected").state === "done" && st("integrity-restored").state === "done", "claim-corrected and integrity-restored are published and done", [st("claim-corrected"), st("integrity-restored")]);
ok(["claim-retracted", "claim-withdrawn", "thin-prior-work-rejected", "thin-prior-work-skipped"].every((s) => st(s).stage === "rejected" && st(s).state === "rejected"), "the other four are rejected and rejected");
const waiting = overRows(db, "flow = 'revision'").map((r) => r.raw_status).sort();
ok(JSON.stringify(waiting) === JSON.stringify(["flagged", "loop-revision-queued", "thin-prior-work-queued"]), "loop-revision-queued, thin-prior-work-queued and flagged still wait past the SLA", waiting);
ok(overRows(db, "flow = 'internal-errata'").map((r) => r.item_id).join() === "ie-c", "migrated: only the internal_errata row without a queue row keeps an SLA", overRows(db, "flow = 'internal-errata'"));
ok(one(db, "SELECT state FROM v_content_pipeline WHERE flow = 'internal-errata' AND item_id = 'ie-a'").state === "waiting", "a mirrored internal_errata row stays listed as waiting");
ok(overRows(db, "flow = 'errata'").length === 3, "the three queue rows (internal-open, detected, email) keep their SLA", overRows(db, "flow = 'errata'"));
const plan = all(db, "EXPLAIN QUERY PLAN SELECT 1 FROM errata_queue m WHERE m.subject = 'x' AND +m.email_id IS NULL").map((r) => r.detail).join(" ");
ok(/idx_errata_queue_subject/.test(plan), "the mirror lookup uses idx_errata_queue_subject", plan);

// ---- the merge
const q = (id) => one(db, "SELECT id, status, stage, idea, error, attempt, claimed_at FROM research_queue WHERE id = ?", id);
ok(q("a1").status === "queued" && q("a1").idea.includes("[ERRATA-ROUTE-PER-PAPER-1 merged errata:2] erratum pl-A-2: claim A2") && q("a1").idea.includes("[ERRATA-ROUTE-PER-PAPER-1 merged errata:3] erratum pl-A-3: claim A3"), "paper A: the oldest queued row survives and carries both siblings' text", q("a1").idea);
ok(q("a1").idea.startsWith("Correct the published paper 'A' for erratum pl-A-1: claim A1"), "the survivor keeps its own first line");
ok(["a2", "a3"].every((id) => q(id).status === "wontfix" && /merged into a1/.test(q(id).error)), "paper A: the siblings are wontfix with the survivor id", [q("a2"), q("a3")]);
ok(q("a-comp").status === "queued" && q("a-comp").idea === "completeness rewrite of A" && q("a-comp").error === null, "a completeness row of the same paper is not touched");
ok(q("b1").status === "queued" && !q("b1").idea.includes("merged"), "a paper with one row is not touched");
ok(q("c1").status === "queued" && q("c2").status === "queued" && !q("c2").idea.includes("merged"), "paper C: a started row (stage revise) and one eligible row: nothing to merge");
ok(q("d1").status === "queued" && q("d1").attempt === 1 && q("d1").idea === "Correct the published paper 'D' for erratum pl-D-1: claim D1", "a claimed row is never edited or retired");
ok(q("d2").idea.includes("merged errata:9") && !q("d2").idea.includes("errata:7") && q("d3").status === "wontfix" && /merged into d2/.test(q("d3").error), "paper D: d2 survives (d1 is started), d3 merges into it");
ok(q("e2").status === "queued" && q("e2").idea.includes("[ERRATA-ROUTE-PER-PAPER-1 merged errata:10] erratum pl-E-1: claim E1") && q("e1").status === "wontfix", "paper E: a queued row survives over an older deferred one");
ok(one(db, "SELECT COUNT(*) n FROM errata_remediation_merges").n === 4, "four siblings are recorded (a2, a3, d3, e1)", all(db, "SELECT * FROM errata_remediation_merges"));
ok(one(db, "SELECT COUNT(*) n FROM bak_20261026_errata_remediation_merge").n === 11, "the backup holds the 11 errata rows that were queued or deferred");
ok(one(db, "SELECT COUNT(*) n FROM bak_20261026_content_pipeline_view").n === 1 && /CASE WHEN r.status IN \('already-revised', 'published'\)/.test(one(db, "SELECT sql FROM bak_20261026_content_pipeline_view").sql), "the backup holds the view as it was");
const dupProbe = (d) => d.prepare(one(d, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-errata-remediation-duplicate'").p).get();
ok(dupProbe(db).observed === "0", "the duplicate detector reads 0 after the merge", dupProbe(db));

// ---- idempotence
const snap = () => JSON.stringify([all(db, "SELECT id, status, idea, error FROM research_queue ORDER BY id"), all(db, "SELECT * FROM errata_remediation_merges ORDER BY sibling_id").map((r) => [r.sibling_id, r.survivor_id]),
  one(db, "SELECT COUNT(*) n FROM failure_modes").n, one(db, "SELECT COUNT(*) n FROM remediation_contracts").n, one(db, "SELECT COUNT(*) n FROM decision_log").n, one(db, "SELECT COUNT(*) n FROM agent_issues").n,
  one(db, "SELECT description FROM agent_issues WHERE id = 1000293").description, one(db, "SELECT formula FROM metric_registry").formula]);
const first = snap();
run(db);
ok(snap() === first, "a second run changes nothing");

// ---- a survivor claimed between the lines of the file keeps its siblings
{
  const d = build();
  const cut = STMTS.findIndex((s) => /^INSERT OR IGNORE INTO errata_remediation_merges/.test(s));
  run(d, 0, cut + 1);
  d.exec("UPDATE research_queue SET status = 'researching', claimed_at = '2026-10-26T20:00:00Z', attempt = 1 WHERE id = 'a1'");
  run(d, cut + 1);
  const r = (id) => one(d, "SELECT status, idea FROM research_queue WHERE id = ?", id);
  ok(r("a1").status === "researching" && !r("a1").idea.includes("merged"), "a survivor claimed before its edit is left as the pipeline read it");
  ok(r("a2").status === "deferred" && r("a3").status === "queued", "its siblings stay in the queue (no erratum text is lost)", [r("a2"), r("a3")]);
  ok(r("d3").status === "wontfix", "other papers are merged as usual");
}

// ---- detectors
{
  const probe = (d, cls) => d.prepare(one(d, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls).p).get();
  const b = build(); run(b, 0, STMTS.findIndex((s) => /^CREATE INDEX/.test(s))); // backups only: old view, no merge
  // install the contracts on the old state by replaying only the contract statements
  for (const s of STMTS.filter((s) => /^INSERT OR REPLACE INTO remediation_contracts/.test(s))) b.exec(s);
  ok(probe(b, "fm-content-sla-misattributed").observed === "8", "SLA detector on the old state: 6 finished rows + the 2 mirrored internal_errata rows read 8", probe(b, "fm-content-sla-misattributed"));
  ok(Number(probe(b, "fm-errata-remediation-duplicate").observed) === 3, "duplicate detector on the old state: papers A, D and E have two or more unstarted rows", probe(b, "fm-errata-remediation-duplicate"));
  ok(probe(db, "fm-content-sla-misattributed").observed === "0" && probe(db, "fm-errata-remediation-duplicate").observed === "0", "both detectors read 0 on the new state");
  const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
  for (const cls of ["fm-content-sla-misattributed", "fm-errata-remediation-duplicate"]) {
    const p = one(db, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls).p.toLowerCase();
    ok(p.startsWith("select ") && WRITE_KW.every((k) => !p.includes(k)), cls + " is read-only", p);
  }
}

// ---- issues, notes, decision
const issues = all(db, "SELECT id, title, description FROM agent_issues WHERE id <> 1000293 ORDER BY id");
ok(issues.length === 2 && /^RB-ERRATA-SHARE-1:/.test(issues[0].title) && /^CLAIM-ERRATA-SHARE-1:/.test(issues[1].title), "two issues are filed once", issues.map((i) => i.title));
const count = (hay, needle) => hay.split(needle).length - 1;
const fleet = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8"), exec = readFileSync(here("../qnfo-research-exec/worker.js"), "utf8");
for (const [i, file, text] of [[issues[0], fleet, fleet], [issues[1], exec, exec]]) {
  const m = /code-anchor: (.*)\n/.exec(i.description + "\n");
  ok(m && count(text, m[1]) === 1, "the code anchor of " + i.title.split(":")[0] + " occurs exactly once in its file", m && m[1]);
  ok(/code-task: repo=qnfo-workers path=qnfo-(fleet-control|research-exec)\/worker\.js/.test(i.description) && /code-probe: \{"paths": \[".*"\], "contains": "(RB|CLAIM)-ERRATA-SHARE-1"\}/.test(i.description), i.title.split(":")[0] + " carries its code-task and code-probe lines");
  ok(one(db, "SELECT verify_transport t FROM remediation_contracts WHERE class = ?", "issue-" + i.id).t === "d1-query", i.title.split(":")[0] + " closes on a d1 probe");
  ok(one(db, "SELECT status s, module m, next_due_at n FROM remediation_contracts WHERE class = ?", "issue-" + i.id).s === "active" && one(db, "SELECT module m FROM remediation_contracts WHERE class = ?", "issue-" + i.id).m === "content-pipeline-sla-1", i.title.split(":")[0] + " contract is active and due");
}
const rbProbe = db.prepare(one(db, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", "issue-" + issues[0].id).p).get();
ok(rbProbe.observed === "0", "the RB probe reads 0 on the fixture (no deferred proposal)", rbProbe);
db.exec("INSERT INTO research_queue (id, source, source_id, status, created_at) VALUES ('pp1', 'proposal', '9', 'deferred', '2026-10-20T00:00:00Z')");
ok(db.prepare(one(db, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", "issue-" + issues[0].id).p).get().observed === "1", "the RB probe reads 1 when proposals are deferred and errata rows hold more than half of the queued rows");
ok(/CONTENT-PIPELINE-SLA-1/.test(one(db, "SELECT formula f FROM metric_registry").f), "the metric formula says what changed");
ok(/SESSION-RESEARCH-ERRATA 2026-10-26/.test(one(db, "SELECT description d FROM agent_issues WHERE id = 1000293").d) && one(db, "SELECT description d FROM agent_issues WHERE id = 1000293").d.startsWith("original text"), "the evidence is appended to 1000293, not substituted");
ok(one(db, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'CONTENT-PIPELINE-SLA-1: %'").n === 1, "one decision_log row");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
