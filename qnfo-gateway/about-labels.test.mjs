// ABOUT-LABEL-TRUNC-1 (agent_issues 100158): the "How to check the work" section of /about labels every paper link with the
// paper's full title. The last link used the slug cut at its length limit ("... via distinct lo"). Source-level check on the
// served page text; run: node qnfo-gateway/about-labels.test.mjs -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log("FAIL: " + msg); } }

const at = src.indexOf("<h2>How to check the work</h2>");
ok(at > 0, "the section exists");
const sec = src.slice(at, src.indexOf("</p>", at));
const links = [...sec.matchAll(/<a href="https:\/\/papers\.qnfo\.org\/papers\/([a-z0-9-]+)">([^<]*)<\/a>/g)].map(function (m) { return { slug: m[1], label: m[2] }; });
ok(links.length === 5, "five paper links, got " + links.length);

const titles = {
  "joules-per-solution-metric": "Joules-per-Solution Metric",
  "universal-ignorance-audit": "Universal Ignorance Audit",
  "ai4metascience-ignorance-audit": "Epistemic Legibility in AI-Assisted Science",
  "quniverse-fleet-lessons": "Operating the Quniverse Fleet",
  "falsifying-geometrically-inspired-quantum-error-correcting-codes-via-distinct-lo": "Falsifying Geometrically Inspired Quantum Error-Correcting Codes via Distinct Logical-Error Scaling",
};
for (const l of links) {
  ok(titles[l.slug] === l.label, "label of " + l.slug + " is its full title, got '" + l.label + "'");
  ok(l.label !== l.label.toLowerCase(), "label of " + l.slug + " is not a lower-cased slug");
  ok(!/\s(lo|distinct lo)$/.test(l.label), "label of " + l.slug + " is not cut mid-word");
}
ok(!sec.includes("via distinct lo<"), "no truncated label remains");

const mirror = readFileSync(join(here, "deployed-current.worker.js"), "utf8");
ok(mirror === src, "deployed-current.worker.js is identical to worker.js");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
