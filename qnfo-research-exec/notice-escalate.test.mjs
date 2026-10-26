// NOTICE-REPAIR-ESCALATE-1 (qnfo-research-exec 0.38.1; agent_issues 1000012 defect A). Offline: node:sqlite as D1, no network.
// Proves: noticeRepairTick lists in out.stale only the owner papers that are still retracted more than 24 hours after their first integrity backup with that backup present (a recent backup, a restored paper and a
// pipeline paper are not listed; a paper the publish floor refused is listed as blocked); noticeRepairEscalate files one agent_issue per such paper (at most 2 a tick, never a second open issue for a slug) that names the
// slug, the hours and the cause and carries a d1-query@living-paper contract, which reads 'still retracted' until the paper is restored; the D1 error of the tick is quoted; an invalid slug and a skipped tick file nothing.
// Run: node --no-warnings qnfo-research-exec/notice-escalate.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noticeRepairTick, noticeRepairEscalate } from "./worker.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
function d1(db) {
  return { prepare(sql) {
    let args = [];
    const o = { bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return o; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; } };
    return o;
  } };
}

ok(/NOTICE-REPAIR-ESCALATE-1/.test(src) && /await noticeRepairEscalate\(env, _nr\)/.test(src), "the marker is on main and the scheduled handler calls the escalation after the repair tick");

const lp = new DatabaseSync(":memory:");
lp.exec(`CREATE TABLE papers (slug TEXT PRIMARY KEY, identifier TEXT, version TEXT, status TEXT, title TEXT, abstract TEXT, body_md TEXT, updated_at TEXT, paper_type TEXT, change_actor TEXT, change_reason TEXT);
CREATE TRIGGER trg_papers_pub_floor_upd3 BEFORE UPDATE ON papers FOR EACH ROW WHEN NEW.status = 'published' AND COALESCE(OLD.status,'') <> 'published' AND LENGTH(TRIM(COALESCE(NEW.body_md,''))) < 20000
BEGIN SELECT RAISE(ABORT, 'PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-3 (update): cannot publish below 20000 chars'); END;`);
const au = new DatabaseSync(":memory:");
au.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE research_queue (id TEXT, source TEXT, status TEXT, paper_slug TEXT);
CREATE TABLE paper_integrity_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, version TEXT, status TEXT, title TEXT, abstract TEXT, body_md TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, doi TEXT, title TEXT, version_from TEXT, version_to TEXT, status TEXT, audit_summary TEXT, changelog TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);`);
const big = (n) => "# T\n\n" + "word ".repeat(n);
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString().replace(/\.\d+Z$/, "Z");
const addPaper = (slug, ident, backupHoursAgo, words) => {
  lp.prepare("INSERT INTO papers (slug, identifier, version, status, title, body_md) VALUES (?, ?, '1.0.1', 'retracted', ?, 'stub')").run(slug, ident, "Retracted: " + slug);
  au.prepare("INSERT INTO paper_integrity_backups (slug, version, status, title, abstract, body_md, created_at) VALUES (?, '1.0.0', 'published', ?, 'A', ?, ?)").run(slug, "Title " + slug, big(words), ago(backupHoursAgo));
};
addPaper("own-short-a", "own-a", 30, 2400); addPaper("own-short-b", "own-b", 40, 2400); addPaper("own-short-c", "own-c", 55, 2400);
addPaper("own-short-new", "own-n", 2, 2400);         // a backup of 2 hours ago: not stale yet
addPaper("own-long", "own-l", 30, 5000);              // restorable: restored in this tick
addPaper("qnf-pipeline-1", "qnf-123abc", 30, 5000);   // a pipeline paper: in the claim sweep's scope, a retraction stays

const env = { QNFO_AUDIT: d1(au), LIVING_PAPER: d1(lp) };
const nr = await noticeRepairTick(env);
ok(nr.restored.join() === "own-long", "the restorable owner paper is restored and the pipeline paper is left retracted", nr.restored);
const staleSlugs = nr.stale.map((x) => x.slug).sort();
ok(staleSlugs.join() === "own-short-a,own-short-b,own-short-c", "only the three owner papers retracted for more than 24 hours with a backup are listed (not the 2-hour backup, the restored paper or the pipeline paper)", nr.stale);
ok(nr.stale.every((x) => x.blocked === true && x.hours >= 30), "each is reported as refused by the publish floor with its age in hours", nr.stale);
ok(nr.stale.find((x) => x.slug === "own-short-c").hours >= 55, "the age is read from the first backup");

// ---- the escalation
const e1 = await noticeRepairEscalate(env, nr);
ok(e1.filed.length === 2, "at most two issues are filed in one tick", e1);
const issues = () => au.prepare("SELECT * FROM agent_issues ORDER BY id").all();
ok(issues().length === 2 && issues().every((i) => i.title.startsWith("NOTICE-REPAIR-STUCK-1: owner paper ") && i.status === "open" && i.priority === "high" && i.source === "qnfo-research-exec" && /Definition of done/.test(i.description)), "each issue is open, high, titled with its slug and carries a definition of done", issues().map((i) => i.title));
ok(issues().every((i) => /publish floor/.test(i.description) && /retracted for about \d+ hours/.test(i.description)), "and names the floor and how long the paper has been retracted");
const e2 = await noticeRepairEscalate(env, nr);
ok(e2.filed.length === 1 && issues().length === 3, "the next tick files the third, never a second issue for a slug", e2);
const e3 = await noticeRepairEscalate(env, nr);
ok(e3.filed.length === 0 && issues().length === 3, "a further tick files nothing: one open issue per slug");

// ---- the contract
const iss = issues()[0];
const slug = iss.title.match(/owner paper (\S+) is still/)[1];
const c = au.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("issue-" + iss.id);
ok(c && c.issue_id === iss.id && c.verify_transport === "d1-query@living-paper" && c.status === "active" && c.max_attempts === 3 && c.expected_cadence_h === 1, "each issue has an active hourly d1-query@living-paper contract", c);
ok(!/\b(update|insert|delete|drop|alter)\b/i.test(c.verify_probe) && !/agent_issues/.test(c.verify_probe), "the probe is a read of papers and never of the issue itself");
const r1 = lp.prepare(c.verify_probe).get();
ok(r1.expected === "restored" && r1.observed === "still retracted", "while the paper is retracted the probe fails", r1);
lp.prepare("UPDATE papers SET body_md = ?, status = 'published' WHERE slug = ?").run(big(5000), slug);
const r2 = lp.prepare(c.verify_probe).get();
ok(r2.observed === "restored", "and passes once the paper is no longer retracted", r2);

// ---- the cause of a D1 failure is quoted; invalid slugs and a skipped tick file nothing
{
  const before = issues().length;
  const r = await noticeRepairEscalate(env, { stale: [{ slug: "own-d1-failure", hours: 40, blocked: false, error: "D1_ERROR: internal error; reference = e_Gz3hrU_a5d0e3928d1342cdb5a102c1d27a6457" }, { slug: "bad slug'; DROP TABLE x", hours: 40, blocked: false, error: "" }] });
  ok(r.filed.join() === "own-d1-failure" && issues().length === before + 1, "a stale paper whose restore failed is filed and an invalid slug is not", r);
  const d = issues()[issues().length - 1].description;
  ok(/reference = e_Gz3hrU_a5d0e3928d1342cdb5a102c1d27a6457/.test(d) && /the restore failed in the last tick/.test(d), "the D1 error reference of the tick is in the issue text", d.slice(0, 300));
  ok((await noticeRepairEscalate(env, { skipped: true })).filed.length === 0 && (await noticeRepairEscalate(env, null)).filed.length === 0, "a skipped tick and a missing result file nothing");
}
// ---- an old schema without created_at lists nothing and never throws
{
  const au2 = new DatabaseSync(":memory:");
  au2.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE research_queue (id TEXT, source TEXT, status TEXT, paper_slug TEXT);
CREATE TABLE paper_integrity_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, version TEXT, status TEXT, title TEXT, abstract TEXT, body_md TEXT);
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, doi TEXT, title TEXT, version_from TEXT, version_to TEXT, status TEXT, audit_summary TEXT, changelog TEXT, created_at TEXT, updated_at TEXT);`);
  const lp2 = new DatabaseSync(":memory:");
  lp2.exec(`CREATE TABLE papers (slug TEXT PRIMARY KEY, identifier TEXT, version TEXT, status TEXT, title TEXT, abstract TEXT, body_md TEXT, updated_at TEXT, paper_type TEXT, change_actor TEXT, change_reason TEXT);`);
  lp2.prepare("INSERT INTO papers (slug, identifier, version, status, title, body_md) VALUES ('o1', 'own-1', '1.0.1', 'retracted', 'R', 'stub')").run();
  au2.prepare("INSERT INTO paper_integrity_backups (slug, version, status, title, abstract, body_md) VALUES ('o1', '1.0.0', 'published', 'T', 'A', ?)").run(big(5000));
  const r = await noticeRepairTick({ QNFO_AUDIT: d1(au2), LIVING_PAPER: d1(lp2) });
  ok(Array.isArray(r.stale) && r.stale.length === 0 && r.restored.join() === "o1", "a schema without created_at lists nothing stale and the repair still runs", r);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
