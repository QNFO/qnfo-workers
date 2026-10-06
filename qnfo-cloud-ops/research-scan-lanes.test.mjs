// RESEARCH-SCAN-LANES-1 (qnfo-cloud-ops 1.21.0) offline suite. No network.
// Proves: three lanes, the quantum lane is RESEARCH_SCAN_QUERY unchanged, the totals stay at ten results and five
// proposals a day (no added model call), per-lane quotas hold whatever arXiv returns, and error rows never become
// proposals. Run: node qnfo-cloud-ops/research-scan-lanes.test.mjs
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { RESEARCH_SCAN_QUERY as __Q, RESEARCH_SCAN_LANES as __L, researchScanProposals as __props, ideaTopicCluster as __cluster };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const L = mod.__L;
ok(L.length === 3, "three lanes", L.map((l) => l.lane));
ok(L[0].lane === "quantum-energy" && L[0].query === mod.__Q, "the quantum lane is RESEARCH_SCAN_QUERY unchanged");
ok(L.reduce((a, l) => a + l.results, 0) === 10, "ten arXiv results a day, as before");
ok(L.reduce((a, l) => a + l.proposals, 0) === 5, "five idea_proposals a day, as before");
for (const l of L) {
  ok((l.query.match(/\(/g) || []).length === (l.query.match(/\)/g) || []).length, l.lane + ": parentheses balance");
  ok(/cat:/.test(l.query), l.lane + ": category-bounded");
  ok(l.proposals <= l.results, l.lane + ": proposals within results");
}
ok(/cat:cs\.AI/.test(L[1].query) && /agentic/.test(L[1].query), "AI lane covers cs.AI and agentic work");
ok(/cat:cs\.LO/.test(L[2].query) && /theorem proving/.test(L[2].query), "formal lane covers cs.LO and theorem proving");

// Quotas: a lane that floods cannot take another lane's slots; errors never become proposals.
const hits = [];
for (let i = 0; i < 4; i++) hits.push({ id: "q" + i, title: "t", lane: "quantum-energy" });
for (let i = 0; i < 3; i++) hits.push({ id: "a" + i, title: "t", lane: "ai-agents-epistemics" });
hits.push({ error: "timeout", lane: "formal-verification" });
const p = mod.__props(hits);
ok(p.length === 4, "2 + 2 + 0 proposals when the formal lane failed", p.map((h) => h.id));
ok(p.filter((h) => h.lane === "quantum-energy").length === 2 && p.filter((h) => h.lane === "ai-agents-epistemics").length === 2, "per-lane quotas");
ok(mod.__props([]).length === 0 && mod.__props(null).length === 0, "empty input");

// The classifier is unchanged, so idea_topic_concentration_30d can only move if accepted ideas actually diversify.
ok(mod.__cluster("Agentic collapse in LLM agents") === "ai-epistemics", "AI paper classifies as ai-epistemics");
ok(mod.__cluster("Quantum error correction thresholds") === "quantum", "quantum still first");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
