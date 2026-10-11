// ENSEMBLE-PREFIX-STAGGER-1 (agent_issues 2116, PROMPT-CACHE-PREFIX-3) offline suite. Runs the worker's own legStaggerMs and
// ensemblePrefixStaggerMs: only a leg whose model already ran an earlier leg waits, the delay comes from ops_config
// research_prefix_stagger_ms (0 turns it off, clamped to 30 s, unreadable -> default), and the ensemble applies it per leg.
// Run: node qnfo-research-exec/prefix-stagger.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const cut = (name) => { const s = src.indexOf(name); return src.slice(s, src.indexOf("\n}\n", s) + 2); };
const def = src.match(/var ENSEMBLE_PREFIX_STAGGER_MS = [^;]+;/)[0];
const { legStaggerMs, ensemblePrefixStaggerMs } = new Function(def + "\n" + cut("function legStaggerMs(") + "\n" + cut("async function ensemblePrefixStaggerMs(") + "\nreturn { legStaggerMs, ensemblePrefixStaggerMs };")();
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const W = ["@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-5.3-flash", "@cf/zai-org/glm-5.3-flash"];
ok(legStaggerMs(W, 0, 12000) === 0 && legStaggerMs(W, 1, 12000) === 0, "the first leg of each model starts at once");
ok(legStaggerMs(W, 2, 12000) === 12000, "the second glm-5.3-flash leg waits one stagger");
ok(legStaggerMs(["a", "a", "a"], 2, 5000) === 10000, "a third same-model leg waits two staggers");
ok(legStaggerMs(W, 2, 0) === 0, "stagger 0 turns it off");
ok(legStaggerMs(W.slice(0, 2), 1, 12000) === 0, "the lean two-family ensemble never waits");
const db = (v, boom) => ({ prepare() { if (boom) throw new Error("no such table"); return { async first() { return v === undefined ? null : { value: v }; } }; } });
ok(await ensemblePrefixStaggerMs({ QNFO_AUDIT: db(undefined) }) === 12000, "default 12 s when ops_config has no row");
ok(await ensemblePrefixStaggerMs({ QNFO_AUDIT: db("0") }) === 0, "ops_config 0 turns it off");
ok(await ensemblePrefixStaggerMs({ QNFO_AUDIT: db("90000") }) === 30000, "clamped to 30 s");
ok(await ensemblePrefixStaggerMs({ QNFO_AUDIT: db("abc") }) === 12000, "a non-number keeps the default");
ok(await ensemblePrefixStaggerMs({ QNFO_AUDIT: db(null, true) }) === 12000, "an unreadable ops_config keeps the default");
const ens = cut("async function stageEnsemble(");
ok(/const stagger = await ensemblePrefixStaggerMs\(env\);/.test(ens) && /legStaggerMs\(writers, i, stagger\)/.test(ens), "stageEnsemble staggers its primary legs");
ok(ens.indexOf("legStaggerMs(writers, i, stagger)") < ens.indexOf("aiText(env, m, shared"), "the wait comes before the leg's model call");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
