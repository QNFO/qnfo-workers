// COST-RUN-RATE-2 (0.12.2) offline suite: costRunRate maps v_cost_run_rate to the fleet_budget ai_spend keys (7-day run rate x30):
// workers_ai -> workers-ai, ai_gateway:<p> -> <p>, total -> unified (non-BYOK) gateway providers; no ledger rows -> null
// (aiSpendCaps keeps the 30-day figures). Run: node qnfo-fleet-control/cost-run-rate.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("async function costRunRate(");
const b = src.indexOf("\n}\n", a) + 2;
const costRunRate = new Function("__name", src.slice(a, b) + "\nreturn costRunRate;")(() => {});
const mk = (rows) => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE r (source_group TEXT, run_rate_30d_7d REAL); CREATE VIEW v_cost_run_rate AS SELECT * FROM r");
  for (const [g, v] of rows) db.prepare("INSERT INTO r VALUES (?, ?)").run(g, v);
  return { prepare(sql) { return { all: async () => ({ results: db.prepare(sql).all() }) }; } };
};
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const r = await costRunRate(mk([["workers_ai", 62.09], ["ai_gateway:deepseek", 12.56], ["ai_gateway:openai", 3], ["cloudflare_plan:daily", 5], ["total:all-billing", 529.65]]), {});
ok(r.byProv["workers-ai"] === 62.09 && r.byProv.deepseek === 12.56 && r.byProv.openai === 3, "provider keys map from the ledger", r);
ok(r.unified === 3, "total meters unified billing only (deepseek is BYOK by default)", r);
ok(!("cloudflare_plan:daily" in r.byProv) && !("total:all-billing" in r.byProv), "plan and totals are not providers", r);
const r2 = await costRunRate(mk([["workers_ai", 1], ["ai_gateway:deepseek", 4]]), { AIG_BYOK_PROVIDERS: "none" });
ok(r2.unified === 4, "AIG_BYOK_PROVIDERS naming no gateway provider: every provider is unified", r2);
ok(await costRunRate(mk([]), {}) === null, "no ledger rows: null, so the 30-day figures stay in use");
ok(/var rr = await costRunRate\(db, env\)/.test(src) && /aiSpendCaps\(db, byProv, total, byBill, env\)/.test(src), "aiSpendCaps reads the run rate and receives env");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
