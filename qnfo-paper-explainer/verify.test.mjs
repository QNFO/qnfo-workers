// PAPER-VERIFY-1 offline suite (qnfo-paper-explainer 0.3.0): the explainer posts only text whose names, years and figures are in
// the paper's abstract and that two reviewers from other model families find fully supported; a reviewer outage or an unparseable
// reviewer reply posts nothing (fail closed). Run: node qnfo-paper-explainer/verify.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const V = mod.__verify;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const abstract = "We study how a small language model can be trained to sort support tickets. The method reduces labelling effort by 40 percent on three public benchmarks. The authors do not discuss deployment.";
const paper = { id: "2610.01234", title: "Sorting Tickets With Small Models", authors: ["Ada Example", "Bo Sample"], abstract };
const ground = [paper.title, paper.authors.join(", "), abstract].join("\n");

// ---- prompts: process and style only ------------------------------------------------------------------------------------------
const promptText = V.explainRules().join("\n") + V.FACTCHECK_PROMPT;
check("prompts carry no example nouns or invented-timeline labels", !/health|energy|climate|money|\bbills?\b|habit|product|AI tools|SOON|NOW\b|YEARS|NOT_YET|within ~?2 years/.test(promptText), promptText.match(/health|energy|climate|money|\bbills?\b|habit|product|SOON|YEARS/));
check("prompts forbid outside knowledge", /Your own knowledge is not a source/.test(promptText) && /hedged claim the source does not make is still unsupported/.test(promptText));
check("reviewers are not from the writer's family", V.REVIEWERS.every((m) => !/meta|llama/i.test(m)) && V.REVIEWERS.length >= 3);

// ---- deterministic grounding --------------------------------------------------------------------------------------------------
check("grounded text passes", V.groundingProblems("A small language model can be trained to sort support tickets. The method reduces labelling effort by 40 percent. arxiv.org/abs/2610.01234", ground).length === 0, V.groundingProblems("A small language model can be trained to sort support tickets. The method reduces labelling effort by 40 percent.", ground));
const invFig = V.groundingProblems("The method cuts labelling effort by 65 percent.", ground);
check("an invented figure is rejected", invFig.some((p) => /65 percent/.test(p)), invFig);
const invYear = V.groundingProblems("Banks could adopt it by 2028.", ground);
check("an invented year (even hedged, even future) is rejected", invYear.some((p) => /2028/.test(p)), invYear);
const invName = V.groundingProblems("This could help Acme Corp and the Dutch tax office sort mail.", ground);
check("an invented organisation is rejected, hedged or not", invName.some((p) => /Acme/.test(p)) && invName.some((p) => /Dutch/.test(p)), invName);
check("a name present in the source is not flagged", V.groundingProblems("Ada Example and Bo Sample wrote it.", ground).length === 0);
check("an invented timeline figure is rejected", V.groundingProblems("It may reach everyday use within 2 years.", ground).length >= 1);
check("a link to another paper is rejected", V.linkProblems("see arxiv.org/abs/2610.99999", "2610.01234").length === 1 && V.linkProblems("see arxiv.org/abs/2610.01234.", "2610.01234").length === 0);
check("verdict parser: fail without a reason, pass with reasons, junk", V.parseFactVerdict('{"unsupported":[],"verdict":"fail"}').unsupported.length === 1 && V.parseFactVerdict('{"unsupported":["x -- y"],"verdict":"pass"}').verdict === "fail" && V.parseFactVerdict("no json here") === null && V.parseFactVerdict('{"verdict":"maybe"}') === null);

// ---- end to end with mocks ---------------------------------------------------------------------------------------------------
const atom = (ps) => "<feed>" + ps.map((p) => "<entry><id>http://arxiv.org/abs/" + p.id + "</id><published>2026-10-09T00:00:00Z</published><title>" + p.title + "</title><summary>" + p.abstract + "</summary>" + p.authors.map((a) => "<author><name>" + a + "</name></author>").join("") + "</entry>").join("") + "</feed>";
const good = (over) => Object.assign({ arxiv_id: paper.id, headline: "Sorting support tickets with a small model", what_it_is: "A small language model can be trained to sort support tickets, and the method reduces labelling effort by 40 percent on three public benchmarks.", stated_application: "The abstract does not state a practical application.", relevance_label: "NONE_STATED", buffer_post: "A small model can sort support tickets with 40 percent less labelling effort. arxiv.org/abs/2610.01234",
  posts: ["A small language model can be trained to sort support tickets.", "The method reduces labelling effort by 40 percent on three public benchmarks.", "The abstract does not state a practical application.", "Read it: arxiv.org/abs/2610.01234 The authors do not discuss deployment."] }, over || {});
function setup(o) {
  const calls = { ai: [], fetch: [], sql: [] };
  const db = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { calls.sql.push({ sql, a }); return {}; }, first: async () => { calls.sql.push({ sql, a }); return { n: 0, m: 0 }; }, all: async () => { calls.sql.push({ sql, a }); return { results: [] }; } }; return st; } };
  const AI = { run: async (model, input) => {
    const c = input.messages[0].content; calls.ai.push({ model, c });
    if (/strict fact-checker/.test(c)) { const r = o.reviewer(model, c); if (r instanceof Error) throw r; return { response: r }; }
    return { response: JSON.stringify(o.writer(c, calls.ai.filter((x) => x.model.includes("llama")).length)) };
  } };
  globalThis.fetch = async (url, init) => {
    const u = String(url); calls.fetch.push(u);
    if (new URL(u).hostname === "export.arxiv.org") return new Response(atom([paper, { id: "2610.05555", title: "Other", authors: ["C D"], abstract: "Something else." }]), { status: 200 });
    if (u.includes("createSession")) return new Response(JSON.stringify({ accessJwt: "j", did: "did:plc:x" }), { status: 200 });
    if (u.includes("createRecord")) return new Response(JSON.stringify({ uri: "at://x/" + calls.fetch.length, cid: "c" }), { status: 200 });
    return new Response("nf", { status: 404 });
  };
  return { calls, env: { DB: db, AI, BSKY_HANDLE: "h", BSKY_APP_PASS: "p" } };
}
const bskyPosts = (c) => c.fetch.filter((u) => u.includes("createRecord")).length;
const logInserts = (c) => c.sql.filter((s) => /INSERT INTO paper_explain_log/.test(s.sql));
const PASS = '{"unsupported":[],"verdict":"pass"}';

{ // all green: posts
  const t = setup({ writer: () => good(), reviewer: () => PASS });
  const out = await V.run(t.env, { dry: false });
  check("grounded + two passing reviewers posts the thread", out.status === "posted" && bskyPosts(t.calls) === 4 && out.explanation.relevance_label === "NONE_STATED", out);
  check("exactly two reviewers ran, none of them the writer model", t.calls.ai.filter((x) => /strict fact-checker/.test(x.c)).length === 2 && t.calls.ai.filter((x) => /strict fact-checker/.test(x.c)).every((x) => !/llama/.test(x.model)));
}
{ // reviewer outage: fail closed
  const t = setup({ writer: () => good(), reviewer: () => new Error("AI unavailable") });
  const out = await V.run(t.env, { dry: false });
  check("reviewer outage posts nothing", out.status === "unverified" && out.posted !== true && bskyPosts(t.calls) === 0 && !t.calls.fetch.some((u) => u.includes("createSession")), out);
  check("outage writes no log row, so the paper is retried next run", logInserts(t.calls).length === 0);
  check("outage files a fail-closed issue, not a fail-open one", t.calls.sql.some((s) => /agent_issues/.test(s.sql) && /INSERT/.test(s.sql) && /UNAVAILABLE/.test(String(s.a[1]))) && !t.calls.sql.some((s) => /FAILOPEN/.test(String(s.a[1]))));
}
{ // one reviewer down only: still unavailable (needs two)
  const t = setup({ writer: () => good(), reviewer: (m) => (/gemma|qwen/.test(m) ? new Error("down") : PASS) });
  // pool has 4 models, so the fallback pair can still answer; make exactly one model answer to prove two are required
  const only = { n: 0 }; const t2 = setup({ writer: () => good(), reviewer: () => (only.n++ === 0 ? PASS : new Error("down")) });
  const out2 = await V.run(t2.env, { dry: false });
  check("a single valid reviewer verdict is not enough", out2.status === "unverified" && bskyPosts(t2.calls) === 0, out2);
}
{ // garbage reviewer replies
  const t = setup({ writer: () => good(), reviewer: () => "I think it looks fine." });
  const out = await V.run(t.env, { dry: false });
  check("an unparseable reviewer reply is unavailable, not a pass", out.status === "unverified" && bskyPosts(t.calls) === 0, out);
}
{ // invented name and figure in a hedged sentence: deterministic rejection, reviewers never reached on that draft
  const bad = good({ posts: ["A small language model can be trained to sort support tickets.", "It could one day save Acme Corp 65 percent of its sorting costs.", "The abstract does not state a practical application.", "arxiv.org/abs/2610.01234"] });
  const t = setup({ writer: (c, n) => bad, reviewer: () => PASS });
  const out = await V.run(t.env, { dry: false });
  check("an invented name/figure (hedged) is not posted", out.status === "draft" && bskyPosts(t.calls) === 0 && out.issues.some((p) => /Acme/.test(p)) && out.issues.some((p) => /65/.test(p)), out);
  check("one corrective revision was attempted", t.calls.ai.filter((x) => /Independent checkers rejected your draft/.test(x.c)).length === 1);
  check("the withheld draft is logged as draft", logInserts(t.calls).length === 1 && logInserts(t.calls)[0].a[7] === "draft");
}
{ // revision repairs it
  const bad = good({ posts: ["A small language model can be trained to sort support tickets.", "It could save Acme Corp 65 percent.", "The abstract does not state a practical application.", "arxiv.org/abs/2610.01234"] });
  const t = setup({ writer: (c) => (/Independent checkers rejected/.test(c) ? good() : bad), reviewer: () => PASS });
  const out = await V.run(t.env, { dry: false });
  check("a corrected revision that passes the full check is posted", out.status === "posted" && bskyPosts(t.calls) === 4, out);
}
{ // reviewers find an unsupported claim the regex cannot see
  const t = setup({ writer: () => good(), reviewer: () => '{"unsupported":["sort support tickets -- stronger than the source"],"verdict":"fail"}' });
  const out = await V.run(t.env, { dry: false });
  check("one reviewer-found unsupported claim withholds the post", out.status === "draft" && bskyPosts(t.calls) === 0, out);
}
{ // invented application is not allowed to pass as STATED_APPLICATION when the abstract has none
  const t = setup({ writer: () => good({ relevance_label: "STATED_APPLICATION", stated_application: "It will cut household costs." }), reviewer: (m, c) => (/household costs/.test(c) ? '{"unsupported":["household costs -- not in source"],"verdict":"fail"}' : PASS) });
  const out = await V.run(t.env, { dry: false });
  check("an application the abstract does not state is withheld", out.status === "draft" && bskyPosts(t.calls) === 0, out);
}
{ // the selected id must be one that was supplied
  const t = setup({ writer: () => good({ arxiv_id: "9999.00000" }), reviewer: () => PASS });
  const out = await V.run(t.env, { dry: false });
  check("a hallucinated paper id is rejected", out.status === "no-selection" && bskyPosts(t.calls) === 0, out);
}
{ // dry run also runs the full check and fails closed
  const t = setup({ writer: () => good(), reviewer: () => new Error("x") });
  const out = await V.run(t.env, { dry: true });
  check("a dry run with an outage logs nothing as checked", out.status === "unverified" && logInserts(t.calls).length === 0, out);
}

console.log((fails ? "FAILED " : "OK ") + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
