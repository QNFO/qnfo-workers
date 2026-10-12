// Offline suite for migrations/2026-10-12-29-noz-probes-social-guard.sql (NOZ-DOI-PROBES-1, NOZ-SOCIAL-GUARD-1,
// NOZ-CHANGELOG-1; agent_issues 2275, 2276, 2277). Applies the file to an in-memory SQLite copy of the touched qnfo-audit
// tables (schemas as read from D1 on 2026-10-12) and proves: the 2275/2277 probes point at the emitted defect; unposted
// social_threads rows naming the retired registrar (the shape of rows 184 and 185) are backed up and neutralised; a later
// insert or update from any producer is neutralised by the triggers; posted rows and clean rows are untouched; the 2276
// probe reads 0; fleet_changelog rows are reworded with a backup, new rows too; the file is idempotent; the Rollback line
// restores the original rows. Run: node migrations/noz-social-guard.test.mjs  -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-12-29-noz-probes-social-guard.sql", import.meta.url), "utf8");
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER, requires_container INTEGER, attempts INTEGER);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT);
CREATE TABLE fleet_changelog (worker TEXT NOT NULL, version TEXT NOT NULL, level TEXT NOT NULL, released_at TEXT NOT NULL, prev_version TEXT, title TEXT, subject TEXT, summary TEXT, marker TEXT, pr INTEGER, sha TEXT, pillar TEXT, public_hosts TEXT, enriched_at TEXT, enrich_tries INTEGER DEFAULT 0, enrich_note TEXT, PRIMARY KEY (worker, version));
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
`);
const OLD2275 = '{"paths": ["qnfo-pdf/worker.js", "q08-signal-engine/worker.js", "qnfo-subscribers/worker.js"], "absent": "enodo"}';
const OLD2277 = '{"paths": ["qnfo-research-exec/worker.js", "qnfo-cloud-ops/worker.js", "radar-hub/worker.js", "qnfo-lifecycle/worker.js", "qnfo-ops/worker.js", "qnfo-infra/worker.js", "qnfo-fleet-control/worker.js", "idea-hub/worker.js", "personal-api/worker.js"], "absent": "enodo"}';
db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, attempts, last_verdict) VALUES ('issue-2275', 2275, ?, 'code-read', 'active', 25, 'fail')").run(OLD2275);
db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, attempts, last_verdict) VALUES ('issue-2277', 2277, ?, 'code-read', 'active', 25, 'fail')").run(OLD2277);
db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status) VALUES ('issue-9', 9, 'x', 'code-read', 'active')").run();
const ins = db.prepare("INSERT INTO social_threads (slug, title, posts, status, created_at, doi) VALUES (?, ?, ?, ?, ?, ?)");
const P184 = JSON.stringify(["Most energy in hybrid computing may be spent outside the chip.", "Author: Rowan Brad Quni-Gudzinas. Paper: https://doi.org/10.5281/zenodo.23122792. Open question?"]);
ins.run("scan-zenodo.23122792", "Energy model", P184, "suppressed", "2026-10-07 06:01:47", null);
ins.run("scan-zenodo.22728635", "ML bound", JSON.stringify(["Check the open preprint: https://doi.org/10.5281/zenodo.22728635."]), "rejected", "2026-10-09 06:00:45", null);
ins.run("scan-zenodo.23170193", "Empty", "[]", "suppressed", "2026-10-06 06:00:59", null);
ins.run("posted-old", "Posted", JSON.stringify(["DOI: 10.5281/zenodo.21803677. What then?"]), "posted", "2026-09-20 06:00:00", null);
ins.run("clean-1", "Clean", JSON.stringify(["A clean post with doi 10.1103/x.y."]), "queued", "2026-10-11 06:00:00", "10.1103/x.y");
const cl = db.prepare("INSERT INTO fleet_changelog (worker, version, level, released_at, title, subject, summary, marker) VALUES (?, ?, 'minor', '2026-10-10', ?, ?, ?, ?)");
cl.run("qnfo-gateway", "3.14.0-doi-scrub", "Scrub Zenodo/10.5281 from gateway, dashboard (3.14.0)", "NOZ-DOI-1: scrub Zenodo/10.5281 from gateway", "", "NOZ-DOI-1");
cl.run("errata-hub", "1.2.0-crons-gated", "Issue closeout batch 2", "Issue closeout batch 2", "* errata-hub 1.2.0: gate Zenodo publish off by default (#1747)", null);
cl.run("qnfo-ops", "2.41.0", "Observability apply", "Observability apply", "clean summary", "OBS-1");
const before = { social: db.prepare("SELECT * FROM social_threads ORDER BY id").all(), changelog: db.prepare("SELECT * FROM fleet_changelog ORDER BY worker").all() };

db.exec(sql);
const c = (k) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(k);
const p75 = JSON.parse(c("issue-2275").verify_probe), p77 = JSON.parse(c("issue-2277").verify_probe);
ok(c("issue-2275").verify_transport === "code-read" && p75.absent === "10.5281/zenodo" && p75.paths.length === 3 && !("contains" in p75), "2275: code-read on the three emitters, absent the registrar DOI literal", p75);
ok(c("issue-2277").verify_transport === "runner-https" && p77.url === "https://fleet.qnfo.org/changelog" && p77.status === 200 && p77.absent === "zenodo", "2277: runner-https on the public changelog, absent zenodo", p77);
ok(c("issue-2275").attempts === 0 && c("issue-2275").last_verdict === null && c("issue-2275").status === "active", "2275 contract re-armed");
ok(c("issue-9").verify_probe === "x", "other contracts untouched");
// The 2275 probe passes on this checkout for real (no emitter hard-codes a registrar DOI or link).
for (const f of p75.paths) ok(!readFileSync(new URL("../" + f, import.meta.url), "utf8").includes(p75.absent), "2275 probe holds on " + f);

const probe2276 = "SELECT COUNT(*) AS n FROM social_threads WHERE created_at > datetime('2026-10-12 12:00:00', '-7 days') AND lower(COALESCE(posts, '')) LIKE '%zenodo%'";
ok(db.prepare(probe2276).get().n === 0, "2276 probe (7-day window) reads 0");
const s = (slug) => db.prepare("SELECT * FROM social_threads WHERE id = (SELECT id FROM social_threads_bak_nozdoi WHERE slug = ? LIMIT 1)").get(slug);
const r184 = s("scan-zenodo.23122792");
ok(r184 && r184.slug === "noz-guarded-1" && r184.posts === "[]" && r184.status === "rejected" && /NOZ-SOCIAL-GUARD-1/.test(r184.notes), "row like 184: neutral slug, no posts, rejected, noted", r184);
ok(db.prepare("SELECT posts FROM social_threads_bak_nozdoi WHERE slug = 'scan-zenodo.23122792'").get().posts === P184, "row like 184: original kept in the backup");
ok(db.prepare("SELECT COUNT(*) AS n FROM social_threads WHERE status <> 'posted' AND instr(lower(posts || slug || COALESCE(title, '') || COALESCE(doi, '')), 'zenodo') > 0").get().n === 0, "no unposted row names the registrar");
ok(db.prepare("SELECT posts FROM social_threads WHERE slug = 'posted-old'").get().posts === before.social[3].posts, "a posted row (the record of what was sent) is not rewritten");
const clean = db.prepare("SELECT * FROM social_threads WHERE slug = 'clean-1'").get();
ok(clean.posts === before.social[4].posts && clean.doi === "10.1103/x.y" && clean.status === "queued", "a clean row with a third-party DOI is untouched");
ok(db.prepare("SELECT kind, disposition, issue_id FROM control_registry WHERE control = 'social-threads-noz-guard'").get().kind === "guard", "the guard is recorded in control_registry");
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "one decision_log row");

// Any producer after the migration: /queue, /compose, a repair rewrite.
db.prepare("INSERT INTO social_threads (slug, title, posts, status) VALUES ('scan-zenodo.999', 'T', ?, 'queued')").run(JSON.stringify(["Read it at https://zenodo.org/records/999"]));
const g = db.prepare("SELECT * FROM social_threads WHERE id = (SELECT MAX(id) FROM social_threads)").get();
ok(g.slug === "noz-guarded-" + g.id && g.posts === "[]" && g.status === "rejected", "insert trigger neutralises a new queued row from any producer", g);
db.prepare("INSERT INTO social_threads (slug, title, posts, status) VALUES ('draft-x', 'T', ?, 'draft')").run(JSON.stringify(["fine text"]));
db.prepare("UPDATE social_threads SET posts = ? WHERE slug = 'draft-x'").run(JSON.stringify(["now with DOI 10.5281/zenodo.123"]));
const u = db.prepare("SELECT * FROM social_threads WHERE id = (SELECT MAX(id) FROM social_threads)").get();
ok(u.posts === "[]" && u.status === "rejected" && u.slug === "noz-guarded-" + u.id, "update trigger neutralises a rewrite that adds the registrar", u);
db.prepare("INSERT INTO social_threads (slug, title, posts, status) VALUES ('ok-2', 'T', ?, 'queued')").run(JSON.stringify(["third-party doi 10.1038/abc"]));
ok(db.prepare("SELECT status FROM social_threads WHERE slug = 'ok-2'").get().status === "queued", "a clean insert passes unchanged (the guard never blocks)");

const ch = db.prepare("SELECT * FROM fleet_changelog ORDER BY worker").all();
ok(ch.every((r) => !/zenodo|10\.5281/i.test([r.title, r.subject, r.summary, r.marker].join(" "))), "no changelog row names the registrar", ch.map((r) => r.title));
ok(ch.find((r) => r.worker === "qnfo-gateway").title === "Scrub retired-registrar from gateway, dashboard (3.14.0)", "changelog title reworded", ch.find((r) => r.worker === "qnfo-gateway").title);
ok(ch.find((r) => r.worker === "qnfo-ops").summary === "clean summary", "a clean changelog row is untouched");
ok(db.prepare("SELECT COUNT(*) AS n FROM fleet_changelog_bak_nozdoi").get().n === 2, "two changelog rows backed up");
db.prepare("INSERT INTO fleet_changelog (worker, version, level, released_at, title, summary) VALUES ('x', '1.0.0', 'minor', '2026-10-12', 'NO-ZENODO-DOI follow-up', 'drops zenodo.org links')").run();
const nx = db.prepare("SELECT title, summary FROM fleet_changelog WHERE worker = 'x'").get();
ok(nx.title === "NO-RETIRED-REGISTRAR-DOI follow-up" && nx.summary === "drops retired-registrar links", "a new changelog row is reworded on insert", nx);
db.prepare("UPDATE fleet_changelog SET summary = 'enriched: Zenodo gate' WHERE worker = 'qnfo-ops'").run();
ok(db.prepare("SELECT summary FROM fleet_changelog WHERE worker = 'qnfo-ops'").get().summary === "enriched: retired-registrar gate", "an enrichment update is reworded");

// Idempotent: a second application changes nothing more and adds no backup rows.
const nb = db.prepare("SELECT COUNT(*) AS n FROM social_threads_bak_nozdoi").get().n;
db.exec(sql.replace(/INSERT INTO decision_log[\s\S]*$/, ""));
ok(db.prepare("SELECT COUNT(*) AS n FROM social_threads_bak_nozdoi").get().n === nb, "re-applying adds no social backup rows");

// Rollback line restores the original rows and drops the triggers.
const rb = (sql.match(/^-- Rollback: (.*)$/m) || [])[1];
ok(!!rb, "the file has a Rollback line");
const db2 = new DatabaseSync(":memory:");
db2.exec(db.prepare("SELECT group_concat(sql, ';\n') AS s FROM sqlite_master WHERE type = 'table' AND name IN ('remediation_contracts', 'social_threads', 'fleet_changelog', 'control_registry', 'decision_log')").get().s + ";");
for (const r of before.social) db2.prepare("INSERT INTO social_threads (id, slug, title, posts, status, created_at, doi) VALUES (?, ?, ?, ?, ?, ?, ?)").run(r.id, r.slug, r.title, r.posts, r.status, r.created_at, r.doi);
for (const r of before.changelog) db2.prepare("INSERT INTO fleet_changelog (worker, version, level, released_at, title, subject, summary, marker) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(r.worker, r.version, r.level, r.released_at, r.title, r.subject, r.summary, r.marker);
db2.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status) VALUES ('issue-2275', 2275, ?, 'code-read', 'active')").run(OLD2275);
db2.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status) VALUES ('issue-2277', 2277, ?, 'code-read', 'active')").run(OLD2277);
db2.exec(sql);
db2.exec(rb);
const s2 = db2.prepare("SELECT id, slug, title, posts, status, doi FROM social_threads ORDER BY id").all();
ok(JSON.stringify(s2) === JSON.stringify(before.social.map((r) => ({ id: r.id, slug: r.slug, title: r.title, posts: r.posts, status: r.status, doi: r.doi }))), "rollback restores social_threads", s2);
const c2 = db2.prepare("SELECT worker, version, title, subject, summary, marker FROM fleet_changelog ORDER BY worker").all();
ok(JSON.stringify(c2) === JSON.stringify(before.changelog.map((r) => ({ worker: r.worker, version: r.version, title: r.title, subject: r.subject, summary: r.summary, marker: r.marker }))), "rollback restores fleet_changelog", c2);
ok(db2.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2275'").get().verify_probe === OLD2275 && db2.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2277'").get().verify_probe === OLD2277, "rollback restores both probes");
ok(db2.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get().n === 0, "rollback drops the four triggers");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
