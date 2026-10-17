// GROUND-MATCHER-2 offline suite (personal-companion 1.19.2, charter pillar: personal). The deterministic name check read words that are
// not names as "name not in the source" (companion_runs 5121-5276, 24 h to 2026-10-13 07:05Z): a sentence opener after a closing quote or
// markdown emphasis ("It's a trap!” Delivered", "documents.** Records"), single letters ("S E L L D S", "Model B"), two names joined by
// "and" read as one ("Irish and Mediterranean"), and a plural possessive ("Danes' Road"). Proves those are no longer flagged and that
// invented names, years and figures still are.
// Run: node personal-companion/ground-matcher.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const G = mod.__verify.groundingProblems;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const source = "Admiral Ackbar is a character in Return of the Jedi. He says the line It's a trap! The Rebel fleet attacks. The Corlea Trackway was built in 148 BC, contemporary with the Siege of Carthage across the Mediterranean. Locals called it the Danes' Road. The model was evaluated with a shared latent interface. The park board kept continuity in its records.";
const has = (probs, re) => probs.some((p) => re.test(p));
{
  const p = G("The fleet hears one line: “It's a trap!” Delivered at the right moment, it reverses the attack.", source);
  ok(!has(p, /Delivered/), "an opener after a closing quote is not a name", p);
  const p2 = G("The board kept **continuity in its records.** Records from the board show it.", source);
  ok(!has(p2, /Records/), "an opener after closing markdown emphasis is not a name", p2);
  const p3 = G("Suppose the model reads the input as S E L L D S and then as Model B in a second run.", source);
  ok(!has(p3, /\bS\b|E L L|Model B/), "single letters are not names", p3);
  const p4 = G("The road offers a synchronism between Irish and Mediterranean histories.", source);
  ok(!has(p4, /Irish|Mediterranean/), "two descriptor words joined by 'and' are checked one by one", p4);
  const p5 = G("The locals knew the Danes' Road well.", source);
  ok(!has(p5, /Danes/), "a plural possessive name in the source is grounded", p5);
}
{
  ok(has(G("Ackbar speaks during the Battle of Endor, a scene the film builds slowly.", source), /Battle of Endor/), "an invented name is still caught");
  ok(has(G("The phrase that Ackland utters has outlived the film.", source), /Ackland/), "a misspelt name is still caught");
  ok(has(G("The readers spoke Hindi and Arabic at home.", source), /Hindi/), "a name split off an 'and' is still checked (Hindi is not in the source)");
  ok(has(G("The firm Procter and Gamble paid for it.", source), /Procter/) && has(G("The firm Procter and Gamble paid for it.", source), /Gamble/), "both sides of an 'and' pair are checked");
  ok(has(G("In the mid-1980s the excavation began.", source), /1980/), "an invented decade is still caught");
  ok(has(G("The road carried 4000 travellers a year.", source), /4000/), "an invented figure is still caught");
  ok(G("The Corlea Trackway was built in 148 BC, contemporary with the Siege of Carthage.", source).length === 0, "a grounded sentence passes");
}
{
  const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(vm && (+vm[1] > 1 || (+vm[1] === 1 && (+vm[2] > 19 || (+vm[2] === 19 && +vm[3] >= 2)))), "VERSION at least 1.19.2", vm && vm[0]);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
