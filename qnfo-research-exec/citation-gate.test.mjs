// CITATION-EXISTENCE-GATE-1 (agent_issues 2052) offline suite. No network: fetch is a stub. The fixtures are the citations of
// the 2026-10-04 draft that triggered the issue: arXiv 2606.31097 does not exist, 1606.06965 is a real paper that does not
// support the crossing-law claim (existence cannot catch that, and the suite pins that limit), the rest are real.
// Run: node qnfo-research-exec/citation-gate.test.mjs   -> prints "N passed, 0 failed"
import { citationGate, extractRefs, titleAgrees, describeFailures } from "./citation-gate.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

const ARXIV = {
  "1004.1483": "A derivation of quantum theory from physical requirements",
  "0911.0695": "Quantum Theory and Beyond: Is Entanglement Special?",
  "1011.6451": "Informational derivation of Quantum Theory",
  "1303.1538": "Reconstructing Quantum Theory",
  "1606.06965": "Recursive Distinctioning",
};
const atom = (ids) => '<?xml version="1.0"?><feed>' + ids.map((id) => ARXIV[id]
  ? "<entry><id>http://arxiv.org/abs/" + id + "v2</id><title>" + ARXIV[id] + "</title></entry>"
  : "<entry><id>http://arxiv.org/api/errors#incorrect_id_format_for_" + id + "</id><title>Error</title></entry>").join("") + "</feed>";
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
const stub = (over) => async (url) => {
  const u = String(url);
  if (over && over[u]) { const o = over[u]; if (o instanceof Error) throw o; return o; }
  if (u.startsWith("https://export.arxiv.org/api/query")) return res(200, atom(decodeURIComponent(u.split("id_list=")[1]).split(",")));
  if (u.startsWith("https://doi.org/api/handles/10.1103/PhysRevA.84.012311")) return res(200, '{"responseCode":1}');
  if (u.startsWith("https://doi.org/api/handles/10.9999/")) return res(404, '{"responseCode":100}');
  if (u.startsWith("https://api.crossref.org/works/10.1103/PhysRevA.84.012311")) return res(200, '{"message":{"title":["Informational derivation of quantum theory"]}}');
  if (u === "https://plato.stanford.edu/entries/qt-quantlog/") return res(200, "ok");
  if (u === "https://example.org/gone") return res(404, "nope");
  if (u === "https://example.org/blocked") return res(403, "nope");
  return res(200, "ok");
};

const BAD = [
  "Masanes and Müller and Dakić and Brukner reach the same result ([arXiv 2606.31097](https://arxiv.org/pdf/2606.31097)).",
  "- [Generalised Probabilistic Theories, arXiv 2606.31097](https://arxiv.org/pdf/2606.31097)",
].join("\n");
const GOOD = [
  "Masanes and Müller ([arXiv 1004.1483](https://arxiv.org/abs/1004.1483)) and Dakić and Brukner ([arXiv 0911.0695](https://arxiv.org/abs/0911.0695)).",
  "- [Chiribella, D’Ariano, Perinotti: Informational derivation of quantum theory, arXiv 1011.6451](https://arxiv.org/pdf/1011.6451)",
  "- [Hardy: Reconstructing Quantum Theory, arXiv 1303.1538](https://arxiv.org/pdf/1303.1538)",
  "- [Stanford Encyclopedia: Quantum Logic and Probability Theory](https://plato.stanford.edu/entries/qt-quantlog/)",
].join("\n");

{
  const r = extractRefs(BAD);
  ok(r.length === 1 && r[0].kind === "arxiv" && r[0].id === "2606.31097", "one dead id cited three times is one reference", r.map((x) => x.id));
  const g = extractRefs(GOOD);
  ok(g.filter((x) => x.kind === "arxiv").map((x) => x.id).sort().join() === "0911.0695,1004.1483,1011.6451,1303.1538", "all four arXiv ids found in links and bare text", g.map((x) => x.id));
  ok(g.some((x) => x.kind === "url" && x.id.includes("plato.stanford.edu")), "a plain link is a reference");
  ok(!extractRefs("see https://papers.qnfo.org/papers/x/ and https://qnfo.org/a").length, "the fleet's own pages are not citations");
  ok(extractRefs("old style arXiv:quant-ph/0101012v2 here")[0].id === "quant-ph/0101012", "old-style id with a version suffix");
  ok(extractRefs("doi:10.1103/PhysRevA.84.012311.")[0].id === "10.1103/PhysRevA.84.012311", "trailing period stripped from a DOI");
}

{
  const r = await citationGate(BAD, { fetch: stub() });
  ok(!r.pass && !r.retry && r.failures.length === 1 && r.failures[0].id === "2606.31097" && r.failures[0].status === "not-found", "the dead id blocks release and does not retry", r);
  ok(/arxiv 2606\.31097 not-found/.test(describeFailures(r)), "the failure text names the id and the verdict", describeFailures(r));
}

{
  const r = await citationGate(GOOD, { fetch: stub() });
  ok(r.pass && !r.retry && r.failures.length === 0 && r.unverified.length === 0, "the corrected citations pass", r);
  ok(r.refs.filter((x) => x.status === "ok").length === 5, "five references resolved", r.refs.map((x) => x.id + ":" + x.status));
}

{
  // A real id under a label that is about something else is a title mismatch.
  const wrong = "- [Squeezed states of light and photon statistics, arXiv 1004.1483](https://arxiv.org/abs/1004.1483)";
  const r = await citationGate(wrong, { fetch: stub() });
  ok(!r.pass && r.failures[0] && r.failures[0].status === "title-mismatch" && r.failures[0].title === ARXIV["1004.1483"], "label about another paper is a mismatch", r);
  // A bare id with no label is judged on existence only.
  const bare = await citationGate("see [arXiv 1004.1483](https://arxiv.org/abs/1004.1483)", { fetch: stub() });
  ok(bare.pass, "a bare id passes on existence", bare);
  ok(titleAgrees("Hardy Reconstructing Quantum Theory", ARXIV["1303.1538"]).ok, "a short exact label agrees");
  ok(!titleAgrees("Hardy Reconstructing Quantum Theory", "Photon counting statistics in cavities").ok, "an unrelated label disagrees");
}

{
  // The documented limit: a real paper cited for a claim it never makes passes (the reviewer ensemble owns that check).
  const r = await citationGate("The crossing law is described in [Recursive Distinctioning, arXiv 1606.06965](https://arxiv.org/pdf/1606.06965).", { fetch: stub() });
  ok(r.pass, "existence and label agree, so it passes: support for the claim is NOT this gate's job", r);
}

{
  // Network trouble is a retry, never a verdict.
  const down = async (u) => { if (String(u).startsWith("https://export.arxiv.org")) throw new Error("fetch failed"); return res(200, "ok"); };
  const r = await citationGate(GOOD, { fetch: down });
  ok(!r.pass && r.retry && r.failures.length === 0 && r.unverified.some((x) => x.id === "1004.1483"), "arXiv down: retry, no failure", r);
  const e500 = await citationGate("[Page](https://example.org/x)", { fetch: stub({ "https://example.org/x": res(503, "") }) });
  ok(!e500.pass && e500.retry && !e500.failures.length, "a 503 is unverified, not dead", e500);
  const blocked = await citationGate("[Page](https://example.org/blocked)", { fetch: stub() });
  ok(blocked.retry && !blocked.failures.length, "a 403 from a bot-hostile host proves nothing", blocked);
  const gone = await citationGate("[Page](https://example.org/gone)", { fetch: stub() });
  ok(!gone.pass && !gone.retry && gone.failures[0].status === "not-found", "a 404 link blocks release", gone);
}

{
  const d = await citationGate("a doi:10.9999/nothing.here and b doi:10.1103/PhysRevA.84.012311", { fetch: stub() });
  ok(d.failures.length === 1 && d.failures[0].id === "10.9999/nothing.here", "a DOI with no handle fails; a live one passes", d);
  const t = await citationGate("[Chiribella, D’Ariano and Perinotti on quantum fruit salad recipes](https://doi.org/10.1103/PhysRevA.84.012311)", { fetch: stub() });
  ok(!t.pass && t.failures[0].status === "title-mismatch", "a DOI under the wrong label is a mismatch", t);
}

{
  const many = Array.from({ length: 45 }, (_, i) => "[Page " + i + "](https://example.org/p" + i + ")").join("\n");
  const r = await citationGate(many, { fetch: stub(), maxUrls: 40 });
  ok(r.pass && r.skipped.length === 5 && r.refs.filter((x) => x.status === "skipped-over-limit").length === 5, "links over the cap are listed as skipped, never silently dropped", [r.skipped.length]);
}

{
  const none = await citationGate("No references at all. Just prose.", { fetch: stub() });
  ok(none.pass && none.refs.length === 0, "a paper with no citations has nothing to resolve");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
