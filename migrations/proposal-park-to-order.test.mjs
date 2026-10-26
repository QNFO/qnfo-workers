// PROPOSAL-PARK-TO-ORDER-1 offline suite: replays migrations/2026-10-26-proposal-park-to-order.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, BACKUP, one Rollback line, nothing deleted or dropped); only rows parked with PARKED-LOW-VALUE-1 at the start of their error change, and only their error (status,
// stage and score stay); the new error starts with the POOL-BOUND-1 marker that qnfo-fleet-control's backpressure tick re-arms (the real revive query of researchBackpressureTick, run here, returns them best score first),
// keeps the old text and the score; the issue's own closing probe (count of PARKED-LOW-VALUE-1 rows, expected 0) goes from 3 to 0; a replay changes nothing; the Rollback line restores the first text.
// Output MUST contain "0 failed" on success.   node migrations/proposal-park-to-order.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-proposal-park-to-order.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1 && header.filter((l) => /^-- BACKUP: bak_20261026_proposal_park_to_order\s*$/.test(l)).length === 1, "one Rollback line and the backup is named");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body) && !/fleet_tick|claude\.ai|anthropic\.com/i.test(sql), "decision_log is only inserted into; no fleet_tick, no claude.ai");
ok([...sql.matchAll(/LIKE\s+'([^']*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "LIKE patterns stay under 50 bytes");

const LOW = "PARKED-LOW-VALUE-1: proposal score<0.8 parked by admission policy; revives automatically when ready pool<24 or score>=0.8 (2026-10-24)";
const w = new DatabaseSync(":memory:");
w.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, status TEXT, stage TEXT, score REAL, error TEXT, created_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const put = (id, source, status, stage, score, error) => w.prepare("INSERT INTO research_queue (id, source, source_id, status, stage, score, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, '2026-10-20T00:00:00.000Z')").run(id, source, "s-" + id, status, stage, score, error);
put("low-a", "proposal", "wontfix", "parked", 0.31, LOW);
put("low-b", "proposal", "wontfix", "parked", 0.79, LOW);
put("low-c", "goal-author", "wontfix", "parked", 0.55, LOW);
put("other-park", "proposal", "wontfix", "parked", 0.9, "PARKED-UNAPPLIABLE-PATCH-1: 2 models + strict retry produce no applicable edit");
put("pool-park", "proposal", "wontfix", "parked", 0.6, "POOL-BOUND-1 parked 2026-10-20T00:00:00Z: deferred pool 500 over research_deferred_max 400");
put("queued", "proposal", "queued", null, 0.85, null);
put("published", "proposal", "published", "done", 0.95, null);
const probe = () => w.prepare("SELECT COUNT(*) n FROM research_queue WHERE status = 'wontfix' AND error LIKE 'PARKED-LOW-VALUE-1%'").get().n;
ok(probe() === 3, "before: the issue's closing probe counts 3 rows");
const first = JSON.stringify(w.prepare("SELECT id, status, stage, score, error FROM research_queue ORDER BY id").all());
w.exec(sql);
const row = (id) => w.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
ok(probe() === 0, "after: the closing probe reads 0");
for (const id of ["low-a", "low-b", "low-c"]) {
  const r = row(id);
  ok(r.status === "wontfix" && r.stage === "parked" && r.error.startsWith("POOL-BOUND-1 parked ") && r.error.includes("score " + r.score) && r.error.includes("PARKED-LOW-VALUE-1 of 2026-10-24") && r.error.includes("proposal score<0.8"), id + ": status and stage stay, the error is a POOL-BOUND-1 line that keeps the score and the old text", r);
  ok(r.score === { "low-a": 0.31, "low-b": 0.79, "low-c": 0.55 }[id], id + ": the score is unchanged");
}
ok(row("other-park").error.startsWith("PARKED-UNAPPLIABLE-PATCH-1") && row("pool-park").error.startsWith("POOL-BOUND-1 parked 2026-10-20") && row("queued").status === "queued" && row("published").status === "published", "other parked rows, a queued and a published row are untouched");
// the revive query of qnfo-fleet-control researchBackpressureTick (status wontfix, stage parked, error LIKE 'POOL-BOUND-1%'), with the score as the order
const revive = w.prepare("SELECT q.id FROM research_queue q WHERE q.status = 'wontfix' AND q.stage = 'parked' AND q.error LIKE ?1 ORDER BY q.score DESC LIMIT ?2").all("POOL-BOUND-1%", 4).map((r) => r.id);
ok(revive.join() === "pool-park,low-b,low-c,low-a" || revive.join() === "low-b,pool-park,low-c,low-a", "the existing revive query now finds the four parked rows, best score first", revive);
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'PROPOSAL-PARK-TO-ORDER-1:%'").get().n === 1, "one decision_log row");
ok(w.prepare("SELECT COUNT(*) n FROM bak_20261026_proposal_park_to_order").get().n === 3, "the backup holds exactly the three rows");
const second = JSON.stringify(w.prepare("SELECT id, status, stage, score, error FROM research_queue ORDER BY id").all());
w.exec(sql);
ok(JSON.stringify(w.prepare("SELECT id, status, stage, score, error FROM research_queue ORDER BY id").all()) === second && w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "a replay changes nothing and adds no decision row");
{
  const rb = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  ok(JSON.stringify(w.prepare("SELECT id, status, stage, score, error FROM research_queue ORDER BY id").all()) === first, "the Rollback line restores every row to its first state");
}
{
  // a row the backpressure tick already revived keeps its new state through the Rollback
  w.exec(sql);
  w.prepare("UPDATE research_queue SET status = 'deferred', stage = NULL, error = 'POOL-BOUND-1 re-armed' WHERE id = 'low-b'").run();
  w.exec(header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, ""));
  ok(row("low-b").status === "deferred" && row("low-b").error === "POOL-BOUND-1 re-armed" && row("low-a").error === LOW, "the Rollback leaves a row that was already revived alone and restores the others");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
