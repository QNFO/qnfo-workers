// COMPANION-FORCED-FALLBACK-1 (personal-companion 1.13.3, agent_issues 2106/2126): the forced-fallback branch is reachable.
// A critic-rejected draft that passed validation is kept as bestRejected (strongest worst dimension wins) and becomes best
// only when the companion has been silent for STALL_HOURS. Run: node personal-companion/forced-fallback.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const gen = src.slice(src.indexOf("var bestRejected = null;"), src.indexOf("var slug = await persistPiece("));
ok(gen.length > 200, "generate holds the bestRejected logic");
ok(/q\.gate = "forced";\s*if \(!bestRejected \|\| worst > bestRejected\.worst\) bestRejected = \{ piece, quality: q, words: v\.words, worst: worst \};\s*continue;/.test(gen), "a rejected draft is kept, strongest first, before continue");
ok(/if \(!best && bestRejected && stalledHours != null && stalledHours >= STALL_HOURS\) best = bestRejected;\s*if \(!best\) \{/.test(gen), "it is published only after STALL_HOURS of silence");
ok(gen.indexOf("bestRejected =") > gen.indexOf('if (!v.ok)') || !/bestRejected = \{/.test(gen.slice(0, gen.indexOf('if (!v.ok)'))), "a draft that failed validation is never kept");
ok(/best\.quality\.gate === "forced"/.test(src) && /"gate not passed \(forced fallback\)"/.test(src), "a forced publish is logged as forced");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
