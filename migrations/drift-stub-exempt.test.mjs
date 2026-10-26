// DRIFT-STUB-EXEMPT-1: the migration hands the dashboard change to the code loop with an anchor that must stay unique in the target file.
import { readFileSync } from "node:fs";
const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-drift-stub-exempt.sql"), "utf8");
const dash = readFileSync(here("../qnfo-fleet-dashboard/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "the migration opts in to the runner with its three header lines");
ok(!/\bDELETE\b|\bDROP\b/i.test(sql.replace(/^--.*$/gm, "")), "no DELETE or DROP, so no BACKUP header is needed");
ok(/code-task: repo=qnfo-workers path=qnfo-fleet-dashboard\/worker\.js/.test(sql), "it names the one file for the code loop");
const anchor = "const unversioned = nodes.filter(function(n) {";
ok(sql.includes("code-anchor: " + anchor), "it carries the anchor verbatim");
ok(dash.split(anchor).length === 2, "the anchor occurs exactly once in qnfo-fleet-dashboard/worker.js (" + (dash.split(anchor).length - 1) + ")");
ok(/instr\(COALESCE\(description, ''\), 'DRIFT-STUB-EXEMPT-1'\) = 0/.test(sql), "re-applying appends nothing twice");
console.log("drift-stub-exempt.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
