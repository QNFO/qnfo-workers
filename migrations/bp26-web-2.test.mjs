// BP26-WEB-2 offline suite: replays migrations/2026-10-26-bp26-web-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); a11y_violations_serious names scripts/bp26_web.py and keeps the [BP26] tag the collector
// framework writes through; no other metric changes and no value is written; the decision is logged once; a replay changes nothing; the Rollback line restores the "(to build)" text.
// Output MUST contain "0 failed" on success.   node migrations/bp26-web-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-web-2.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

const OLD = "CI axe run (to build) [BP26]";
const OTHER = "scripts/bp26_web.py collect_web: GET of each public HTML host [BP26]";
const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const w = new DatabaseSync(":memory:");
w.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT, last_value TEXT, state TEXT DEFAULT 'UNMEASURED');
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
w.prepare("INSERT INTO metric_registry (metric, source_of_truth) VALUES ('a11y_violations_serious', ?)").run(OLD);
w.prepare("INSERT INTO metric_registry (metric, source_of_truth) VALUES ('security_headers_pass', ?)").run(OTHER);
const src = (m) => w.prepare("SELECT source_of_truth s FROM metric_registry WHERE metric = ?").get(m).s;

w.exec(sql);
ok(src("a11y_violations_serious").includes("scripts/bp26_web.py collect_web") && src("a11y_violations_serious").includes("lower bound") && src("a11y_violations_serious").endsWith("[BP26]"), "a11y names the producer, says lower bound and keeps the [BP26] tag", src("a11y_violations_serious"));
ok(src("security_headers_pass") === OTHER, "another metric is untouched");
ok(w.prepare("SELECT COUNT(*) n FROM metric_registry WHERE last_value IS NOT NULL").get().n === 0, "no value is written by the migration");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-WEB-2:%'").get().n === 1, "the decision is logged once");
w.exec(sql);
ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "a replay logs nothing more");
w.exec(rollback);
ok(src("a11y_violations_serious") === OLD && src("security_headers_pass") === OTHER, "the Rollback line restores the (to build) text and leaves the rest alone");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
