// CITE-GRAPH-1 / GROUND-WIDTH-1 / CITE-PROV-1 offline suite (qnfo-research-exec 0.18.18, agent_issues 2404 family).
// No network, synthetic data. Proves:
//  1. corpusWidth defaults to 4 (the old hard cap) and clamps to 0..12, so a typo can neither empty the corpus nor flood
//     the grounding block with 900 papers;
//  2. citationRowsFromBib turns the grounding bibliography into graph rows: an own-corpus entry carries its slug and
//     canonical URL, an arXiv entry carries its abs URL, and a DOI entry keeps its DOI;
//  3. a title is recovered from the rendered label when the bibliography object carries none, and an own-corpus entry
//     that names no slug still yields one from its URL (CITE-PROV-1: before this an own reference was a bare title);
//  4. the wiring survives: stageGround writes citations.json, publishStageV2 persists it and keeps the publish quota
//     brake, and the review prompt carries the citation-consistency instruction.
// Run: node qnfo-research-exec/citation-graph.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

function load() {
  const a = src.indexOf("// CITE-GRAPH-1 + GROUND-WIDTH-1 helpers");
  const b = src.indexOf("async function stageGround(env, row) {");
  if (a < 0 || b < a) throw new Error("CITE-GRAPH-1 helper block not found");
  const ctx = vm.createContext({ String, Object, Array, Number, JSON, Math });
  return vm.runInContext("(function(){\n" + src.slice(a, b) + "\nreturn { corpusWidth, citationRowsFromBib };})()", ctx);
}
const G = load();

// 1. width
{
  ok(G.corpusWidth(undefined) === 4, "absent config keeps the historical cap of 4");
  ok(G.corpusWidth(null) === 4, "null config keeps 4");
  ok(G.corpusWidth("8") === 8, "a configured width is honoured", G.corpusWidth("8"));
  ok(G.corpusWidth("0") === 0, "0 is a legal width (corpus search off), not a fallback", G.corpusWidth("0"));
  ok(G.corpusWidth("-3") === 0, "a negative width clamps to 0", G.corpusWidth("-3"));
  ok(G.corpusWidth("99") === 12, "an oversized width clamps to 12", G.corpusWidth("99"));
  ok(G.corpusWidth("abc") === 4, "garbage falls back to 4", G.corpusWidth("abc"));
}

// 2/3. rows from the bibliography
{
  const bib = [
    { n: 1, id: "arXiv:2608.00249", text: "arXiv:2608.00249 | Dynamical principles of habituation across substrates\n  abstract text" },
    { n: 9, id: "qnfo:head-over-hands", text: "QNFO: Head Over Hands | https://papers.qnfo.org/papers/head-over-hands\n  summary", body: "x", url: "https://papers.qnfo.org/papers/head-over-hands", slug: "head-over-hands", title: "Head Over Hands" },
    { n: 10, id: "qnfo:some-title", text: "QNFO: Some Title | https://papers.qnfo.org/papers/some-title\n  summary" },
    { n: 11, id: "doi:10.1234/abc", text: "QNFO: Doi Paper | DOI 10.1234/abc | https://papers.qnfo.org/papers/doi-paper\n  s" }
  ];
  const rows = G.citationRowsFromBib(bib);
  ok(rows.length === 4, "one row per bibliography entry", rows.length);
  ok(rows[0].kind === "arxiv" && rows[0].url === "https://arxiv.org/abs/2608.00249", "an arXiv entry keeps its id and gets an abs URL", rows[0]);
  ok(rows[0].title === "Dynamical principles of habituation across substrates", "a title is recovered from the rendered label", rows[0].title);
  ok(rows[1].kind === "qnfo" && rows[1].slug === "head-over-hands", "an own-corpus entry carries its slug", rows[1]);
  ok(rows[1].url === "https://papers.qnfo.org/papers/head-over-hands", "an own-corpus entry carries its canonical URL", rows[1].url);
  ok(rows[2].slug === "some-title" && rows[2].kind === "qnfo", "a slug is recovered from the URL when the entry names none", rows[2]);
  ok(rows[2].title === "Some Title", "the recovered title drops the trailing URL", rows[2].title);
  ok(rows[3].doi === "10.1234/abc", "a DOI id is kept as a DOI", rows[3].doi);
  ok(rows[3].title === "Doi Paper", "the recovered title stops before the DOI", rows[3].title);
  ok(rows.every((r) => r.n >= 1), "every row has a reference number", rows.map((r) => r.n));
  const bare = G.citationRowsFromBib([{ id: "arXiv:1234.5678", text: "arXiv:1234.5678 | T" }]);
  ok(bare[0].n === 1, "a missing n falls back to the row order", bare[0].n);
  ok(G.citationRowsFromBib(null).length === 0 && G.citationRowsFromBib([]).length === 0, "no bibliography yields no rows");
}

// 4. wiring
{
  ok(/rid \+ "\/citations\.json"/.test(src), "stageGround writes citations.json beside grounding.md");
  ok(/async function persistCitations\(env, row, slug\)/.test(src), "persistCitations exists");
  ok(/CREATE TABLE IF NOT EXISTS paper_citations/.test(src), "the graph table is created idempotently");
  ok(/await persistCitations\(env, row, slug\)/.test(src), "publish calls persistCitations");
  ok(/INSERT OR REPLACE INTO paper_citations/.test(src), "a re-publish replaces rows instead of doubling them");
  ok(/DELETE FROM citations WHERE paper_id=\?1/.test(src), "the per-paper bibliography is replaced whole");
  ok(/PUBLISH-QUOTAS-1/.test(src) && /'publish_quotas'/.test(src), "the per-property publish quota brake stays on main");
  ok(/CITATION CONSISTENCY \(required check\)/.test(src), "the reviewer is told to compare against cited QNFO work");
  ok(/ground-corpus/.test(src) && /_corpusErr/.test(src), "a corpus search that keeps nothing is logged, not swallowed");
  ok(/research_ground_corpus_k/.test(src), "the corpus width is configurable without a deploy");
  ok(!/slugs\.length >= 4\) break;/.test(src), "the old hard cap of 4 is gone");
  // KG-INGEST-1: the graph gets a node and CITES edges on publish, not only an update-if-exists.
  ok(/INSERT OR IGNORE INTO nodes \(id, label, name, properties, created_at, updated_at\)/.test(src), "publish creates the Paper node idempotently");
  ok(/INSERT OR IGNORE INTO edges \(id, source_id, target_id, relationship_type, properties, created_at\)/.test(src) && /'CITES'/.test(src), "publish writes one CITES edge per cited own-corpus work");
  ok(/"cites:" \+ slug \+ ":" \+ cs/.test(src), "the edge id is namespaced by citing and cited slug (idempotent, no collision)");
  ok(/"paper:" \+ slug/.test(src) && /"paper:" \+ cs/.test(src), "KG node ids use the existing paper:<slug> convention (1,021 such nodes)");
  ok(/if \(env\.GRAPH_DB\)/.test(src), "the KG write is guarded by the binding, so a missing binding cannot break a publish");
  // CORPUS-LEVERAGE-1: the signal exists and is durable.
  ok(/CREATE VIEW IF NOT EXISTS v_paper_influence/.test(src), "inbound citation is exposed as a view");
  ok(/CREATE TABLE IF NOT EXISTS corpus_leverage/.test(src), "the signal is snapshotted daily");
  ok(/var CORPUS_TERMINAL_GRACE_DAYS = 14;/.test(src), "a terminal paper has a named grace window");
  ok(/await refreshPaperInfluence\(env\)/.test(src), "publish refreshes the signal");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
