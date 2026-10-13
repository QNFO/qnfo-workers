// CITE-FULLTEXT-1 offline suite (qnfo-research-exec 0.17.0, owner directive 2026-10-13: "Papers shall cite full texts, not
// merely reference work summaries."). No network, synthetic pages. Proves:
//  1. arXiv's LaTeXML HTML becomes sections without the front matter or the work's own bibliography; math keeps its LaTeX;
//  2. the excerpt puts results and conclusions first in rank, keeps document order, and stays within its cap;
//  3. arxivFullText reads arxiv.org/html, falls back to ar5iv, and tells a refusal (transport) from a work with no HTML;
//  4. attachFullTexts cites only works whose full text was read and renumbers them; a QNFO entry is read from its body;
//  5. the phrasing of a summary-only citation (papers.qnfo.org ...continuum-ph, ref 6) is a HARD final-gate finding, and
//     ordinary mathematical prose about existence is not;
//  6. the daily sweep and the provenance section carry the rule.
// Run: node qnfo-research-exec/cite-fulltext.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { fullTextSections, fullTextExcerpt, mdSections, corpusSummary, arxivFullText, attachFullTexts, summaryOnlyCitations, finalGates, provenanceSection } from "./worker.js";

globalThis.setTimeout = (fn) => { fn(); return 0; };
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const sec = (n, head, text) => `<section id="S${n}" class="ltx_section"><h2 class="ltx_title ltx_title_section"><span class="ltx_tag">${n} </span>${head}</h2><div class="ltx_para"><p class="ltx_p">${text}</p></div></section>`;
const page = (body) => `<!DOCTYPE html><html><head><title>t</title><style>.x{}</style></head><body><nav>menu</nav><h1 class="ltx_title ltx_title_document">A Work</h1><div class="ltx_abstract"><h6>Abstract</h6><p>Front matter abstract.</p></div>${body}<section class="ltx_bibliography" id="bib"><h2 class="ltx_title">References</h2><ul><li>[1] Someone else &amp; co.</li></ul></section><script>var a=1;</script></body></html>`;
const LONG = (s, n) => Array.from({ length: n }, () => s).join(" ");
const HTML = page(sec(1, "Introduction", LONG("Computable reals are the limits of computable Cauchy sequences with a computable modulus.", 20)) + sec(2, "Setup", LONG("We fix a Turing machine model and a precision oracle.", 20)) + sec(3, "Main Results", "The error is bounded by <math alttext=\"2^{-n}\" display=\"inline\"><msup><mn>2</mn></msup></math> for every input &lt;x&gt;. " + LONG("Every measured quantity is reproduced to the stated precision.", 20)) + sec(4, "Conclusion", LONG("Uncountability plays no operational role in the predictions examined.", 20)));

// 1. sections
{
  const s = fullTextSections(HTML);
  ok(s.map((x) => x.head).join("|") === "1 Introduction|2 Setup|3 Main Results|4 Conclusion", "the four numbered sections are read in order", s.map((x) => x.head));
  const all = s.map((x) => x.text).join(" ");
  ok(!/Front matter abstract|Someone else|menu|var a=1|\.x\{\}/.test(all), "front matter, nav, script, style and the work's own bibliography are left out", all.slice(0, 200));
  ok(/bounded by \$2\^\{-n\}\$ for every input <x>\./.test(all), "math keeps its LaTeX and entities are decoded", all.match(/bounded by.{0,40}/));
}
// 2. excerpt
{
  const s = fullTextSections(HTML);
  const ex = fullTextExcerpt(s, 2600);
  ok(ex.length <= 2600, "the excerpt stays within its cap", ex.length);
  ok(/§ 3 Main Results:/.test(ex) && /§ 4 Conclusion:/.test(ex) && /§ 1 Introduction:/.test(ex), "results, conclusion and introduction are excerpted", ex.slice(0, 300));
  ok(!/§ 2 Setup:/.test(ex), "a lower-ranked section yields to the cap", ex);
  ok(ex.indexOf("§ 1 Introduction") < ex.indexOf("§ 3 Main Results") && ex.indexOf("§ 3 Main Results") < ex.indexOf("§ 4 Conclusion"), "excerpts are printed in document order");
  const md = mdSections("# T\n\n## Abstract\n\nskip me " + "x ".repeat(40) + "\n\n## 5. Results\n\n" + LONG("A body result.", 10) + "\n\n## References\n\n[1] " + "y ".repeat(40) + "\n\n## Provenance and AI Involvement\n\n" + "z ".repeat(40));
  ok(md.length === 1 && md[0].head === "5. Results", "a QNFO body yields its sections without Abstract, References or Provenance", md.map((x) => x.head));
}
// 3. fetch path
{
  const calls = [];
  const mk = (map) => async (url) => { calls.push(url); const f = map(url); return f; };
  let r = await arxivFullText("arXiv:2501.00001v2", { spacingMs: 0, fetch: mk((u) => new Response(u.startsWith("https://arxiv.org/html/") ? HTML : "no", { status: u.startsWith("https://arxiv.org/html/") ? 200 : 404 })) });
  ok(r.ok && r.url === "https://arxiv.org/html/2501.00001v2" && r.sections === 4 && /Main Results/.test(r.excerpt), "arxiv.org/html is read first", r);
  calls.length = 0;
  r = await arxivFullText("arXiv:1706.03762", { spacingMs: 0, fetch: mk((u) => u.startsWith("https://ar5iv") ? new Response(HTML) : new Response("Not Found", { status: 404 })) });
  ok(r.ok && r.url === "https://ar5iv.labs.arxiv.org/html/1706.03762" && calls.length === 2, "ar5iv is the second host", { r, calls });
  r = await arxivFullText("arXiv:1706.03762", { spacingMs: 0, fetch: async () => new Response(page(""), { status: 200 }) });
  ok(!r.ok && !r.transport, "a page with no sections is no full text and no transport failure", r);
  r = await arxivFullText("arXiv:1706.03762", { spacingMs: 0, fetch: async () => new Response("Rate exceeded.", { status: 503 }) });
  ok(!r.ok && r.transport, "a refusal is a transport failure", r);
}
// 4. attach
{
  const fetchFn = async (u) => /2501\.00002/.test(u) ? new Response("Not Found", { status: 404 }) : new Response(HTML);
  const bib = [
    { n: 1, id: "arXiv:2501.00001", text: "arXiv:2501.00001 | One\n  abs one" },
    { n: 2, id: "arXiv:2501.00002", text: "arXiv:2501.00002 | Two (no HTML anywhere)\n  abs two" },
    { n: 3, id: "arXiv:2501.00003", text: "arXiv:2501.00003 | Three\n  abs three" },
    { n: 4, id: "doi:10.9999/q.1", text: "QNFO: Four\n  abs four", body: "## 5. Results\n\n" + LONG("The corpus result holds at n = 12.", 30), url: "https://papers.qnfo.org/papers/four" },
    { n: 5, id: "qnfo:five", text: "QNFO: Five\n  abs five", body: "" }
  ];
  const out = await attachFullTexts(bib, { spacingMs: 0, fetch: fetchFn });
  ok(out.bib.map((b) => b.n + b.id).join(",") === "1arXiv:2501.00001,2arXiv:2501.00003,3doi:10.9999/q.1", "only works with full text are cited, renumbered from 1", out.bib.map((b) => b.id));
  ok(out.stat.candidates === 5 && out.stat.arxiv === 2 && out.stat.qnfo === 1 && out.stat.dropped === 2 && out.stat.transport === 0, "the counts are kept for the ground-fulltext event", out.stat);
  ok(/^arXiv:2501\.00001 \| One\n  abs one\n  Full text \(https:\/\/arxiv\.org\/html\/2501\.00001\), excerpts of its own sections:\n  § 1 Introduction: /.test(out.bib[0].text), "the entry keeps its title line and abstract, then the full-text excerpts", out.bib[0].text.slice(0, 260));
  ok(/Full text \(https:\/\/papers\.qnfo\.org\/papers\/four\)[\s\S]*§ 5\. Results: The corpus result holds at n = 12\./.test(out.bib[2].text), "a QNFO entry is excerpted from its body", out.bib[2].text.slice(0, 260));
}
// 5. gate
{
  const LIVE = "Reference [6] addresses computable analysis. The summary supplied gives no further detail on the paper's specific results, so we cite it only for the existence and framing of this research direction.";
  const hits = summaryOnlyCitations(LIVE);
  ok(hits.length >= 2 && /summary supplied gives no further detail/.test(hits[0]), "the live sentence from ref 6 is caught and quoted", hits);
  for (const t of ["The abstract does not specify the bound [4].", "We cite [2] merely for its existence as a framework.", "The provided summary of [3] gives no numbers."]) ok(summaryOnlyCitations(t).length > 0, "caught: " + t);
  for (const t of ["The lemma is needed only for the existence of a fixed point.", "Theorem 2 gives the existence of a computable modulus; its framing follows [5].", "The summary statistic gives no bias at n = 10."]) ok(summaryOnlyCitations(t).length === 0, "ordinary prose is not caught: " + t, summaryOnlyCitations(t));
  const g = finalGates("# T\n\n## 2. Background\n\n" + LIVE + "\n", { bibCount: 8, minChars: 10 });
  const f = g.fixes.find((x) => x.id === "gate-fulltext-citation");
  ok(f && f.severity === "HARD" && /CITE-FULLTEXT-1/.test(f.reason) && /full-text excerpts/.test(f.fix), "the final gate files a HARD gate-fulltext-citation finding", f);
  ok(!finalGates("# T\n\n## 2. Background\n\n[6] proves that every computable real has a computable modulus.\n", { bibCount: 8, minChars: 10 }).fixes.some((x) => x.id === "gate-fulltext-citation"), "a citation from the full text passes");
}
// 5b. CITE-FULLTEXT-2: the corpus is always read in full text, and the sentence from entries [11]/[12] is a HARD finding.
{
  const LIVE2 = "Entry [11], The \u211a-vs-\u211d Question: Why Physical Law Requires Only the Rational Numbers, is supplied with an empty summary; we note its title-level thesis \u2014 that physical law requires only the rationals \u2014 as the most radical version of the computable-sufficiency position, and we relate to it only through that title, since no further detail is available. Entry [12], COMMUTATIVE PHYSICS, likewise has an empty summary and is listed here only to acknowledge the corpus; no claim of ours depends on it.";
  ok(summaryOnlyCitations(LIVE2).length === 5, "the [11]/[12] sentence is caught on several counts", summaryOnlyCitations(LIVE2));
  for (const t of ["Entry [4] has no summary; we cite it for context.", "No abstract is available for [9]."]) ok(summaryOnlyCitations(t).length > 0, "caught: " + t);
  for (const t of ["We report no summary statistic beyond the mean.", "Table 2 lists the abstract algebra used.", "Section 3 has no abstract dependence on the title."]) ok(summaryOnlyCitations(t).length === 0, "ordinary prose is not caught: " + t, summaryOnlyCitations(t));
  // A memo with a ## Abstract section and a null abstract column (qnr-justification-memo).
  const memo = "\uFEFF# The Q-vs-R Question\n\n**Author:** QNFO\n\n---\n\n## Abstract\n\n" + LONG("Measurements yield rationals, so the base field is Q.", 6) + "\n\n**Keywords:** x\n\n---\n\n## 1. Measurement Finitude\n\n" + LONG("Every instrument reports finitely many digits.", 30);
  ok(/^Measurements yield rationals/.test(corpusSummary(null, memo)), "a null abstract falls back to the body's Abstract section", corpusSummary(null, memo).slice(0, 80));
  ok(corpusSummary("A real abstract of the work that is long enough.", memo).startsWith("A real abstract"), "a stored abstract is used as it is");
  ok(mdSections(memo).some((x) => x.head === "1. Measurement Finitude"), "the memo's sections are read", mdSections(memo).map((x) => x.head));
  const bare = LONG("A body with no heading at all still states its result: the bound is 3.", 80);
  const bs = mdSections(bare);
  ok(bs.length >= 3 && bs[0].head === "Text, part 1" && corpusSummary("", bare).startsWith("A body with no heading"), "a body with no heading is read as passages", bs.map((x) => x.head));
  const bold = "# Title\n\n**1. Introduction**\n\n" + LONG("Bold-numbered heading body.", 20) + "\n\n**2. Results**\n\n" + LONG("The result is 7.", 30);
  ok(mdSections(bold).map((x) => x.head).join("|") === "1. Introduction|2. Results", "bold numbered headings are headings", mdSections(bold).map((x) => x.head));
  const out = await attachFullTexts([{ n: 1, id: "qnfo:bare", text: "QNFO: Bare\n  " + corpusSummary("", bare).slice(0, 400), body: bare, url: "https://papers.qnfo.org/papers/bare" }], { spacingMs: 0 });
  ok(out.bib.length === 1 && /§ Text, part 1: A body with no heading/.test(out.bib[0].text), "a heading-less corpus paper is cited with its full-text excerpts, not dropped", out.bib[0] && out.bib[0].text.slice(0, 200));
}
// 6. sweep, prompts and provenance
{
  const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const a = src.indexOf("async function completenessSweep(env)"), b = src.indexOf("return out;", a);
  const sw = src.slice(a, b);
  ok(/summaryOnlyCitations\(p\.body_md\)/.test(sw) && /if \(pc\.complete && !so\.length\) continue;/.test(sw), "the daily sweep queues a rewrite for a summary-only citation");
  ok(!/the summary supplied gives no further detail, and relate/.test(src) && !/where an entry is thin say so/.test(src), "no prompt asks for a thin-summary note any more");
  const prov = provenanceSection({ ran: false });
  ok(/full text was retrieved/.test(prov) && !/restricted to its retrieved title and abstract\./.test(prov), "the provenance section says the full text was read", prov);
  ok(summaryOnlyCitations(prov).length === 0, "the provenance section does not trip its own gate");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
