// POOL-BOUND-SOURCES-1 offline suite: replays migrations/2026-10-19-pool-bound-sources.sql on SQLite.
// Proves: the two owner-directed rows POOL-BOUND-1 parked (source idea) are re-armed to the deferred pool with the remediation score
// convention when they had none; a row of another source, a row already published and a row whose error is not a POOL-BOUND-1 park are
// untouched; the control_registry row exists once; a second apply changes nothing and keeps one decision_log row; the Rollback line
// re-parks the two rows and removes the registry row.
// Run: node --no-warnings migrations/pool-bound-sources.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-pool-bound-sources.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, status TEXT, stage TEXT, score REAL, error TEXT);
  CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path TEXT, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const park = "POOL-BOUND-1 parked 2026-10-19T05:20:43.371Z: deferred pool 246 over research_deferred_max 60; re-armed automatically when the pool falls below 30. Revert: status deferred, stage NULL";
const ins = d.prepare("INSERT INTO research_queue VALUES (?, ?, ?, ?, ?, ?)");
ins.run("idea-reality-idempotent-exchange-symmetry-20261019", "idea", "wontfix", "parked", null, park);
ins.run("idea-12ba4668-71fa-467a-8383-8575c1d8c438", "idea", "wontfix", "parked", 0.4, park);
ins.run("other-parked", "proposal", "wontfix", "parked", null, park);
ins.run("idea-published", "idea", "published", "done", null, null);
const get = (id) => d.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
d.exec(sql);
const a = get("idea-reality-idempotent-exchange-symmetry-20261019"), b = get("idea-12ba4668-71fa-467a-8383-8575c1d8c438");
ok(a.status === "deferred" && a.stage === null && a.score === 0.95 && /^POOL-BOUND-SOURCES-1 re-armed/.test(a.error), "the owner task row is re-armed with the remediation score", a);
ok(b.status === "deferred" && b.stage === null && b.score === 0.4, "a row that had a score keeps it", b);
ok(get("other-parked").status === "wontfix" && get("idea-published").status === "published", "a parked proposal and a published row are untouched");
const reg = d.prepare("SELECT * FROM control_registry WHERE control = 'research-pool-bound'").all();
ok(reg.length === 1 && reg[0].kind === "cap" && reg[0].disposition === "keep" && /research_deferred_max = 0/.test(reg[0].alternate_path), "the pool bound is registered once with its off switch", reg.length);
ok(d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "one decision_log row");
d.exec(sql);
ok(d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && d.prepare("SELECT COUNT(*) AS n FROM control_registry").get().n === 1 && get("idea-12ba4668-71fa-467a-8383-8575c1d8c438").status === "deferred", "a second apply changes nothing and keeps one decision_log row");
d.exec(rollback);
ok(get("idea-reality-idempotent-exchange-symmetry-20261019").status === "wontfix" && get("idea-reality-idempotent-exchange-symmetry-20261019").stage === "parked" && d.prepare("SELECT COUNT(*) AS n FROM control_registry").get().n === 0, "Rollback re-parks the two rows and removes the registry row");
console.log("pool-bound-sources: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
