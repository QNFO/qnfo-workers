// NO-TOPIC-HARDCODE-1 (radar-hub 1.3.3) offline suite for the arXiv radar's seed terms. No network.
// Proves: the radar's query terms, keyword list and classes come from the owner's stored ideas; the helper functions are pure;
// the old fixed tables (WIDE_QUERY, CLASS_KW, CLASS_TITLE) are gone from the source.
// Run: node radar-hub/arxiv-seed.test.mjs
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.startsWith(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\nexport { arxivOwnerGroups as __groups, arxivClassify as __classify, arxivSeedGroups as __load };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const arxivSrc = src.slice(src.indexOf("var ARXIV_SEED_STOPWORDS"), src.indexOf("const QNFO_VERSION = \"qnfo-research-radar"));
ok(!/WIDE_QUERY = '|const CLASS_KW|const CLASS_TITLE|cat:quant|Bruhat|ultrametric/.test(arxivSrc), "the arXiv radar code carries no fixed topic, category or class table");

const ideas = [
  "Lattice dynamics of phonon transport predicts a measurable scaling law for heat flow across graded interfaces",
  "Pollinator foraging networks obey a percolation threshold that explains colony collapse in fragmented meadows"
];
const g = mod.__groups(ideas, 4, 4);
ok(g.length === 2 && g.every((x) => x.terms.length === 4), "one group of four terms per idea", g);
ok(g[0].terms.every((t) => /^[a-z0-9-]{5,}$/.test(t)), "terms are plain lowercase words", g[0]);
ok(mod.__groups([], 4, 4).length === 0 && mod.__groups(null, 4, 4).length === 0, "no ideas, no groups");

const hitText = (g[0].terms[0] + " " + g[0].terms[1] + " unrelated words").toLowerCase();
const c1 = mod.__classify(hitText, g);
ok(c1.top === g[0].label && c1.fit === "core" && c1.score === 2, "two terms of one line of work is core", c1);
const c2 = mod.__classify(g[0].terms[0] + " and " + g[1].terms[0], g);
ok(Object.keys(c2.classes).length === 2 && c2.fit === "core", "two lines of work at once is core", c2);
const c3 = mod.__classify(g[1].terms[2], g);
ok(c3.top === g[1].label && c3.fit === "adjacent", "one term is adjacent", c3);
ok(mod.__classify("nothing relevant", g).top === "other", "no match is other");

const env = { AUDIT: { prepare: (sql) => ({ all: async () => { env.sql = sql; return { results: ideas.map((idea) => ({ idea })) }; } }) } };
ok((await mod.__load(env)).length === 2 && /ACCEPT/.test(env.sql) && /owner/.test(env.sql), "groups load from accepted owner ideas in D1", env.sql);
ok((await mod.__load({})).length === 0, "no D1 binding, no groups");
ok((await mod.__load({ AUDIT: { prepare: () => { throw new Error("down"); } } })).length === 0, "unreadable D1, no groups");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
