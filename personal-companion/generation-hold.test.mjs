// COMPANION-GENERATION-SWITCH-1 offline suite (personal-companion 1.20.0, charter pillar: personal; agent_issues 2222).
// A no-deploy stop for the hourly generation, off by default. Proves: generation stops while qnfo-audit ops_config companion_generation
// reads hold (or off, paused, 0); on, an absent row or an absent binding do not stop it; a failed read is logged and does not stop it;
// the scheduled path checks the switch before generate() and logs a held row.
// Run: node personal-companion/generation-hold.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const audit = (row, err) => ({ prepare: (sql) => ({ first: async () => { if (err) throw new Error(err); ok(/FROM ops_config WHERE key = 'companion_generation'/.test(sql), "reads the companion_generation key", sql); return row; } }) });
{
  const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(vm && (+vm[1] > 1 || (+vm[1] === 1 && (+vm[2] > 19 || (+vm[2] === 19 && +vm[3] >= 7)))), "VERSION is at least 1.19.7 (switch present)", vm && vm[0]);
}
for (const v of ["hold", "HOLD", " off ", "paused", "0"]) {
  const h = await V.generationHold({ AUDIT: audit({ value: v, note: "owner verdict" }) });
  ok(h && h.value === v.trim().toLowerCase() && h.note === "owner verdict", "value " + JSON.stringify(v) + " holds generation", h);
}
for (const row of [{ value: "on" }, { value: "" }, { value: null }, null]) {
  ok((await V.generationHold({ AUDIT: audit(row) })) === null, "row " + JSON.stringify(row) + " does not hold");
}
ok((await V.generationHold({})) === null && (await V.generationHold(null)) === null, "no AUDIT binding does not hold");
{
  const errs = []; const orig = console.error; console.error = (m) => errs.push(String(m));
  const h = await V.generationHold({ AUDIT: audit(null, "D1 down") });
  console.error = orig;
  ok(h === null && errs.some((e) => /COMPANION-GENERATION-HOLD-1 read failed: D1 down/.test(e)), "a failed read is logged and does not hold", errs);
}
{
  const i = src.indexOf("var genHold = (isGenHour || retryBlocked) ? await generationHold(env) : null;");
  const j = src.indexOf("if ((isGenHour || retryBlocked) && !genHold) {");
  const k = src.indexOf("var out = await generate(env, form, {});", j);
  ok(i > 0 && j > i && k > j && src.indexOf('"held", "generation held: ops_config companion_generation = "') > i, "the scheduled path checks the hold before generate() and logs a held row");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
