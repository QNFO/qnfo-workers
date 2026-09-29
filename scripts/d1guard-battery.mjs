#!/usr/bin/env node
// D1-GUARD-BATTERY-1 (2026-09-29) - automatic self-audit for the ops_d1_query read-only guard.
//
// Extracts d1StripLiterals()/d1ReadOnlyGuard() from qnfo-ops/worker.js and asserts the
// accept/reject contract, including the false-positive class that made ops_d1_query the
// highest-volume failing tool on the endpoint (D1-GUARD-LITERAL-AWARE-1: a mutation keyword
// inside a string literal was refused). Exit 0 = contract holds; exit 3 = contract broken.
//
// Wired into .github/workflows/deploy-qnfo-ops.yml as a preflight, so a guard regression
// cannot reach live. Run locally: node scripts/d1guard-battery.mjs
import { readFileSync } from "node:fs";

const src = readFileSync("qnfo-ops/worker.js", "utf8");
const s = src.indexOf("var D1_READONLY_PRAGMAS");
const e = src.indexOf("async function d1Query(env, args) {");
if (s < 0 || e < 0 || e <= s) {
  console.error("FAIL: guard region not found in qnfo-ops/worker.js");
  process.exit(3);
}
const body = src.slice(s, e);
let G;
try {
  G = new Function(body + "\nreturn { d1ReadOnlyGuard: d1ReadOnlyGuard, d1StripLiterals: d1StripLiterals };")();
} catch (err) {
  console.error("FAIL: guard region is not standalone-evaluable: " + err.message);
  process.exit(3);
}

const CASES = [
  // --- the measured false-positive class: keyword inside a STRING LITERAL must be ACCEPTED
  ["SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE '%delete%'", true],
  ["SELECT 'delete' AS x", true],
  ["SELECT * FROM t WHERE a='x' /* insert */", true],
  ["SELECT * FROM t WHERE x = 'a''b;c'", true],
  // --- introspection must be reachable without guessing
  ["SELECT * FROM pragma_table_info('agent_issues')", true],
  ["PRAGMA table_info(agent_issues)", true],
  // --- ordinary reads
  ["WITH x AS (SELECT 1) SELECT * FROM x", true],
  ["SELECT 1 -- ; x", true],
  ["/* drop */ SELECT 1", true],
  // --- real mutations must stay REJECTED (HARD-1 preserved)
  ["DROP TABLE x", false],
  ["INSERT INTO t VALUES (1)", false],
  ["DELETE FROM t", false],
  ["UPDATE t SET a=1", false],
  ["ALTER TABLE t ADD COLUMN c", false],
  ["REPLACE INTO t VALUES (1)", false],
  // --- multi-statement: the pre-patch guard ACCEPTED "SELECT 1; SELECT 2"; it must not now
  ["SELECT 1; SELECT 2", false],
  ["SELECT 1; DROP TABLE x", false],
  // --- mutation-capable PRAGMA must stay REJECTED
  ["PRAGMA journal_mode=WAL", false],
  ["PRAGMA writable_schema=1", false],
];

let bad = 0;
for (const [q, want] of CASES) {
  let got, note;
  try {
    const g = G.d1ReadOnlyGuard(q);
    got = !!g.ok;
    note = g.ok ? ("-> " + g.sql) : ("-> " + g.error);
  } catch (err) {
    got = false;
    note = "-> THREW " + err.message;
    bad++;
    console.log("FAIL expect=" + (want ? "ACCEPT" : "REJECT") + " got=THREW :: " + q + " " + note);
    continue;
  }
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? "PASS" : "FAIL") + " expect=" + (want ? "ACCEPT" : "REJECT") + " got=" + (got ? "ACCEPT" : "REJECT") + " :: " + q + " " + note);
}

console.log("BATTERY: " + (CASES.length - bad) + "/" + CASES.length + " correct");
process.exit(bad === 0 ? 0 : 3);
