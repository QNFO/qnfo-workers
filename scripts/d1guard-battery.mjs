#!/usr/bin/env node
// D1-GUARD-BATTERY-1 (2026-09-29) - automatic self-audit for the ops_d1_query read-only guard.
//
// Extracts d1StripLiterals()/d1ReadOnlyGuard() from qnfo-ops/worker.js and asserts the
// accept/reject contract. Covers BOTH false-positive classes measured in production:
//   D1-GUARD-LITERAL-AWARE-1  a mutation keyword inside a STRING LITERAL was refused
//                             (SELECT ... WHERE title LIKE '%delete%')
//   D1-GUARD-FN-AWARE-1       the SQLite scalar function replace() was refused because
//                             `replace` is also the REPLACE INTO keyword
//                             (SELECT replace(title,'a','b') FROM t)
// and asserts that real mutations stay refused, including the two cases the PRE-PATCH
// guard wrongly ACCEPTED ("SELECT 1; SELECT 2") and mutation-capable PRAGMA.
//
// WIRED AS A BLOCKING PREFLIGHT in .github/workflows/deploy-qnfo-ops.yml, so a guard
// regression cannot reach live. Exit 0 = contract holds; exit 3 = contract broken.
// Run locally: node scripts/d1guard-battery.mjs
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
  // --- D1-GUARD-LITERAL-AWARE-1: keyword inside a STRING LITERAL must be ACCEPTED
  ["SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE '%delete%'", true],
  ["SELECT 'delete' AS x", true],
  ["SELECT * FROM t WHERE a='x' /* insert */", true],
  ["SELECT * FROM t WHERE x = 'a''b;c'", true],
  ["SELECT 'drop table t' AS note", true],
  // --- D1-GUARD-FN-AWARE-1: replace() is a SCALAR FUNCTION in a read and must be ACCEPTED
  ["SELECT replace(title,'a','b') AS t FROM agent_issues LIMIT 3", true],
  ["SELECT replace(title,'TOOL-FAILURE','TF') AS t, id FROM agent_issues LIMIT 3", true],
  ["SELECT replace('delete','e','E') AS x", true],
  ["SELECT coalesce(a,b) AS c, ifnull(d,e) AS f FROM t", true],
  ["SELECT substr(title,1,10) AS s FROM t", true],
  ["SELECT json_extract(meta,'$.a') AS a FROM t", true],
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
  ["replace into t values (1)", false],
  ["CREATE TABLE t (a)", false],
  ["ATTACH DATABASE 'x' AS y", false],
  ["VACUUM", false],
  ["TRUNCATE TABLE t", false],
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
