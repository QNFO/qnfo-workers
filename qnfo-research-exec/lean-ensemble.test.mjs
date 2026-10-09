// LEAN-ENSEMBLE-1 (agent_issues 2118, 1795) offline suite. Runs the worker's own leanEnsemble against an in-memory SQLite D1:
// lean while any fleet_budget ai_spend cap is breached, three legs when none is, three legs when ops_config
// research_lean_ensemble is off, lean when fleet_budget is unreadable. Also checks the ensemble sizes its legs from the switch
// and that reconcile joins only drafts of the current grounding.
// Run: node qnfo-research-exec/lean-ensemble.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const start = src.indexOf("async function leanEnsemble(");
const end = src.indexOf("\n}\n", start) + 2;
const leanEnsemble = new Function(src.slice(start, end) + "\nreturn leanEnsemble;")();
const mk = (budget, cfg) => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE fleet_budget (node_class TEXT, cap REAL, current REAL); CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT)");
  for (const [k, c, v] of budget) db.prepare("INSERT INTO fleet_budget VALUES (?, ?, ?)").run(k, c, v);
  for (const [k, v] of cfg) db.prepare("INSERT INTO ops_config VALUES (?, ?)").run(k, v);
  return { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return db.prepare(sql).get(...a) ?? null; } }; return st; } };
};
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
ok(await leanEnsemble({ QNFO_AUDIT: mk([["ai_spend:workers-ai", 25, 59.7]], []) }) === true, "a breached ai_spend cap selects the lean ensemble");
ok(await leanEnsemble({ QNFO_AUDIT: mk([["ai_spend:workers-ai", 25, 10], ["workers", 100, 500]], []) }) === false, "no breached ai_spend cap: three legs (other node classes do not count)");
ok(await leanEnsemble({ QNFO_AUDIT: mk([["ai_spend:total", 150, 224]], [["research_lean_ensemble", "off"]]) }) === false, "ops_config research_lean_ensemble = off restores three legs");
ok(await leanEnsemble({ QNFO_AUDIT: { prepare() { throw new Error("no such table: fleet_budget"); } } }) === true, "an unreadable fleet_budget reads as breached (lean)");
ok(/const writers = lean \? WRITER_MODELS\.slice\(0, 2\) : WRITER_MODELS;/.test(src) && /okLegs < writers\.length/.test(src), "the ensemble sizes its legs and its retry from the switch");
ok(/WRITER_MODELS = \[\s*"@cf\/openai\/gpt-oss-120b",\s*"@cf\/zai-org\/glm-5\.3-flash",/.test(src), "the two lean legs are from different model families");
ok(/if \(i > 0 && fp0 && fpi && fpi !== fp0\) continue;/.test(src), "reconcile skips a draft whose grounding fingerprint differs from draft-0");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
