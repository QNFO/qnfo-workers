// PUBLICATION-GATE-AUDIT-1 offline suite: runs migrations/2026-10-26-publication-gate-audit.sql on SQLite after the output-quality ledger migration it builds on (already live).
// Proves: the q08 retraction rate is classified as a lower-is-better outcome and registered as worker-written with no trigger of its own (its exemption is named); the verdict view
// lists it as insufficient_history until it has history; three failure modes, two decisions (each with a parseable prediction and a revert path that names the ops_config override) and
// one capability are recorded; a second apply writes nothing; the Rollback header removes only the two rows it added and leaves the append-only evidence.
// Run: node migrations/publication-gate-audit.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const dir = new URL("./", import.meta.url);
const ledger = readFileSync(new URL("2026-10-26-output-quality-ledger.sql", dir), "utf8");
const audit = readFileSync(new URL("2026-10-26-publication-gate-audit.sql", dir), "utf8");
const SCHEMA = (readFileSync(new URL("output-quality-ledger.test.mjs", dir), "utf8").match(/const SCHEMA = `([\s\S]*?)`;/) || [])[1];
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
ok(!!SCHEMA && /CREATE TABLE metric_history/.test(SCHEMA), "the ledger suite's table definitions are readable");

const db = new DatabaseSync(":memory:");
db.exec(SCHEMA);
db.exec(ledger);
const one = (q, ...a) => db.prepare(q).get(...a);
const all = (q, ...a) => db.prepare(q).all(...a);
const before = { measures: one("SELECT COUNT(*) AS n FROM output_quality_measures").n, registry: one("SELECT COUNT(*) AS n FROM metric_registry").n, triggers: one("SELECT COUNT(*) AS n FROM analytics_metric_triggers").n, fms: one("SELECT COUNT(*) AS n FROM failure_modes").n, dls: one("SELECT COUNT(*) AS n FROM decision_log").n };
db.exec(audit);

const m = one("SELECT * FROM output_quality_measures WHERE metric = 'q08_retraction_rate_30d'");
ok(m && m.surface === "essays" && m.role === "outcome" && m.polarity === -1 && m.tol_rel === 0.2 && m.tol_abs === 0.05, "q08_retraction_rate_30d is an essays outcome, lower is better, with a tolerance", m);
ok(one("SELECT COUNT(*) AS n FROM output_quality_measures").n === before.measures + 1, "exactly one measure added");
const r = one("SELECT * FROM metric_registry WHERE metric = 'q08_retraction_rate_30d'");
ok(r && r.refresh_class === "worker-written" && r.state === "UNMEASURED" && r.last_value === null && /^exempt:/.test(r.disposition_actor) && r.target === "<= 0.1", "registered as worker-written, UNMEASURED, with its exemption named", r);
ok(one("SELECT COUNT(*) AS n FROM analytics_metric_triggers").n === before.triggers && one("SELECT COUNT(*) AS n FROM analytics_metric_triggers WHERE metric_key = 'q08_retraction_rate_30d'").n === 0, "no trigger of its own: output_quality_outcomes_worse carries it");
ok(one("SELECT moved FROM v_output_quality_verdict WHERE metric = 'q08_retraction_rate_30d'").moved === "insufficient_history", "no history yet: insufficient_history, never a pass");
// once it has history the verdict follows polarity: a falling rate is better, a rising one worse
const h = db.prepare("INSERT INTO metric_history (metric, day, value) VALUES ('q08_retraction_rate_30d', date('now', ?), ?)");
h.run("-7 days", 0.8); h.run("0 days", 0.5);
ok(one("SELECT moved FROM v_output_quality_verdict WHERE metric = 'q08_retraction_rate_30d'").moved === "better", "0.8 to 0.5 is better");
db.prepare("UPDATE metric_history SET value = 0.99 WHERE metric = 'q08_retraction_rate_30d' AND day = date('now')").run();
ok(one("SELECT moved FROM v_output_quality_verdict WHERE metric = 'q08_retraction_rate_30d'").moved === "worse", "0.8 to 0.99 is worse (0.19 is past the 0.16 tolerance)");

const fms = all("SELECT fm_key FROM failure_modes WHERE fm_key IN ('reviewer-output-shape-drift', 'ledger-tag-form-leak', 'writer-order-by-proxy')");
ok(fms.length === 3 && one("SELECT COUNT(*) AS n FROM failure_modes").n === before.fms + 3, "three failure modes recorded", fms);
const dls = all("SELECT * FROM decision_log WHERE instr(action, 'PUBLICATION-GATE-AUDIT-1') > 0");
ok(dls.length === 2 && dls.every((d) => /^[a-z0-9_]+ (>=|<=|>|<) [0-9.]+ within [0-9]+ h$/.test(d.predicted_outcome) && d.rollback_path && d.capability_gain && d.blast_radius && d.surfaces_tested), "two decisions, each with a parseable prediction, a revert path, a gain and a blast radius", dls.map((d) => d.predicted_outcome));
ok(/q08_compose_order/.test(dls[0].rollback_path) && /INSERT OR REPLACE INTO ops_config/.test(dls[0].rollback_path), "the writer-order decision names the override that reverts it without a deploy");
ok(one("SELECT COUNT(*) AS n FROM capability_ledger WHERE capability LIKE 'q08 reviewer-output hygiene%'").n === 1, "one capability recorded");

const snap = JSON.stringify([all("SELECT * FROM output_quality_measures"), all("SELECT metric, state FROM metric_registry ORDER BY metric"), all("SELECT fm_key FROM failure_modes ORDER BY fm_key"), all("SELECT id FROM decision_log"), all("SELECT capability FROM capability_ledger")]);
db.exec(audit);
ok(JSON.stringify([all("SELECT * FROM output_quality_measures"), all("SELECT metric, state FROM metric_registry ORDER BY metric"), all("SELECT fm_key FROM failure_modes ORDER BY fm_key"), all("SELECT id FROM decision_log"), all("SELECT capability FROM capability_ledger")]) === snap, "a second apply writes nothing");

const rb = (audit.match(/^-- Rollback: (.*)$/m) || [])[1];
ok(!!rb, "a Rollback line exists");
if (rb) {
  db.exec(rb);
  ok(one("SELECT COUNT(*) AS n FROM output_quality_measures WHERE metric = 'q08_retraction_rate_30d'").n === 0 && one("SELECT COUNT(*) AS n FROM metric_registry WHERE metric = 'q08_retraction_rate_30d'").n === 0, "the Rollback line removes the two rows it added");
  ok(one("SELECT COUNT(*) AS n FROM output_quality_measures").n === before.measures && one("SELECT COUNT(*) AS n FROM metric_registry").n === before.registry, "and nothing the ledger migration added");
  ok(one("SELECT COUNT(*) AS n FROM failure_modes").n === before.fms + 3 && one("SELECT COUNT(*) AS n FROM decision_log").n === before.dls + 2, "the failure modes and decisions stay as evidence");
}
ok(/^-- APPLY-BY: ci$/m.test(audit) && /^-- DB: qnfo-audit$/m.test(audit), "APPLY-BY and DB headers");
ok(!/\b(DELETE|DROP)\b/i.test(audit.replace(/^--.*$/gm, "")), "no DELETE or DROP in the body, so no BACKUP header is owed");
console.log(`publication-gate-audit: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
