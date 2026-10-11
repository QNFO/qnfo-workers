// GROUND-HYPHEN-1 (q08-signal-engine 0.11.11): a hyphenated source name matches the draft's spelling with a unicode hyphen, and a
// sentence-case claim title is not rejected as a label. Run: node q08-signal-engine/ground-hyphen.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const V = mod.__verify;
let fails = 0;
const check = (l, c, x) => { if (!c) { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const ground = "Dex-One2Many learns dexterous manipulation from a single human video of a hand moving an object.";
const draft = "# One video is enough for the robot hand\n\nA team built Dex‑One2Many to learn dexterous manipulation from a single human video of a hand moving an object.";
const p = V.groundingProblems(draft, ground, {});
check("unicode-hyphen name grounded", !p.some(x => /Dex/.test(x)), p);
const gate = V.gate ? V.gate : null;
if (gate) {
  const body = "# Capital-driven polishing eclipses the original creator\n\n" + "A sentence of body text that is long enough to count as prose here. ".repeat(60) + "\n\nworth your time: yes - test";
  const g = gate(body, []);
  check("sentence-case title not a label", !g.problems.some(x => /label title/.test(x)), g.problems);
}
if (fails) { console.log(fails + " failed"); process.exit(1); }
console.log("ok ground-hyphen");
