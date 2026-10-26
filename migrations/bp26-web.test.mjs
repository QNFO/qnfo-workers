// BP26-WEB-1 offline suite: replays migrations/2026-10-26-bp26-web.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); the eight metrics it owns now name scripts/bp26_web.py as their producer and keep the
// [BP26] tag the collector framework writes through; no other metric changes; the decision is logged once; a replay changes nothing; the Rollback line restores the "(to build)" text;
// decision_log is only inserted into. Output MUST contain "0 failed" on success.   node migrations/bp26-web.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-web.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

const OWNED = ["security_headers_pass", "turnstile_on_public_forms", "non_essential_cookies_set", "third_party_trackers", "structured_data_valid", "slo_attainment_28d_min", "ai_label_coverage", "ai_interaction_disclosure"];
const OLD = { security_headers_pass: "runner-https header probe (to build) [BP26]", turnstile_on_public_forms: "form inventory (to build) [BP26]", non_essential_cookies_set: "crawler check (to build) [BP26]", third_party_trackers: "crawler check (to build) [BP26]", structured_data_valid: "CI validation step (to build) [BP26]", slo_attainment_28d_min: "host census + probes (to compute) [BP26]", ai_label_coverage: "template probe (to build) [BP26]", ai_interaction_disclosure: "runtime probes (to build) [BP26]", a11y_violations_serious: "CI axe run (to build) [BP26]", orphaned_leases: "qnfo-audit.work_claims [BP26]" };
const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const world = () => {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, source_of_truth TEXT, last_value TEXT, state TEXT DEFAULT 'UNMEASURED');
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  for (const [m, s] of Object.entries(OLD)) w.prepare("INSERT INTO metric_registry (metric, source_of_truth) VALUES (?, ?)").run(m, s);
  return w;
};
const src = (w, m) => w.prepare("SELECT source_of_truth s FROM metric_registry WHERE metric = ?").get(m).s;

const w = world();
w.exec(sql);
for (const m of OWNED) {
  const s = src(w, m);
  ok(s.includes("scripts/bp26_web.py collect_web") && s.endsWith("[BP26]"), m + " names the producer and keeps the [BP26] tag", s);
}
ok(src(w, "a11y_violations_serious") === OLD.a11y_violations_serious && src(w, "orphaned_leases") === OLD.orphaned_leases, "a metric this file does not own is untouched");
ok(w.prepare("SELECT COUNT(*) n FROM metric_registry WHERE last_value IS NOT NULL").get().n === 0, "no value is written by the migration");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-WEB-1:%'").get().n === 1, "the decision is logged once");

w.exec(sql);
ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "a replay logs nothing more");

w.exec(rollback);
ok(OWNED.every((m) => src(w, m) === OLD[m]), "the Rollback line restores the (to build) text", OWNED.map((m) => src(w, m)));
ok(src(w, "a11y_violations_serious") === OLD.a11y_violations_serious, "the Rollback leaves other metrics alone");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
