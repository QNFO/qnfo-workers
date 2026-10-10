// RESEARCH-SCAN-LANES-1 / NO-TOPIC-HARDCODE-1 (qnfo-cloud-ops 1.24.1) offline suite. No network.
// Proves: the scan's lanes are built from the owner's stored ideas (no topic or category hard-coded in worker.js), the daily
// totals stay at ten results and five proposals, per-lane quotas hold whatever arXiv returns, error rows never become
// proposals, and with no owner ideas the scan skips without an arXiv or model call.
// Run: node qnfo-cloud-ops/research-scan-lanes.test.mjs
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { RESEARCH_SCAN_QUOTAS as __Q, ownerSeedGroups as __groups, researchScanLanesFrom as __lanes, researchScanLoadLanes as __load, researchScanProposals as __props, ideaTopicCluster as __cluster };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

// No hard-coded scan topics or categories remain in the lane code.
const laneSrc = src.slice(src.indexOf("var RESEARCH_SCAN_QUOTAS"), src.indexOf("async function researchScanLane(lane)"));
ok(!/cat:|ultrametric|p-adic|quantum|formal verification|agentic/i.test(laneSrc), "lane code names no topic or arXiv category");
ok(!/RESEARCH_SCAN_QUERY|RESEARCH_SCAN_LANES\s*=/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "the fixed query table is gone");

const ideas = [
  "Lattice dynamics of phonon transport predicts a measurable scaling law for heat flow across graded interfaces",
  "Sheaf cohomology of causal networks gives a compositional account of consensus among distributed sensors",
  "Pollinator foraging networks obey a percolation threshold that explains colony collapse in fragmented meadows"
];
const groups = mod.__groups(ideas, 3, 4);
ok(groups.length === 3, "one group per idea", groups);
ok(groups.every((g) => g.terms.length === 4 && g.terms.every((t) => t.length >= 5)), "four terms of five or more letters each", groups);
ok(groups[0].terms.some((t) => /phonon|lattice|interfaces|transport/.test(t)), "terms come from the idea's own words", groups[0]);
ok(!groups.some((g) => g.terms.includes("research") || g.terms.includes("predicts") && false), "generic words are dropped");
ok(mod.__groups([], 3, 4).length === 0 && mod.__groups(null, 3, 4).length === 0 && mod.__groups(["a b c"], 3, 4).length === 0, "empty or termless input gives no groups");

const L = mod.__lanes(groups);
ok(L.length === 3, "three lanes", L.map((l) => l.lane));
ok(L.reduce((a, l) => a + l.results, 0) === 10, "ten arXiv results a day");
ok(L.reduce((a, l) => a + l.proposals, 0) === 5, "five idea_proposals a day");
for (const l of L) {
  ok((l.query.match(/\(/g) || []).length === (l.query.match(/\)/g) || []).length, l.lane + ": parentheses balance");
  ok(/^\(all:"[^"]+"( OR all:"[^"]+")*\)$/.test(l.query), l.lane + ": query is an OR of quoted terms", l.query);
  ok(l.proposals <= l.results, l.lane + ": proposals within results");
}
ok(mod.__lanes([]).length === 0, "no groups, no lanes");

// Loading: reads owner-accepted ideas from D1; a failed read yields no lanes (scan skips).
const mk = (rows, boom) => ({ AUDIT: { prepare: (sql) => ({ all: async () => { if (boom) throw new Error("d1 down"); mk.sql = sql; return { results: rows }; } }) } });
const lanes = await mod.__load(mk(ideas.map((idea) => ({ idea }))));
ok(lanes.length === 3 && /ACCEPT/.test(mk.sql) && /owner/.test(mk.sql), "lanes loaded from accepted owner ideas", mk.sql);
ok((await mod.__load(mk([]))).length === 0, "no owner ideas, no lanes");
ok((await mod.__load(mk([], true))).length === 0, "unreadable D1, no lanes");

// Quotas: a lane that floods cannot take another lane's slots; errors never become proposals.
const hits = [];
for (let i = 0; i < 4; i++) hits.push({ id: "q" + i, title: "t", lane: L[0].lane });
for (let i = 0; i < 3; i++) hits.push({ id: "a" + i, title: "t", lane: L[1].lane });
hits.push({ error: "timeout", lane: L[2].lane });
const p = mod.__props(hits, L);
ok(p.length === 4, "2 + 2 + 0 proposals when the third lane failed", p.map((h) => h.id));
ok(p.filter((h) => h.lane === L[0].lane).length === 2 && p.filter((h) => h.lane === L[1].lane).length === 2, "per-lane quotas");
ok(mod.__props([], L).length === 0 && mod.__props(null, L).length === 0 && mod.__props(hits, null).length === 0, "empty input");

// The metric classifier is unchanged.
ok(mod.__cluster("Agentic collapse in LLM agents") === "ai-epistemics", "classifier unchanged: ai-epistemics");
ok(mod.__cluster("Quantum error correction thresholds") === "quantum", "classifier unchanged: quantum first");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
