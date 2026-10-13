// Q08-CONTEXT-1 (0.18.0): verified BACKGROUND pack, required systems analysis, framed analysis is not a fact error.
const mod = await import("./worker.js");
const C = mod.__context, L = mod.__lede, V = mod.__verify;
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
check("query drops filler words and HN prefixes", C.backgroundQuery({ title: "Show HN: Denmark set to allow return of physical force in school" }) === "Denmark set allow return physical force", C.backgroundQuery({ title: "Show HN: Denmark set to allow return of physical force in school" }));
check("a GitHub repository is queried by its name", C.backgroundQuery({ title: "storytold/grid-craft" }) === "grid craft");
const realFetch = globalThis.fetch;
const seen = [];
globalThis.fetch = async (u) => {
  u = String(u); seen.push(u);
  if (/list=search/.test(u)) return new Response(JSON.stringify({ query: { search: [{ title: "Corporal punishment in Denmark" }, { title: "Danish school system" }, { title: "Unrelated page" }] } }), { headers: { "content-type": "application/json" } });
  if (/prop=extracts/.test(u)) return new Response(JSON.stringify({ query: { pages: { 1: { title: "Corporal punishment in Denmark", extract: "Denmark banned physical force against children in schools in 1967 and in homes in 1997. ".repeat(4) }, 2: { title: "Danish school system", extract: "Folkeskole may refer to several things." }, 3: { title: "Unrelated page", extract: "Something else entirely about birds and rivers. ".repeat(8) } } } }), { headers: { "content-type": "application/json" } });
  if (/gdeltproject/.test(u)) return new Response(JSON.stringify({ articles: [{ domain: "lemonde.fr", seendate: "20261008T120000Z", title: "Denmark votes to let teachers restrain pupils" }] }), { headers: { "content-type": "application/json" } });
  return new Response("{}", { status: 404 });
};
const bg = await C.backgroundPack({ title: "Denmark set to allow return of physical force in school" });
check("the pack carries the matching Wikipedia lead section", /Wikipedia, 'Corporal punishment in Denmark'/.test(bg) && /banned physical force against children in schools in 1967/.test(bg), bg);
check("disambiguation and unrelated pages are dropped", !/may refer to/.test(bg) && !/birds and rivers/.test(bg), bg);
check("recent news coverage is listed with outlet and date", /News coverage \(lemonde\.fr, 2026-10-08\): Denmark votes to let teachers restrain pupils/.test(bg), bg);
globalThis.fetch = async () => { throw new Error("offline"); };
check("a failed lookup gives an empty pack, never an error", (await C.backgroundPack({ title: "Denmark physical force school" })) === "");
globalThis.fetch = realFetch;
const pr = L.buildPrompt({ core_concept: "c", friction_point: "f", signal_strength: "High" }, [], [], { source: { source: "hn", title: "t", url: "https://x.org/a" }, article: "", background: "Wikipedia, 'X': fact." });
check("the writer prompt carries the BACKGROUND block", /--- BACKGROUND \(verified reference text/.test(pr) && /Wikipedia, 'X': fact\./.test(pr));
check("the directive requires context and a systems analysis", /STRUCTURE \(required, in this order\)/.test(L.Q08_DIRECTIVE) && /SYSTEMS ANALYSIS \(required; this is why the piece exists\)/.test(L.Q08_DIRECTIVE) && /A piece that only retells its source is rejected/.test(L.Q08_DIRECTIVE));
check("the background counts as source material", /the linked article text and the BACKGROUND reference text/.test(L.Q08_DIRECTIVE));
check("readers cap a retelling at 3", /A piece that only retells its source scores at most 3/.test(L.READER_PROMPT));
const sp = V.splitFactItems([
  "FACT: recognizing this bias is the first step in an epistemic audit of his later histories -- analytical claims not stated in source",
  "FACT: the incentive is to settle before the hearing -- interpretation of the source",
  "FACT: the ministry fined 3 schools in 2025 -- not in source",
  "FACT: Le Monde reported the vote first -- analysis not in source"
]);
check("FACT items whose reason calls them analysis or interpretation are reasoning", sp.inferences.length === 2, sp);
check("a figure and a named outlet stay FACTs even with an 'analysis' reason", sp.facts.length === 2, sp);
const src = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
check("the fact-check reads the larger ground", /String\(ground\)\.slice\(0, FACTCHECK_GROUND_MAX\)/.test(src) && Number((src.match(/var FACTCHECK_GROUND_MAX = (\d+)/) || [])[1]) >= 24000);
check("generate passes the pack to the writer and to the fact-check ground", /var background = await backgroundPack\(story\);/.test(src) && /labelledGround\(story, friction, article, background, ownerNotes\)/.test(src));
// Q08-SOURCE-GROUND-1 (0.19.1, run 377)
{
  const G = mod.__ground;
  const g = G.labelledGround({ source: "hn", title: "Apple HomeView", url: "https://www.apple.com/homeview/" }, { core_concept: "Apple HomeView", friction_point: "The design is nice and the price is very aggressive." }, "HomeView is a home hub.", "Wikipedia, 'Apple Inc.': ...", []);
  check("the ground names the source, its site and the discussion", /SOURCE: an article at apple\.com, discussed on Hacker News\. Title: Apple HomeView\. Link: https:\/\/www\.apple\.com\/homeview\/ \(site: apple\.com\)/.test(g) && /Hacker News discussion comments on it: The design is nice/.test(g) && /Linked article text: HomeView/.test(g) && /Background reference text:/.test(g), g);
  const gh = G.labelledGround({ source: "github", title: "storytold/cadcraft", url: "https://github.com/storytold/cadcraft" }, { friction_point: "A CAD tool." }, "", "", []);
  check("a repository source is labelled as such", /a GitHub repository \(storytold\/cadcraft\)/.test(gh) && /Repository description and README excerpt: A CAD tool\./.test(gh), gh);
  check("generate builds the essay ground with labelledGround", /var essayGround = labelledGround\(story, friction, article, background, ownerNotes\);/.test((await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8")));
}
// Q08-SOURCE-ORDER-1 (0.19.3)
{
  const O = mod.__order;
  const c = [{ source: "hn", id: 1 }, { source: "hn", id: 2 }, { source: "github", id: "g" }, { source: "arxiv", id: "a" }];
  const o1 = O.orderCandidates(c, "hn").map((x) => x.id);
  check("after a story, a paper goes first and repositories go last", JSON.stringify(o1) === JSON.stringify(["a", 1, 2, "g"]), o1);
  const o2 = O.orderCandidates(c, "arxiv").map((x) => x.id);
  check("after a paper, stories go first and repositories go last", JSON.stringify(o2) === JSON.stringify([1, 2, "a", "g"]), o2);
  const o3 = O.orderCandidates([{ source: "github", id: "g" }, { source: "github", id: "h" }], "github").map((x) => x.id);
  check("with only repositories, they are still used", JSON.stringify(o3) === JSON.stringify(["g", "h"]), o3);
}
// Q08-TECH-SYSTEMS-1 (0.23.0): the analysis is a technical system breakdown, and the readers judge it as one
check("the directive asks for components, data flow, the design decision and the trade-off", /Name the components involved/.test(L.Q08_DIRECTIVE) && /how data, requests or control move between them/.test(L.Q08_DIRECTIVE) && /design decision, default, constraint or assumption/.test(L.Q08_DIRECTIVE) && /trade-off/.test(L.Q08_DIRECTIVE));
check("the directive no longer says 'no required arc' beside the required structure", !/No required arc/.test(L.Q08_DIRECTIVE));
check("readers judge how the technology works", /how the technology involved works/.test(L.READER_PROMPT));
// Q08-ENTITY-BACKGROUND-1 (0.25.0, run 390): the systems a headline names get their own background article
{
  const E = C.backgroundEntities;
  const e1 = E({ title: "Apple's new 'Switch to Safari' campaign details why you should ditch Chrome" });
  check("named products and organisations are picked from the headline", e1.includes("Apple") && e1.includes("Safari") && e1.includes("Chrome") && e1.length <= 4, e1);
  check("question words and generic verbs are not entities", !E({ title: "Show HN: How We Built a Faster Queue" }).some((x) => /^(Show|How|We)$/.test(x)));
  check("a repository title names its project", E({ title: "mhtsec/ARTEX" })[0] === "ARTEX");
}
console.log("context.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
