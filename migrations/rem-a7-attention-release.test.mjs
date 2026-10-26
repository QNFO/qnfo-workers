// ATTENTION-STOP-RELEASE-1 decision record suite: replays migrations/2026-10-26-rem-a7-attention-release.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, nothing deleted or dropped); exactly one decision_log row is written with a stated prediction and the code
// condition it records is the one on this checkout of qnfo-fleet-dashboard/worker.js; a replay writes nothing; decision_log stays append-only (the live trigger refuses an update);
// the Rollback line runs and changes nothing.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-attention-release.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-attention-release.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const dashSrc = readFileSync(here("../qnfo-fleet-dashboard/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const w = new DatabaseSync(":memory:");
w.exec(BASE_DDL);
w.exec(sql);
const rows = w.prepare("SELECT * FROM decision_log").all();
ok(rows.length === 1 && rows[0].actor === "rem-a7-f1:attention-stop-release", "exactly one decision_log row", rows.length);
const r = rows[0];
ok(/pending/.test(r.outcome) && /attention_channels_stopped reads 0/.test(r.predicted_outcome) && /bluesky >= 0\.5/.test(r.predicted_outcome) && r.rollback_path.length > 20 && r.blast_radius.length > 20, "it states a prediction the scorecards grade, a blast radius and a rollback path", r);
const condition = (/atVerdict: if \((pv === "STOP" && visits <= 0)\)/.exec(r.action) || [])[1];
ok(condition && dashSrc.indexOf("if (" + condition + ") {") > 0 && dashSrc.indexOf('if (pv === "STOP") {') < 0, "the condition it records is the one on this checkout of worker.js, and the sticky form is gone", condition);
const before = JSON.stringify(w.prepare("SELECT * FROM decision_log").all());
w.exec(sql);
ok(JSON.stringify(w.prepare("SELECT * FROM decision_log").all()) === before, "a replay writes nothing");
let refused = false;
try { w.prepare("UPDATE decision_log SET outcome = 'x'").run(); } catch (e) { refused = /append-only/.test(String(e.message)); }
ok(refused, "decision_log stays append-only");
const rb = header.find((l) => /^-- Rollback:/.test(l)).slice("-- Rollback: ".length);
ok(/^SELECT '/.test(rb) && w.prepare(rb).get() !== undefined, "the Rollback line is a no-op SELECT that runs");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
