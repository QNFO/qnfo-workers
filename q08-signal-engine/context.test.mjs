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
check("the fact-check reads the larger ground", /String\(ground\)\.slice\(0, FACTCHECK_GROUND_MAX\)/.test(src) && /var FACTCHECK_GROUND_MAX = 24000/.test(src));
check("generate passes the pack to the writer and to the fact-check ground", /var background = await backgroundPack\(story\);/.test(src) && /article, background, \(ownerNotes/.test(src));
console.log("context.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
