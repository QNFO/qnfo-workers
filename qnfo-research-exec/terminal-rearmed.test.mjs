// RESEARCH-TERMINAL-REARMED-1 + PARKED-REGROUND-1 + NOTICE-REPAIR-SKIP-BLOCKED-1 (qnfo-research-exec 0.29.0). Offline: node:sqlite as D1.
// Run: node --no-warnings qnfo-research-exec/terminal-rearmed.test.mjs
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { markError, parkedRegroundTick, parkRearmTick, noticeRepairTick } from "./worker.js";

function d1(db) {
  return { prepare(sql) {
    let args = [];
    const o = { bind(...a) { args = a; return o; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; } };
    return o;
  } };
}

// ---- terminal contract, resolution by re-arm, dedupe against open issues only -------------------------------------------------------
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT DEFAULT 'queued', stage TEXT, claimed_at TEXT, attempt INTEGER DEFAULT 0, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, context TEXT, created_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), next_due_at TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0);`);
db.prepare("INSERT INTO ops_config (key, value) VALUES ('research_recover_max','3')").run();
const env = { QNFO_AUDIT: d1(db) };
const get = (id) => db.prepare("SELECT * FROM research_queue WHERE id=?").get(id);
const moving = () => db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 'done', '{\"stage\":\"ground->ensemble\"}', 'qnfo-research-exec', 'ok')").run("ev" + Math.random());

const NE = "11111111-0000-4000-8000-000000000001"; // revise: no applicable edit (may be a pipeline fault)
db.prepare("INSERT INTO research_queue (id,status,stage,recover_count) VALUES (?, 'researching','revise',3)").run(NE);
await markError(env, get(NE), "revise: no applicable edit for 1 HARD fixes (H3) from two models, strict retry included (not advanced unrevised)");
let c = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'research-terminal-11111111'").get();
let iss = db.prepare("SELECT * FROM agent_issues WHERE title LIKE 'RESEARCH-TERMINAL 11111111%'").get();
assert.ok(c && iss && c.issue_id === iss.id && c.status === "active", "every terminal reason gets a contract on its issue");
assert.ok(/^select /i.test(c.verify_probe) && !c.verify_probe.includes(";") && !/LIKE '[^']{50,}'/.test(c.verify_probe), "the probe is one SELECT, no LIKE literal near D1's 50 byte limit");
assert.ok(!/agent_issues/.test(c.verify_probe), "the probe never reads the issue's own status");
moving();
assert.equal(db.prepare(c.verify_probe).get().observed, "pending", "parked with recoveries left: pending, even though the queue moves");
// the sweep returns the row to the pipeline: resolved
db.prepare("UPDATE research_queue SET status='deferred', stage='ground', terminal_rearms=1 WHERE id=?").run(NE);
let pr = db.prepare(c.verify_probe).get();
assert.equal(pr.observed, pr.expected, "a row that left the terminal state resolves its issue");
// it parks again with its recoveries still left: pending again (the closed issue's contract keeps watching)
db.prepare("UPDATE research_queue SET status='wontfix', stage='parked' WHERE id=?").run(NE);
assert.equal(db.prepare(c.verify_probe).get().observed, "pending");
// every recovery spent and the queue moving: resolved with the row kept as evidence
db.prepare("UPDATE research_queue SET terminal_rearms=2 WHERE id=?").run(NE);
pr = db.prepare(c.verify_probe).get();
assert.equal(pr.observed, pr.expected, "recoveries spent: the gate withholds the paper, the issue closes on the parked row");
assert.equal(get(NE).status, "wontfix", "the row keeps its reason");
// published also resolves
db.prepare("UPDATE research_queue SET status='published', stage='done', terminal_rearms=1 WHERE id=?").run(NE);
assert.equal(db.prepare(c.verify_probe).get().observed, "resolved");

// The issue closed; the row goes terminal again: a new open issue is filed and the contract is re-pointed at it (dedupe is against open issues only).
db.prepare("UPDATE agent_issues SET status='closed' WHERE id=?").run(iss.id);
db.prepare("UPDATE remediation_contracts SET status='closed', last_verdict='pass', attempts=2 WHERE class='research-terminal-11111111'").run();
db.prepare("UPDATE research_queue SET status='researching', stage='revise', recover_count=3, terminal_rearms=0 WHERE id=?").run(NE);
await markError(env, get(NE), "revise: no applicable edit for 2 HARD fixes (H1,H2) from two models, strict retry included (not advanced unrevised)");
const open = db.prepare("SELECT * FROM agent_issues WHERE title LIKE 'RESEARCH-TERMINAL 11111111%' AND status='open'").all();
assert.equal(open.length, 1, "a row that went terminal after its issue closed files a new open issue");
c = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'research-terminal-11111111'").get();
assert.equal(c.issue_id, open[0].id, "the contract class is re-pointed at the new issue");
assert.equal(c.status, "active"); assert.equal(c.last_verdict, null); assert.equal(c.attempts, 0);
await markError(env, get(NE), "revise: no applicable edit for 2 HARD fixes (H1,H2) from two models, strict retry included (not advanced unrevised)");
assert.equal(db.prepare("SELECT count(*) n FROM agent_issues WHERE title LIKE 'RESEARCH-TERMINAL 11111111%' AND status='open'").get().n, 1, "an open issue is not filed twice");

// ---- PARKED-REGROUND-1 -----------------------------------------------------------------------------------------------------------------
const r = new DatabaseSync(":memory:");
r.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, claimed_at TEXT, attempt INTEGER DEFAULT 0, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0, context TEXT, created_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);`);
const park = (id, err, rearms, created, st = "wontfix", stage = "parked") => r.prepare("INSERT INTO research_queue (id,status,stage,error,terminal_rearms,recover_count,context,created_at) VALUES (?,?,?,?,?,6,'{\"cycles\":6}',?)").run(id, st, stage, err, rearms, created);
park("aaaaaaaa-1", "PARKED-POISON-1: x; last error: revise: no applicable edit for 5 HARD fixes", 0, "2026-10-01");
park("bbbbbbbb-2", "REVIEW-UNRESOLVED-PARK-1: prior stage revise; revise: no applicable edit for 6 HARD fixes", 1, "2026-10-02");
park("cccccccc-3", "PARKED-POISON-1: x; last error: verify: mismatch=true gates=gate-length", 0, "2026-09-01"); // oldest but no open issue
park("dddddddd-4", "PARKED-POISON-1: x; last error: revise: no applicable edit for 1 HARD fixes", 2, "2026-08-01"); // recoveries spent
park("rem-eeee-5", "PARKED-POISON-1: x; last error: revise: no applicable edit", 0, "2026-07-01"); // a remediation row is the sweep's own
park("ffffffff-6", "PARKED-POISON-1: stale researching claim with recover_count exhausted (6); not re-armed", 0, "2026-07-02"); // not a content failure
park("gggggggg-7", "revise: no applicable edit", 0, "2026-07-03", "queued", "ground"); // not parked
r.prepare("INSERT INTO agent_issues (id,title,status) VALUES (1,'RESEARCH-TERMINAL bbbbbbbb: revise: no applicable edit','open'),(2,'RESEARCH-TERMINAL aaaaaaaa: x','open')").run();
const renv = { QNFO_AUDIT: d1(r) };
const g1 = await parkedRegroundTick(renv);
assert.equal(g1.regrounded, 2, "two rows a run");
const ids = (st) => r.prepare("SELECT id FROM research_queue WHERE status = ? ORDER BY id").all(st).map((x) => x.id);
assert.deepEqual(ids("queued"), ["aaaaaaaa-1", "bbbbbbbb-2", "gggggggg-7"], "rows with an open RESEARCH-TERMINAL issue go first, oldest first among the rest");
const a1 = r.prepare("SELECT * FROM research_queue WHERE id='aaaaaaaa-1'").get();
assert.equal(a1.stage, "ground"); assert.equal(a1.terminal_rearms, 1); assert.equal(a1.recover_count, 0); assert.equal(a1.context, "{}"); assert.equal(a1.claimed_at, null);
assert.match(a1.error, /^PARKED-REGROUND-1: fresh draft from ground\. Was: PARKED-POISON-1/);
assert.equal(r.prepare("SELECT terminal_rearms n FROM research_queue WHERE id='bbbbbbbb-2'").get().n, 2, "a row that had one recovery gets its second and last");
const g2 = await parkedRegroundTick(renv);
assert.equal(g2.regrounded, 1, "the next run takes the oldest remaining candidate only");
assert.equal(r.prepare("SELECT status FROM research_queue WHERE id='cccccccc-3'").get().status, "queued");
const g3 = await parkedRegroundTick(renv);
assert.equal(g3.regrounded, 0, "spent rows, remediation rows and non-content parks are never returned");
for (const id of ["dddddddd-4", "rem-eeee-5", "ffffffff-6"]) assert.equal(r.prepare("SELECT status FROM research_queue WHERE id=?").get(id).status, "wontfix", id + " untouched");
// park_rearm = off stops it with the other sweeps
r.prepare("UPDATE research_queue SET status='wontfix', stage='parked', terminal_rearms=0 WHERE id='aaaaaaaa-1'").run();
r.prepare("INSERT INTO ops_config (key, value) VALUES ('park_rearm','off')").run();
const off = await parkRearmTick(renv);
assert.equal(off.enabled, false); assert.equal(r.prepare("SELECT status FROM research_queue WHERE id='aaaaaaaa-1'").get().status, "wontfix");
r.prepare("DELETE FROM ops_config").run();
r.exec("CREATE TABLE bak_20261019_research_parked (id TEXT)");
const on = await parkRearmTick(renv);
assert.equal(on.enabled, true); assert.equal(on.reground.regrounded, 1, "the hourly park sweep runs the re-ground");

// ---- NOTICE-REPAIR-SKIP-BLOCKED-1 ------------------------------------------------------------------------------------------------------
const lp = new DatabaseSync(":memory:");
lp.exec(`CREATE TABLE papers (slug TEXT PRIMARY KEY, identifier TEXT, version TEXT, status TEXT, title TEXT, abstract TEXT, body_md TEXT, updated_at TEXT, paper_type TEXT);
CREATE TRIGGER trg_papers_pub_floor_upd3 BEFORE UPDATE ON papers FOR EACH ROW WHEN NEW.status = 'published' AND ((COALESCE(OLD.status,'') <> 'published' AND (LENGTH(TRIM(COALESCE(NEW.body_md,''))) < 20000 OR LOWER(COALESCE(NEW.paper_type,'')) IN ('poster','abstract','slides','section','fragment'))) OR (COALESCE(OLD.status,'') = 'published' AND (LENGTH(TRIM(COALESCE(NEW.body_md,''))) < 8000 OR LENGTH(TRIM(COALESCE(NEW.body_md,'')))*2 < LENGTH(TRIM(COALESCE(OLD.body_md,''))))))
BEGIN SELECT RAISE(ABORT, 'PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-3 (update): cannot publish below 20000 chars'); END;`);
const au = new DatabaseSync(":memory:");
au.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE research_queue (id TEXT, source TEXT, status TEXT, paper_slug TEXT);
CREATE TABLE paper_integrity_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, version TEXT, status TEXT, title TEXT, abstract TEXT, body_md TEXT);
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, doi TEXT, title TEXT, version_from TEXT, version_to TEXT, status TEXT, audit_summary TEXT, changelog TEXT, created_at TEXT, updated_at TEXT);`);
const big = (n) => "# T\n\n" + "word ".repeat(n);
// ten short owner papers the floor refuses (12,000 chars), then three restorable ones (25,000 chars): the old loop never reached the second group
for (let i = 0; i < 10; i++) {
  lp.prepare("INSERT INTO papers (slug,identifier,version,status,title,body_md) VALUES (?,?,?,?,?,?)").run("short-" + i, "own-" + i, "1.0.1", "retracted", "Retracted: s" + i, "stub");
  au.prepare("INSERT INTO paper_integrity_backups (slug,version,status,title,abstract,body_md) VALUES (?,?,?,?,?,?)").run("short-" + i, "1.0.0", "published", "Short " + i, "A", big(2400));
}
for (let i = 0; i < 3; i++) {
  lp.prepare("INSERT INTO papers (slug,identifier,version,status,title,body_md) VALUES (?,?,?,?,?,?)").run("long-" + i, "own-L" + i, "1.0.1", "retracted", "Retracted: l" + i, "stub");
  au.prepare("INSERT INTO paper_integrity_backups (slug,version,status,title,abstract,body_md) VALUES (?,?,?,?,?,?)").run("long-" + i, "1.0.0", "published", "Long " + i, "A", big(5000));
}
const nenv = { QNFO_AUDIT: d1(au), LIVING_PAPER: d1(lp) };
const nr = await noticeRepairTick(nenv);
assert.deepEqual(nr.restored.sort(), ["long-0", "long-1", "long-2"], "restorable papers behind the refused ones are restored in the same tick");
assert.equal(nr.blocked.length, 10, "the floor-refused papers are reported as blocked, not as errors");
assert.equal(nr.error, undefined, "a floor refusal is not an error");
assert.match(nr.blockedNote, /publish floor/);
assert.equal(lp.prepare("SELECT status FROM papers WHERE slug='long-1'").get().status, "published");
assert.equal(lp.prepare("SELECT status FROM papers WHERE slug='short-1'").get().status, "retracted", "the guard is respected: no paper under the floor is republished");
const nr2 = await noticeRepairTick(nenv);
assert.equal(nr2.restored.length, 0); assert.equal(nr2.blocked.length, 10, "a second tick is idempotent");
console.log("terminal-rearmed tests passed");
