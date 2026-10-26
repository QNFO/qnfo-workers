// READING-NO-SOURCE-LEDE-1 offline suite (personal-companion 1.40.0, charter pillar: personal). The owner (2026-10-21): "you also don't
// need to say lead every article was from Wikipedia". Proves: the writer prompt no longer asks the lede to name its source; stored pieces
// lose the credit clause at display time only; a sentence about the article itself is left alone; the piece page lists its sources.
// Run: node personal-companion/no-source-lede.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

ok(/Never credit or name the source document in the lede/.test(V.prompts.P_STYLE), "the writer prompt forbids crediting the source in the lede");
ok(!/name the source in plain words/.test(V.prompts.P_STYLE), "the old 'name the source' instruction is gone");

const cases = [
  ["Associação Ferroviária de Esportes is a football club in Araraquara, according to the Wikipedia article on it.", "Associação Ferroviária de Esportes is a football club in Araraquara."],
  ["Pamela Gorman is a former Arizona state senator, according to the Wikipedia article on her.", "Pamela Gorman is a former Arizona state senator."],
  ["According to the Wikipedia article on Herz Cerfbeer, he was a French Jewish philanthropist.", "He was a French Jewish philanthropist."],
  ["The club won in 1950. According to the arXiv paper, the model fails at scale.", "The club won in 1950. The model fails at scale."],
  ["Lattice surgery joins two patches, as described in the arXiv paper titled Fast Surgery.", "Lattice surgery joins two patches."],
];
for (const [inp, want] of cases) ok(V.plainCredit(inp) === want, "credit clause dropped: " + inp.slice(0, 40), V.plainCredit(inp));
const keep = "The Wikipedia article on the Corlea Trackway describes an Iron Age road.";
ok(V.plainCredit(keep) === keep, "a sentence whose subject is the article is left alone");
ok(V.plainCredit("Wikipedia volunteers edit the page daily.") === "Wikipedia volunteers edit the page daily.", "Wikipedia as a subject is untouched");

const foot = V.sourcesFoot(JSON.stringify({ refs: ["https://en.wikipedia.org/wiki/Corlea_Trackway", "https://arxiv.org/abs/2401.00001", "javascript:alert(1)"] }));
ok(/Sources:/.test(foot) && /Corlea Trackway \(Wikipedia\)/.test(foot) && /arXiv 2401\.00001/.test(foot), "the footer lists the sources in plain words", foot);
ok(!/javascript:/.test(foot), "only https references are linked");
ok(V.sourcesFoot("not json") === "" && V.sourcesFoot(null) === "", "a missing or broken anchor_json gives no footer");

const html = V.renderPiece({ slug: "s", form: "essay", day: "2026-10-26", word_count: 900, title: "Ferroviária", lede: cases[0][0], body_md: "The club was founded in 1950.", anchor_json: JSON.stringify({ refs: ["https://en.wikipedia.org/wiki/Ferroviária"] }) }, "");
ok(!/according to the Wikipedia article/i.test(html) && /class=lede>Associação Ferroviária de Esportes is a football club in Araraquara\.</.test(html) && /class=src>Sources:/.test(html), "the piece page shows the plain lede and the sources footer", html.slice(0, 300));

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
