/**
 * q08-signal-engine — v0.7.0
 *
 * What it is
 *   The external signal engine for q08.org. Scrapes high-friction technical
 *   discussions from Hacker News, ranks them by a volatility score, extracts
 *   the structural friction point, then composes a long-form analytical essay
 *   and publishes it to q08.org.
 *
 * Architecture
 *   cron (every 2h) -> scrape_hn -> volatility_rank -> pick_top ->
 *   extract_friction -> build_prompt -> compose (Workers AI) ->
 *   gate (long-form prose: no bullets / no tables / no names / no handles) ->
 *   persist (D1 q08-signal) -> serve HTML
 *
 * Register (the reading.q08.org signature, applied to external signals)
 *   Systemic, not specific: the signal incident opens the essay; the essay
 *   itself names the general structural pattern it instantiates. Cold structural
 *   objectivity — no management-consulting abstractions. Structures vary per
 *   piece; section skeletons of recent pieces are injected as banned patterns.
 *   Each draft must carry a 'worth your time' self-verdict that gates
 *   publication, and readers vote yes/flat/no, which ranks the few-shot pool.
 *   Timeless and name-free. NO bullet lists. NO tables.
 *
 * Bindings
 *   DB          — D1 q08-signal (signal_log, published_pieces, prompt_pool, engine_runs)
 *   QNFO_AI     — service binding to qnfo-ai (OpenAI-compat router)
 *   EMAIL       — service binding to qnfo-email (alerts on publish)
 *
 * Secrets
 *   ROUTER_TOKEN — bearer token for qnfo-ai
 *
 * Cron: 0 * /2 * * * (every 2 hours; up to 10x/day cap enforced in code)
 */

var VERSION = "0.7.22"; // v0.7.16 ANTI-BANAL-1: ban stock "structural dynamic" framing + label/abstraction titles; title must name a mechanism, not a category
var WORKER = "q08-signal-engine";
var MAX_PER_DAY = 10;
var HN_SEARCH = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50";
var HN_ITEMS  = "https://hn.algolia.com/api/v1/items/";
var ROUTER    = "https://qnfo-ai.internal/v1/chat/completions";
var UA        = "q08-signal-engine/0.1.0 (+https://q08.org)";
var ORIGIN = "https://q08.org";
// IndexNow: search-engine instant indexing (Bing, Yandex, Seznam, Naver).
var INDEXNOW_KEY = "3f8a1c9e7b2d6045a1f3c8e5b9d20147";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function nowIso() { return new Date().toISOString(); }
function utcDay() { return nowIso().slice(0, 10); }
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
  });
}
function escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ---------------------------------------------------------------------------
// 1. Ingestion — Hacker News front page
// ---------------------------------------------------------------------------
async function scrapeHN() {
  const resp = await fetch(HN_SEARCH, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error("HN fetch " + resp.status);
  const data = await resp.json();
  const now = Date.now();
  const stories = [];
  for (const h of (data.hits || [])) {
    if (!h._tags || !h._tags.includes("story")) continue;
    // Skip Ask HN / Show HN ritual threads (low structural friction)
    if (/^(Ask HN|Show HN|Tell HN|Launch HN):/i.test(h.title || "")) continue;
    const pts = h.points || 0;
    const nc  = h.num_comments || 0;
    let age_h = null;
    if (h.created_at) {
      try {
        age_h = (now - new Date(h.created_at).getTime()) / 3600000;
      } catch (_) {}
    }
    const ratio = pts > 0 ? nc / pts : 0;
    const vel   = age_h != null ? Math.max(0.05, 1 / (1 + age_h / 6)) : 0.5;
    // Priority Score = (Engagements × Velocity) + Controversy Modifier
    const score = (nc * vel) + (10 * ratio);
    stories.push({
      id:        h.story_id || h.objectID,
      title:     h.title || "",
      url:       h.url || "",
      points:    pts,
      num_comments: nc,
      age_h,
      ratio:     Math.round(ratio * 100) / 100,
      volatility_score: Math.round(score * 100) / 100,
    });
  }
  stories.sort((a, b) => b.volatility_score - a.volatility_score);
  return stories;
}

// ---------------------------------------------------------------------------
// 2. Friction extraction — top-level comments ranked by length (content proxy)
// ---------------------------------------------------------------------------
function cleanHtml(s) {
  return (s || "")
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function flattenComments(node, depth, out) {
  if (!node || typeof node !== "object") return;
  if (node.text) out.push({ depth, text: cleanHtml(node.text) });
  for (const child of (node.children || [])) flattenComments(child, depth + 1, out);
}
async function extractFriction(storyId, topK) {
  topK = topK || 5;
  const resp = await fetch(HN_ITEMS + storyId, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error("HN items " + resp.status);
  const item = await resp.json();
  const comments = [];
  for (const child of (item.children || [])) flattenComments(child, 0, comments);
  const topLevel = comments.filter(c => c.depth === 0).sort((a, b) => b.text.length - a.text.length);
  const top = topLevel.slice(0, topK);
  const friction = top.map(c => c.text).join(" ").slice(0, 800);
  const strength = comments.length >= 100 ? "High" : comments.length >= 30 ? "Medium" : "Low";
  return {
    core_concept:   item.title || "",
    friction_point: friction,
    signal_strength: strength + " (" + comments.length + " comments)",
    comment_count:  comments.length,
  };
}

// --- GitHub (intent signals): trending repos with open issues ---
async function scrapeGitHub() {
  var since = new Date(Date.now() - 7*24*3600*1000).toISOString().slice(0,10);
  var url = "https://api.github.com/search/repositories?q=created:%3E" + since + "+stars:%3E50&sort=stars&order=desc&per_page=20";
  var resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/vnd.github+json" } });
  if (!resp.ok) throw new Error("github " + resp.status);
  var data = await resp.json();
  var out = [];
  for (var r of (data.items || [])) {
    var stars = r.stargazers_count || 0, issues = r.open_issues_count || 0;
    var issueRatio = stars > 0 ? issues/stars : 0;
    out.push({ source:"github", id: r.full_name, title: r.full_name, url: r.html_url, points: stars, num_comments: issues, ratio: Math.round(issueRatio*100)/100, volatility_score: Math.round((stars/10 + 10*Math.min(issueRatio,2))*10)/10, description: r.description||"" });
  }
  out.sort(function(a,b){ return b.volatility_score - a.volatility_score; });
  return out.slice(0, 15);
}

// --- arXiv (narrative signals): recent abstracts matching high-intent keywords ---
var ARXIV_KEYWORDS = ["distributed system","consensus","fault tolerance","compiler","programming language","database","security","privacy","machine learning","infrastructure","network","operating system","formal verification","cryptography","scalability","reliability","architecture","verification","protocol"];
async function scrapeArxiv() {
  var q = "cat:cs.DC OR cat:cs.CR OR cat:cs.DB OR cat:cs.PL OR cat:cs.OS OR cat:cs.NI OR cat:cs.SY OR cat:cs.SE OR cat:cs.AR";
  var url = "http://export.arxiv.org/api/query?search_query=" + encodeURIComponent(q) + "&sortBy=submittedDate&sortOrder=descending&max_results=30";
  var resp = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error("arxiv " + resp.status);
  var xml = await resp.text();
  var out = [];
  for (var e of xml.split("<entry>").slice(1)) {
    var title = ((e.match(/<title>([\s\S]*?)<\/title>/)||[,""])[1]||"").replace(/\s+/g," ").trim();
    var abs = ((e.match(/<summary>([\s\S]*?)<\/summary>/)||[,""])[1]||"").replace(/\s+/g," ").trim();
    var idm = (e.match(/<id>([\s\S]*?)<\/id>/)||[,""])[1]||"";
    var arxid = idm.split("/abs/")[1] || idm.trim();
    var low = (title + " " + abs).toLowerCase();
    var hits = 0;
    for (var k of ARXIV_KEYWORDS) if (low.includes(k)) hits++;
    if (hits === 0 || !arxid) continue;
    out.push({ source:"arxiv", id: arxid, title: title, url: "https://arxiv.org/abs/" + arxid, points: hits, num_comments: 0, ratio: 0, volatility_score: hits*20, abstract: abs });
  }
  out.sort(function(a,b){ return b.volatility_score - a.volatility_score; });
  return out.slice(0, 12);
}
async function extractGitHubFriction(fullName, description) {
  var parts = [];
  if (description) parts.push(description);
  try {
    var url = "https://api.github.com/repos/" + fullName + "/issues?state=open&sort=comments&direction=desc&per_page=5";
    var resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/vnd.github+json" } });
    if (resp.ok) {
      var issues = await resp.json();
      for (var i of (issues||[])) {
        if (i.pull_request) continue;
        parts.push((i.title||"") + ": " + String(i.body||"").replace(/\s+/g," ").slice(0,300));
      }
    }
  } catch (e) {}
  var friction = parts.join(" ").slice(0, 800);
  return { core_concept: fullName, friction_point: friction, signal_strength: parts.length >= 3 ? "Medium" : "Low", comment_count: parts.length };
}

// ---------------------------------------------------------------------------
// 3. Prompt construction — q08 register
// ---------------------------------------------------------------------------
// The register problem: LLMs default to management-consulting prose when asked
// for "systems-level critique" — producing capitalized nominalizations like
// "Knowledge Work", "Systemic Vulnerability", "Architectural Context".
// These are jargon placeholders, not analysis. The prompt must name and ban
// this failure mode explicitly, and model the correct register with contrast examples.
var Q08_DIRECTIVE = [
  "You are the writer for q08.org — long-form essays on the recurring systems that make things break, for a reader who wants to see a present incident as one instance of a larger, connected picture. The proper nouns of today are the lead-in, not the destination; the bigger system is the story. Not about technology or history per se — about the connected world they are part of.",
  "Your input is a friction signal from a technical community debate. Your output is a self-contained essay that a reader with no knowledge of the source thread can follow.",
  "",
  "SYSTEMIC, NOT SPECIFIC — HISTORY RHYMES: the incident is a probe, never the subject. Extract the universal system the incident instantiates — the specific mechanism that would produce the same breakdown in any domain and any century. Then show it is universal by connecting it across domains and, where a real recurrence fits, across history. Historical precedent is a suggestion, not a requirement — use a well-known recurrence when it genuinely illuminates the system, but never force a rhyme, never fabricate a historical event to create one, and never let the search for a precedent crowd out the argument itself. The nouns change — a guild\u2019s quality mark becomes a verification badge, a patent-medicine advertisement becomes a sponsored result — the system does not. Your central claim must survive the disappearance of this specific incident. An essay that stays inside its incident, or that reaches for a metaphor instead of a true historical recurrence, is rejected.",
  "",
  "REGISTER: cold structural objectivity. An engineer describing a mechanism, not a consultant describing a market. Write the way a precise bug report reads: specific, unimpressed, exact.",
  "",
  "STRUCTURE: let the material dictate the shape. No required arc, no three-movement template. Banned section headers, exactly: 'How the Flaw Manifests', 'Cascading Failures', 'A Minimal Alternative', 'A Minimal Framework', 'Connections Across Disciplines', 'Echoes from the Past', 'A Path Forward', 'The Lens Restored', 'Lessons for the Future', 'Unexpected Parallels', 'The Broader Lesson', and any header of the form 'The [Adjective] [Lever/Bottleneck/Premise/Flaw]: X'. Never name a section after its rhetorical function.",
  "",
  "OPENING: in one or two sentences name the incident, then pivot immediately to the system it reveals. The incident earns at most one paragraph; the reader should know within the first paragraph what universal dynamic is at stake, not merely what specific product broke. Never open on an aphorism or a general claim; never dwell on the incident.",
  "",
  "CONCRETENESS ACROSS ERAS: name the real things — but across history, not only in the present. The signal\u2019s particulars are one instance; the essay earns its length by naming the OTHER eras and institutions where the same system operated (a medieval guild\u2019s forged marks, a nineteenth-century patent-medicine boom, a twentieth-century ratings failure). Anonymizing the material is a register failure; refusing to leave the present is a depth failure. A sentence without a specific referent is a sentence to rewrite.",
  "",
  "FACTS (hard, non-negotiable): every specific fact — number, price, percentage, count, identifier, channel ID, database schema, SQL query, or log excerpt — must come from the SIGNAL, verbatim or as a direct paraphrase. The signal is your only source of specifics about the incident; historical precedents are drawn from real, verifiable history. If the signal gives no figure, write the claim in general terms ('the score is computed from static signals') and never supply a value. Inventing a number, a channel ID, a dollar amount, a database schema, or a log excerpt to sound concrete is the single worst failure this publication can commit — a reader who checks will find nothing behind it. A general honest sentence always beats a specific fabricated one. Before writing any number, ask: is this exact figure in the signal? If not, write the general claim instead.",
  "",
  "PROSE, NOT SCHEME: write prose, not a specification. Never enumerate with '(1) ... (2) ...' in running text, and never write like a design document; the reader is a person, not a reviewer.",
  "",
  "NO SECTION HEADERS: the essay is continuous prose. Do not use Markdown section headers (## or ###) anywhere in the body — paragraph breaks only. A header is a crutch; if you need one, the prose has failed to carry the argument.",
  "",
  "PRECEDENT, NOT METAPHOR: a historical precedent is a real, well-known recurrence of the same system — a named era and institution where the identical incentive or structural dynamic operated. Never fabricate a historical event or date to force a rhyme; a reader who checks must find it. A vague \u2018throughout history\u2019 with no named instance is not a precedent. A metaphor (\u2018it is like a telescope\u2019) is decorative and banned.",
  "",
  "CROSS-DOMAIN SYNTHESIS: the essay\u2019s spine is the universal system, and you must show it operating in genuinely different domains — engineering, economics, biology, law, politics, infrastructure, finance, military history — not as a list of analogies but as evidence the system is domain-independent. A decorative stock prop is banned; a historical recurrence of the same mechanism is required. Breadth is the point: an essay that never leaves its source domain has not found the signal.",
  "",
  "ENDING: end at the point of maximum implication. A closing paragraph that describes a healed system is forbidden. If a fix exists, fold it into the argument; the final sentences leave the reader with the sharpest unresolved fact — not a summary, not a resolution, not a flourish.",
  "",
  "VERDICT (mandatory final line, this is the last line of your output, after the essay): write exactly 'worth your time: yes|flat|no — one clause of justification'. State honestly whether a reader gains something by reading the essay that they would not get from the source thread itself. 'no' rejects the essay; 'flat' means it barely clears the bar. Omitting this line is a rejection on its own.",
  "",
    "MECHANISM, NOT LABEL: name the causal process — who is incentivised to do what, which information is missing, where the coupling breaks — as actors doing something, never as an abstract noun. 'Incentive structure', 'information asymmetry', 'coupling failure', 'structural dynamic' and 'systemic failure' are labels, not mechanisms: if a sentence reduces to one of them, the mechanism has not been found yet. The words 'structural', 'systemic' and 'dynamic' are permitted only as a precise description of a named mechanism, never as a summary of your own argument.",
    "BANNED FRAMING (automatic rejection — the tells of a banal essay): 'illustrates a broader structural dynamic', 'exposes a structural dynamic', 'reveals a structural dynamic', 'a recurring institutional dynamic', 'a systemic failure in which', 'a structural gap between', 'what this reveals about', 'the deeper pattern', 'the broader lesson'. Never tell the reader what the essay 'reveals'; demonstrate it and stop. A sentence that announces the significance of the essay instead of adding a fact is a sentence to delete.",
    "SIGNIFICANCE ANNOUNCEMENT (banned): never write \"the incident illustrates / exposes / reveals / foregrounds / underscores a <noun phrase>\". Those verbs, applied to the incident, are the banality signature — they announce that the essay has a point instead of making it. State the causal chain directly: who does what to whom, and what breaks as a result. If a draft contains any of these verbs, rewrite the sentence as a mechanism.",
    "TITLE: name the mechanism, not the category. A good title names a specific causal process or its actors — e.g. 'The clearinghouse that paid itself first' or 'Why the map outlives the territory it describes'. Banned title shapes: the bare '[Adjective]-[Noun] [Preposition] [Abstract Noun]' stack ('Scale-Induced Professional Displacement'); 'The X of Y' ('The Incentive-Driven Misalignment of Threat Models'); 'X as Y' ('Formal Guarantees as Market Signal'); and any title opening with Structural, Systemic, Implicit, Opaque, Formal, Abstract, Externalized, Statistical or a similar nominalisation. If the title would work as a category label in a management deck, it is the wrong title.",
  "CONSTRAINTS (hard):",
  "- The structural claim must outlive the incident: dates may appear in the material, but the argument must not depend on them.",
  "- No @handles, no marketing register, no promotional language. No emotional vocabulary ('anxiety', 'dread', 'excitement'). No hedging ('it seems', 'perhaps').",
  "- No first person. No preamble, no meta-commentary about the essay itself.",
  "- 1200-1800 words. This is a requirement, not a suggestion: essays under this length are rejected. Complete sentences only: the essay ends on a full stop, never mid-sentence.",
  "- Output: valid Markdown, H1 title first, then the essay. The title must name the system, not the incident — concrete but general, surviving the disappearance of this particular signal. Banned title forms: 'When X Meets Y', 'X: The Hidden Z', 'An Analysis of X', 'A Critique of Y'.",
  "- Mathematical notation: inline math as \\(...\\), display math as \\[...\\]. Use only these delimiters; never single-dollar signs.",
].join("\n");

var REGISTER_EXEMPLAR = [
  "# The badge that outlived the inspection behind it",
  "",
  "A guild issued a stamped mark to certify that a piece of metal had been assayed by a sworn inspector. Buyers learned to read the mark as a promise about the metal. The mark was cheaper to copy than the inspection was to perform, and within a generation the workshops turning out stamped-but-unaudited goods outnumbered the ones still submitting to the assay. The arrangement had three parts. The buyer could not verify the metal directly, so the stamp carried the entire burden of trust. The guild drew its authority from the stamp, so it had no reason to publish how many stamps circulated outside its control. The copying workshop paid nothing for the trust it spent. The inspection was the expensive step and the stamp was the cheap one, and the market rewarded the cheap one.",
  "",
  "# The freight office that priced its own risk",
  "",
  "A shipping line asked its own freight office to set the insurance premium on the cargo it carried. The office priced each consignment from the manifest, and the manifest was written by the same clerks who loaded the hold. Nobody falsified a document; the incentive did the work. A consignment that was awkward to stow was written up as routine, because routine cargo cleared faster. The premium fell, the line won more contracts, and the losses surfaced only when a hull was opened in dry dock two seasons later. The party who could have measured the risk was the party paid to understate it.",
].join("\n");

// Only a reader-proven structure that is ALSO in-register may serve as an exemplar.
// Without this, promoting top-rated pieces would feed the OLD banal skeletons
// (label titles, 'structural dynamic' openings) straight back into the prompt.
function exemplarOk(md) {
  if (!md) return false;
  var t = String(md);
  var tm = t.match(/^#\s+(.+)$/m);
  var title = tm ? tm[1].trim().replace(/[\u2010-\u2015\u2212]/g, "-") : "";
  if (title) {
    if (BAD_TITLE_RE.test(title)) return false;
    if (TITLE_FORMULA_RE.test(title) || TITLE_COLON_RE.test(title)) return false;
    for (var i = 0; i < LABEL_TITLE_RES.length; i++) { if (LABEL_TITLE_RES[i].test(title)) return false; }
  }
  if (new RegExp(STOCK_FRAMING_RE.source, "i").test(t)) return false;
  if (new RegExp(LABEL_PHRASE_RE.source, "i").test(t)) return false;
  return true;
}

function buildPrompt(friction, fewShot, recentStructures) {
  var parts = [Q08_DIRECTIVE];
  parts.push("Remember: your final output line must be the verdict: 'worth your time: yes|flat|no — justification'.");
  if (fewShot && fewShot.length > 0) {
    parts.push("\n--- PROVEN EXEMPLAR STRUCTURES (quality floor, not templates to copy) ---");
    for (var ex of fewShot.slice(0, 2)) {
      parts.push(ex.structure_md.slice(0, 400));
    }
  } else {
    // ANTI-BANAL-2: with no reader-proven exemplars the writer has only prohibitions.
    parts.push("\n--- REGISTER EXEMPLAR (shape only - do not reuse this subject, title, or facts) ---");
    parts.push(REGISTER_EXEMPLAR);
  }
  if (recentStructures && recentStructures.length > 0) {
    parts.push("\n--- RECENT STRUCTURES ON THIS SITE (BANNED PATTERNS — diverge from every one) ---");
    for (var s of recentStructures.slice(0, 6)) {
      parts.push(s.slice(0, 200));
    }
  }
  parts.push("\n--- SIGNAL ---");
  parts.push("core_concept: " + friction.core_concept);
  parts.push("friction_point: " + friction.friction_point);
  parts.push("signal_strength: " + friction.signal_strength);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// 4. LLM composition via Workers AI binding (no token required)
// ---------------------------------------------------------------------------
// Model priority: frontier-scale non-reasoning writers only.
// Banned: llama, mistral, gemma-7b, -flash, -fp8-fast, -mini, -small (per fleet policy).
var COMPOSE_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/nvidia/nemotron-3-120b-a12b",
  // NOTE: kimi-k2.6 / glm-5.3 / deepseek-v4-pro are REASONING models here - they return
  // empty message.content once the budget is spent on reasoning_content, so they cannot
  // serve as fallbacks at this token budget. Re-add only with a raised reasoning floor.
];

async function compose(env, prompt) {
  var lastErr;
  for (var modelId of COMPOSE_MODELS) {
    try {
      var resp = await env.AI.run(modelId, {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 6000,
        temperature: 0.65,
      }, { signal: AbortSignal.timeout(120000) });
      // Workers AI returns {response: string} for chat models
      var text = resp.response || (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
      if (text && text.length > 200) return { text, model: modelId };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("all compose models failed: " + String(lastErr && lastErr.message || lastErr).slice(0, 200));
}

// ---------------------------------------------------------------------------
// 5. Gate — structural validation (no names, no handles, minimum length)
// ---------------------------------------------------------------------------
// Personal name detection: two capitalized words where BOTH are common given/surname patterns.
// Excludes structural/technical compound nouns (e.g. "Knowledge Work", "System Design").
// Approach: reject only when the phrase appears in a personal-name context (after "by ", "from ", etc.)
// or when it's a known personal-name pattern (First Last without structural context).
var HANDLE_RE = /@\w+/g;
// Structural compound nouns that look like names but aren't (whitelist)
var STRUCTURAL_TERMS = /^(Systems?|Software|Hardware|Network|Data|Cloud|Service|Knowledge|Architectural|Technical|Digital|Platform|Security|Infrastructure|Design|Engineering|Product|Research|Business|Market|Organizational?|Operational?|Strategic|Systemic|Structural|Computational|Distributed|Autonomous|Functional|Behavioral|Cognitive|Semantic|Logical|Physical|Virtual|Abstract|Formal|Applied|Open|Closed|Standard|Legacy|Modern|Native|Hybrid|Adaptive|Dynamic|Static|Linear|Parallel|Sequential|Recursive|Iterative|Incremental|Continuous|Discrete|Binary|Modular|Layered|Hierarchical|Composable|Decoupled|Integrated|Unified|Federated|Centralized|Decentralized|Horizontal|Vertical|Lateral|Forward|Backward|Internal|External|Primary|Secondary|Core|Edge|Base|Top|Bottom|High|Low|Mid|Full|Half|Single|Multi|Cross|Inter|Intra|Meta|Sub|Super|Pre|Post|Anti|Non|Semi|Pseudo|Quasi|Proto|Micro|Macro|Nano|Global|Local|Regional|Universal|Specific|General|Special|Common|Rare|Simple|Complex|Basic|Advanced|Standard|Custom|Default|Optional|Required|Critical|Optional|Minimal|Maximal|Optimal|Efficient|Effective|Reliable|Scalable|Portable|Flexible|Robust|Resilient|Fault|Error|Failure|Success|Risk|Trust|Safety|Privacy|Access|Control|Flow|State|Event|Signal|Message|Request|Response|Query|Command|Action|Task|Job|Process|Thread|Worker|Agent|Actor|Client|Server|Peer|Node|Edge|Link|Path|Route|Channel|Stream|Queue|Stack|Heap|Cache|Store|Index|Registry|Catalog|Schema|Model|View|Controller|Handler|Adapter|Bridge|Proxy|Gateway|Router|Scheduler|Monitor|Observer|Listener|Publisher|Subscriber|Producer|Consumer|Provider|Consumer|Builder|Factory|Singleton|Strategy|Pattern|Template|Protocol|Interface|Contract|Specification|Standard|Convention|Policy|Rule|Constraint|Invariant|Property|Attribute|Parameter|Variable|Constant|Function|Method|Procedure|Algorithm|Heuristic|Metric|Measure|Score|Rank|Weight|Priority|Threshold|Limit|Bound|Range|Window|Interval|Period|Cycle|Loop|Iteration|Generation|Version|Release|Deploy|Build|Test|Debug|Profile|Audit|Review|Inspect|Monitor|Trace|Log|Record|Report|Alert|Notify|Trigger|Schedule|Execute|Run|Start|Stop|Pause|Resume|Cancel|Reset|Retry|Rollback|Migrate|Upgrade|Patch|Fix|Repair|Restore|Backup|Archive|Compress|Encrypt|Decrypt|Hash|Sign|Verify|Validate|Parse|Format|Serialize|Deserialize|Encode|Decode|Map|Filter|Reduce|Sort|Search|Match|Compare|Merge|Split|Join|Group|Aggregate|Transform|Convert|Normalize|Denormalize|Optimize|Minimize|Maximize|Balance|Distribute|Replicate|Synchronize|Coordinate|Orchestrate|Choreograph|Compose|Decompose|Refactor|Rewrite|Replace|Remove|Add|Update|Insert|Delete|Create|Read|Write|Append|Prepend|Truncate|Clear|Flush|Drain|Fill|Load|Save|Fetch|Push|Pull|Send|Receive|Emit|Consume|Produce|Publish|Subscribe|Register|Deregister|Bind|Unbind|Connect|Disconnect|Open|Close|Lock|Unlock|Acquire|Release|Wait|Signal|Notify|Broadcast|Multicast|Unicast|Cast|Wrap|Unwrap|Pack|Unpack|Box|Unbox|Lift|Lower|Raise|Drop|Inject|Extract|Import|Export|Include|Exclude|Enable|Disable|Activate|Deactivate|Initialize|Finalize|Setup|Teardown|Mount|Unmount|Attach|Detach|Link|Unlink|Bind|Unbind|Compile|Interpret|Execute|Evaluate|Reduce|Expand|Inline|Outline|Abstract|Concrete|Generic|Specific|Static|Dynamic|Lazy|Eager|Sync|Async|Blocking|NonBlocking|Streaming|Batch|Online|Offline|Realtime|Deferred|Immediate|Eventual|Consistent|Eventual|Strong|Weak|Strict|Loose|Tight|Loose|Hard|Soft|Fast|Slow|Hot|Cold|Warm|Fresh|Stale|Live|Dead|Active|Passive|Push|Pull|Reactive|Proactive|Declarative|Imperative|Functional|Object|Aspect|Event|Data|Message|Command|Query|Document|Graph|Tree|List|Array|Map|Set|Queue|Stack|Heap|Ring|Buffer|Pool|Cache|Store|Vault|Ledger|Register|Log|Journal|Audit|Trail|History|Timeline|Snapshot|Checkpoint|Milestone|Baseline|Target|Goal|Objective|Metric|KPI|SLA|SLO|SLI|OKR|KR|MVP|POC|RFC|ADR|PR|MR|CR|DR|RCA|PIR|SOP|FAQ|TIL|TLDR|API|SDK|CLI|GUI|UI|UX|DX|DevX|PX|CX|EX|HCI|HMI|NLI|VUI|AUI|WUI|MUI|TUI|CUI|RUI|SUI|FUI|BUI|DUI|EUI|IUI|OUI|PUI|QUI|ZUI)$/;
function isPersonalName(phrase) {
  var parts = phrase.split(" ");
  if (parts.length !== 2) return false;
  // If either part matches structural terms, it's not a personal name
  if (STRUCTURAL_TERMS.test(parts[0]) || STRUCTURAL_TERMS.test(parts[1])) return false;
  // Both parts must be short (given names are typically 3-12 chars)
  if (parts[0].length > 14 || parts[1].length > 16) return false;
  return true;
}
var NAME_RE = /\b[A-Z][a-z]{2,13} [A-Z][a-z]{2,15}\b/g;
// BANNED_BABBLE: management-consulting phrases wrong in any register.
var BANNED_BABBLE = [
  "digital transformation", "operational excellence", "strategic alignment",
  "moving forward", "going forward", "at the end of the day", "circle back",
  "key takeaways", "lessons learned", "best practices", "thought leadership",
  "game changer", "synergies",
];
var BANNED_HANDLES = /@\w+/g;
var BAD_TITLE_RE = /^(an? |the )?(analysis|critique|examination|exploration|overview|review|understanding|study|assessment|investigation) of /i;
var TITLE_FORMULA_RE = /^when .+ meets .+$/i;
var TITLE_COLON_RE = /: the (hidden|invisible|unseen|silent|quiet) /i;
var BANNED_H2_RE = /^#+\s+(how the flaw manifests|cascading failures|a minimal (alternative|framework|approach)|connections across disciplines|echoes from the past|a path forward|the lens restored|lessons for the future|the pattern across disciplines|unexpected parallels|the broader lesson)\b/i;
var FORMULA_H2_RE = /^#+\s+the (hidden|invisible|unseen|unspoken|silent|quiet) (lever|bottleneck|premise|flaw|cost|gear|engine|handoff|mismatch)\b/i;
var STOCK_PROPS_RE = /\b(telescopes?|galileo|alchem|philosopher.s stone|sonar|aperture|aerospace redundancy)\b/i;
var HISTORICAL_RE = /\b([0-9]+th century|\d{3,4}0s|19[0-9]{2}|18[0-9]{2}|1[0-7][0-9]{2}|medieval|renaissance|enlightenment|industrial revolution|gilded age|antiquity|ancient|roman|greek|victorian|edwardian|byzantine|feudal|dynast\w*|pharaoh|mesopotamia|bronze age|iron age|middle ages|mongol|ottoman|colonial|belle ?poque|preindustrial|great depression|south sea|tulip|dot-com|dotcom|hanseatic|medici|silk road|printing press|gutenberg|panic of|railway mania)\b/i;
var SOFT_REGISTER_RE = /\b(expectation gap|collective anxiety|vibe|democratiz\w*|future-proof|self-sustaining|path forward|healthy ecosystem|walks farther|ecosystem of)\b/i;
// ANTI-BANAL-1 (v0.7.16). The observed failure mode is not a weak argument but a
// banal *register*: the stock framing sentence ("…illustrates a broader structural
// dynamic") and nominalised label titles ("Scale-Induced Professional Displacement").
// These are category names and significance-summaries, not mechanisms. The mandate
// forbids management-consulting abstractions; these patterns ARE that failure.
var STOCK_FRAMING_RE = /\b(?:illustrat\w+|expos\w+|reveal\w+|foreground\w+|underscor\w+)\b[^.!?]{0,90}\b(?:a|an|the)\s+(?:[a-z-]+\s+){0,3}(?:dynamic|structure|pattern|failure|gap|tension|mismatch|flaw|disjunction|force|logic|loop|cycle|feedback|principle|phenomenon|tendency|incentive|premise|asymmetry|equilibrium)\b/i;
var ABSTRACT_SUMMARY_RE = /\b(?:structural|systemic|recurring|institutional|underlying|universal|self-referential|self-reinforcing)\s+(?:dynamic|failure|gap|tension|mismatch|disjunction|structure|loop|cycle|pattern)\b/gi;
var LABEL_PHRASE_RE = /\b(?:coupling failure|incentive structure|information asymmetry|concrete manifestation of|concrete instance of|feedback loop in which|systemic incentive)\b/gi;
var LABEL_TITLE_RES = [
  /\b(?:systems?|chains?|designs?|loops?|traps?|paradoxes?|precedence|approximation|displacement|consolidation|observability|planning|automation|constraints?|escalation|asymmetry|convergence|divergence|disjunction|equilibrium|inertia|entropy|abstraction|fallacy|myth|illusion)$/i,
  /^(?:structural|systemic|recurring|institutional|externalized|opaque|implicit|formal|abstract|nominal|statistical|rhetoric\w*|scale|efficiency|goal|sponsorship|incentive|autonomous)\b/i,
  /^the\s+[a-z][^:]{3,70}\s+of\s+[a-z][^:]{3,70}$/i,
  /^[a-z][^:]{2,60}\s+as\s+[a-z][^:]{2,60}$/i,
  /(?:^|[\s-])(?:induced|driven|mediated|conditioned|derived)\s+[a-z]/i,
  /\b(?:in|across|within|under|of)\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2}\s+(?:systems|chains|designs|contexts|settings|architectures|planning|automation|constraints|contracts|pipelines|domains|models|frameworks)$/i,
  /^the\s+\w+\s+\w*\s*(?:trap|paradox|illusion|fallacy|myth|dilemma|tyranny|consequence|problem|curse|temptation|revenge)\b/i,
  /:\s+(?:how|why)\s+(?:[a-z]+\s+){0,3}(?:drives?|shapes?|creates?|breeds?|undermines?|erodes?|rewards?|punishes?)\b/i
];

function gate(text) {
  // Enforce LONG-FORM PROSE with a hook, not lists:
  // 1. length 2. concrete title 3. no handles 4. no babble 5. prose-dominant.
  var problems = [];
  var body = text.toLowerCase();

  if (text.length < 4000) problems.push("too short for long-form (" + text.length + " chars; 1200-1800 words required)");

  var titleMatch = text.match(/^#\s+(.+)$/m);
  var title = titleMatch ? titleMatch[1].trim().replace(/[\u2010-\u2015\u2212]/g, "-") : "";
  if (!title) problems.push("no H1 title");
  else if (BAD_TITLE_RE.test(title)) problems.push("dry/abstract title '" + title.slice(0, 60) + "'");
  else if (title.length > 100) problems.push("title too long");

  var handles = (text.match(BANNED_HANDLES) || []).filter(function(h) { return h !== "@cf"; });
  if (handles.length > 0) problems.push("handles: " + handles.slice(0, 3).join(", "));

  for (var phrase of BANNED_BABBLE) {
    if (body.includes(phrase)) { problems.push("management-babble: '" + phrase + "'"); break; }
  }
  for (var hl of text.split("\n")) {
    var ht = hl.trim();
    if (BANNED_H2_RE.test(ht)) { problems.push("banned section header: '" + ht.slice(0, 50) + "'"); break; }
    if (FORMULA_H2_RE.test(ht)) { problems.push("formula section header: '" + ht.slice(0, 50) + "'"); break; }
  }
  if (TITLE_FORMULA_RE.test(title)) problems.push("formula title 'When X Meets Y'");
  else if (TITLE_COLON_RE.test(title)) problems.push("formula title 'X: The Hidden Z'");
  var sp = body.match(STOCK_PROPS_RE);
  if (sp) problems.push("stock analogy prop: '" + sp[1] + "'");
  var sr = body.match(SOFT_REGISTER_RE);
  if (sr) problems.push("soft register: '" + sr[1] + "'");
  // ANTI-BANAL-1: reject the significance-summary framing and label titles.
  var sf = text.match(STOCK_FRAMING_RE);
  if (sf) problems.push("stock framing tell: '" + sf[0].replace(/\s+/g, " ").slice(0, 80) + "' — name the mechanism, do not summarise the essay's significance");
  var absN = (text.match(ABSTRACT_SUMMARY_RE) || []).length;
  var lp = text.match(LABEL_PHRASE_RE);
  if (lp && lp.length >= 2) problems.push("abstraction labels x" + lp.length + " ('" + lp.slice(0, 3).join("', '") + "') - state the mechanisms instead of labelling them");
  if (absN >= 3) problems.push("abstraction-summary phrases x" + absN + " (e.g. 'structural dynamic') — state the mechanism instead of labelling it");
  for (var lt of LABEL_TITLE_RES) {
    if (lt.test(title)) { problems.push("label title — names a category, not a mechanism: '" + title.slice(0, 60) + "'"); break; }
  }
  if (/\b(?:score|rating|ratio|reputation) of \d+\.\d+\b/i.test(body)) problems.push("invented decimal metric — no fabricated scores");
  if (/\b(?:channel|account|user|session) ID ['"][A-Za-z0-9_-]{6,}['"]/i.test(body)) problems.push("invented identifier — no fabricated IDs");
  var curAmt = text.match(/\$\s?\d{1,3}(,\d{3})+/g);
  if (curAmt && curAmt.length) problems.push("large currency amount(s) " + curAmt.slice(0, 3).join(", ") + " — likely fabricated; use the signal's figures or none");

  var lines = text.split("\n");
  var bulletLines = 0, tableLines = 0, paraLines = 0;
  for (var line of lines) {
    var t = line.trim();
    if (/^[-*]\s/.test(t)) bulletLines++;
    else if (t.startsWith("|")) tableLines++;
    else if (t.length > 45) paraLines++;
  }
  if (bulletLines > 0) problems.push("bullet lists (" + bulletLines + " lines) — long-form prose required");
  if (tableLines > 0) problems.push("tables (" + tableLines + " lines) — prose required");
  if (paraLines < 6) problems.push("insufficient prose (" + paraLines + " substantial paragraphs)");

  var verdictMatch = text.match(/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im);
  if (!verdictMatch) problems.push("missing or malformed 'worth your time' verdict line");
  else if (verdictMatch[1] === "no") problems.push("self-verdict 'no' — essay does not clear the worth-reading bar");
  var essayText = text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim();
  var lastCh = essayText.slice(-1);
  if (lastCh !== "." && lastCh !== "!" && lastCh !== "?" && lastCh !== "\u201d" && lastCh !== "\u2019") problems.push("truncated ending — essay must end on a full stop");

  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// 6. Persist + serve
// ---------------------------------------------------------------------------
async function persistPiece(env, piece, signal, story, model) {
  var salt = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var slug  = utcDay() + "-" + slugify(piece.title || signal.core_concept) + "-" + salt.slice(-6);
  var pieceId = "p-" + salt;
  // Extract H1 title from markdown
  var titleMatch = piece.text.match(/^#\s+(.+)$/m);
  var title = titleMatch ? titleMatch[1].trim() : (signal.core_concept || "Untitled");
  // Body without the H1
  var body = piece.text.replace(/^#\s+.+\n?/, "").trim();
  // Persist signal log
  await env.DB.prepare(
    "INSERT OR IGNORE INTO signal_log (id, source, source_id, title, url, points, num_comments, ratio, volatility_score, friction_point, signal_strength, status, processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    "sig-" + salt, (story.source || "hn"), (story.source || "hn") + ":" + String(story.id || ""),
    story.title, story.url, story.points, story.num_comments,
    story.ratio, story.volatility_score,
    signal.friction_point, signal.signal_strength, "published", nowIso()
  ).run();
  // Persist piece
  await env.DB.prepare(
    "INSERT INTO published_pieces (id, signal_id, slug, title, body_md, core_concept, signal_source, published_at, sources_json) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(
    pieceId, "sig-" + salt, slug, title, body,
    signal.core_concept, (story.source || "hn") + ":" + story.id, nowIso(),
    JSON.stringify(buildSources(story))
  ).run();
  // Seed prompt pool with structure skeleton (headings, else title + lead paragraph).
  var skeleton = body.split("\n").filter(l => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
  if (skeleton.length < 50) {
    var leadPara = body.split("\n").map(l => l.trim()).filter(l => l.length > 40)[0] || "";
    skeleton = (title + "\n" + leadPara.slice(0, 400)).slice(0, 800);
  }
  if (skeleton.length > 50) {
    await env.DB.prepare(
      "INSERT INTO prompt_pool (id, piece_id, structure_md, active) VALUES (?,?,?,1)"
    ).bind("pp-" + salt, pieceId, skeleton).run();
  }
  // Bound the pool: keep only the 40 newest skeletons.
  await env.DB.prepare(
    "DELETE FROM prompt_pool WHERE id NOT IN (SELECT id FROM prompt_pool ORDER BY created_at DESC LIMIT 40)"
  ).run().catch(function(){});
  return { slug, title, pieceId };
}

// ---------------------------------------------------------------------------
// 7. Feedback loop — promote top 15%, purge bottom 15%
// ---------------------------------------------------------------------------
async function feedbackScan(env) {
  // Rank prompt_pool by READER VERDICTS (worth your time?) — votes, not views.
  var rows = await env.DB.prepare(
    "SELECT pp.id, pp.piece_id, pp.structure_md, p.slug, p.reads, " +
    "(SELECT COUNT(*) FROM q08_feedback f WHERE f.slug = p.slug AND f.signal = 'good') AS g, " +
    "(SELECT COUNT(*) FROM q08_feedback f WHERE f.slug = p.slug AND f.signal IN ('flat','no')) AS b " +
    "FROM prompt_pool pp JOIN published_pieces p ON p.id = pp.piece_id WHERE pp.active = 1"
  ).all();
  var all = rows.results || [];
  var promoted = 0, purged = 0;
  for (var r of all) {
    var g = Number(r.g) || 0, b = Number(r.b) || 0;
    if (g + b > 0) {
      await env.DB.prepare("UPDATE published_pieces SET feedback_score = ? WHERE slug = ?").bind(g / (g + b), r.slug).run().catch(function(){});
    }
  }
  if (all.length < 4) return { promoted: promoted, purged: purged };
  // PROMOTION (v0.7.22). The previous rule required g >= 2 && g >= 2*b (a 2:1 yes-ratio).
  // Real reader sentiment here is ~30% good / 70% flat-or-no, so that rule could NEVER
  // fire: zero pieces qualified and the proven pool was empty by construction. This now
  // implements what this function's header says - promote the TOP quantile by reader
  // verdict among pieces with a usable sample, purge the bottom quantile.
  function readerScore(r) { var g = Number(r.g) || 0, b = Number(r.b) || 0; return (g + b) > 0 ? g / (g + b) : 0; }
  var sampled = all.filter(function(r){ return ((Number(r.g) || 0) + (Number(r.b) || 0)) >= 3; });
  sampled.sort(function(x, y){ return readerScore(y) - readerScore(x) || (Number(y.g) || 0) - (Number(x.g) || 0); });
  var qn = Math.max(1, Math.floor(sampled.length * 0.15));
  for (var i = 0; i < Math.min(qn, sampled.length); i++) {
    if (readerScore(sampled[i]) < 0.5) break;
    await env.DB.prepare("UPDATE prompt_pool SET active = 2 WHERE id = ?").bind(sampled[i].id).run();
    promoted++;
  }
  for (var j = sampled.length - 1; j >= Math.max(0, sampled.length - qn); j--) {
    if (readerScore(sampled[j]) >= 0.5) break;
    await env.DB.prepare("UPDATE prompt_pool SET active = 0 WHERE id = ?").bind(sampled[j].id).run();
    purged++;
  }
  return { promoted: promoted, purged: purged };
}
// ---------------------------------------------------------------------------
// 8. Main generation cycle
// ---------------------------------------------------------------------------
// Self-referential signal: a published essay's systemic claim is emitted back into
// the fleet's signal store (signals table, source=q08) so the fleet's own self-audit
// (fleet-control scan, kaizen watchtower, cloud-ops digest) can read its own analysis
// and apply it to its own failure modes. Best-effort; never blocks publication.
async function emitContentSignal(env, piece, saved) {
  try {
    if (!env.AUDIT) return;
    var bodyText = String(piece.text || "").replace(/\n?worth your time:[\s\S]*$/im, "").trim();
    var paras = bodyText.split("\n").map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 80; });
    var openQ = paras.length ? paras[paras.length - 1].slice(0, 400) : "";
    await env.AUDIT.prepare(
      "INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      "q08:" + saved.slug,
      nowIso(),
      "q08",
      ORIGIN + "/p/" + saved.slug,
      String(saved.title || "").slice(0, 300),
      JSON.stringify([openQ]),
      0.6,
      "fleet",
      "open",
      nowIso()
    ).run();
  } catch (e) {
    // best-effort: a failed signal write must never fail a publish
  }
}

async function generate(env) {
  var t0 = Date.now();
  // Daily cap check
  var dayCount = await env.DB.prepare(
    "SELECT COUNT(*) n FROM published_pieces WHERE published_at >= ?1"
  ).bind(utcDay() + "T00:00:00.000Z").first();
  var todayN = (dayCount && dayCount.n) || 0;
  if (todayN >= MAX_PER_DAY) {
    return { ok: false, reason: "daily cap reached (" + todayN + "/" + MAX_PER_DAY + ")" };
  }
  // Scrape + rank — three sources (break the filter bubble)
  var stories = [];
  try { stories = stories.concat(await scrapeHN()); } catch (e) {}
  try { stories = stories.concat(await scrapeGitHub()); } catch (e) {}
  try { stories = stories.concat(await scrapeArxiv()); } catch (e) {}
  if (!stories.length) return { ok: false, reason: "no signals scraped" };
  // Skip already-processed signal IDs today (source-scoped)
  var processed = await env.DB.prepare(
    "SELECT source_id FROM signal_log WHERE processed_at >= ?1"
  ).bind(new Date(Date.now() - 7 * 864e5).toISOString()).all();
  var processedIds = new Set((processed.results || []).map(r => String(r.source_id)));
  var candidates = stories.filter(s => !processedIds.has(String((s.source||"hn") + ":" + s.id)));
  if (!candidates.length) return { ok: false, reason: "all signals already processed in the last 7 days" };
  // Source diversity: prefer a source other than the last one used
  var lastRun = await env.DB.prepare("SELECT top_signal FROM engine_runs WHERE top_signal != '' ORDER BY id DESC LIMIT 1").first();
  var lastSource = lastRun ? (String(lastRun.top_signal||"").split(":")[0]) : "";
  var diverse = candidates.find(function(s){ return (s.source||"hn") !== lastSource; });
  var ordered = diverse ? [diverse].concat(candidates.filter(function(s){ return s !== diverse; })) : candidates;
  // Try candidates until one yields sufficient friction (sparse GitHub/arXiv fall through)
  var story = null, friction = null;
  for (var ci = 0; ci < Math.min(ordered.length, 8); ci++) {
    var cand = ordered[ci];
    var f = null;
    try {
      if ((cand.source||"hn") === "github") f = await extractGitHubFriction(cand.id, cand.description || "");
      else if ((cand.source||"hn") === "arxiv") f = { core_concept: cand.title, friction_point: (String(cand.title||"") + ". " + String(cand.abstract||"")).slice(0,800), signal_strength: "Medium" };
      else f = await extractFriction(cand.id);
    } catch (e) { f = null; }
    if (f && f.friction_point && f.friction_point.length >= 60) { story = cand; friction = f; break; }
  }
  if (!story) {
    return { ok: false, reason: "no candidate yielded sufficient friction (" + candidates.length + " available)" };
  }
  // Few-shot only from pieces with proven reader value (reads or verdicts); otherwise none.
  var exemplars = await env.DB.prepare(
    "SELECT pp.structure_md FROM prompt_pool pp JOIN published_pieces p ON p.id = pp.piece_id WHERE pp.active = 2 AND (p.reads > 0 OR p.feedback_score > 0) ORDER BY pp.performance_score DESC, p.feedback_score DESC LIMIT 2"
  ).all();
  var fewShot = (exemplars.results || []).filter(function(r){ return exemplarOk(r.structure_md); });
  // Recent structures as divergence priming: the model must NOT repeat them.
  var recentRows = await env.DB.prepare(
    "SELECT structure_md FROM prompt_pool ORDER BY created_at DESC LIMIT 6"
  ).all();
  var recentStructures = (recentRows.results || []).map(function(r){ return r.structure_md; });
  // Compose
  var prompt = buildPrompt(friction, fewShot, recentStructures);
  var piece  = await compose(env, prompt);
  // Gate — one corrective retry on failure
  var gateResult = gate(piece.text);
  if (!gateResult.ok) {
    var retryPrompt = prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Rewrite the ENTIRE essay from scratch with a completely different structure — continuous prose, NO section headers — fixing only these issues ---\n" + gateResult.problems.join("; ");
    var retryPiece = null;
    try { retryPiece = await compose(env, retryPrompt); } catch (e) { retryPiece = null; }
    if (retryPiece && retryPiece.text) {
      var retryGate = gate(retryPiece.text);
      if (retryGate.ok) { piece = retryPiece; gateResult = retryGate; }
      else if (retryGate.problems.length === 1 && /verdict/i.test(retryGate.problems[0]) && retryGate.problems[0].indexOf("self-verdict") < 0) {
        // Verdict-only micro-call: one cheap compose asking for exactly the verdict line.
        try {
          var vp = await compose(env, "You have written an essay that passed all editorial checks. Output exactly one line, nothing else, in this form:\nworth your time: yes|flat|no — one clause of justification\nUse flat only if a reader gains little beyond the source material; use no if the piece is not worth publishing.");
          var vm2 = (vp && vp.text || "").match(/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im);
          if (vm2) {
            retryPiece.text = retryPiece.text.replace(/\s*$/, "") + "\n\n" + vm2[0];
            retryGate = gate(retryPiece.text);
            if (retryGate.ok) { piece = retryPiece; gateResult = retryGate; }
          }
        } catch (e) {}
      }
    }
  }
  if (!gateResult.ok) {
    // Mark the signal processed so the same story is not retried by the next runs.
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO signal_log (id, source, source_id, title, url, points, num_comments, ratio, volatility_score, friction_point, signal_strength, status, processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind("sig-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), (story.source || "hn"), (story.source || "hn") + ":" + String(story.id || ""), story.title, story.url, story.points, story.num_comments, story.ratio, story.volatility_score, friction.friction_point, friction.signal_strength, "gate_failed", nowIso()).run();
    } catch (e) {}
    await env.DB.prepare(
      "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status, error) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(stories.length, candidates.length, 0, (story.source||"hn") + ":" + story.title.slice(0, 80), piece.model, Date.now()-t0, "gate_failed", gateResult.problems.join("; ")).run();
    return { ok: false, reason: "gate failed: " + gateResult.problems.join("; ") };
  }
  // Strip the calibration verdict line from the published body (it gates, it does not print).
  piece.text = piece.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim();
  // Persist
  var saved = await persistPiece(env, piece, friction, story, piece.model);
  // Feedback loop (async, non-blocking)
  feedbackScan(env).catch(() => {});
  // Social cross-post (Bluesky via qnfo-social; skips silently if unset)
  await queueForDistribution(env, saved.title, saved.slug);
  pingIndexNow(env, ORIGIN + "/p/" + saved.slug).catch(() => {});
  emitContentSignal(env, piece, saved).catch(() => {});
  // Log run
  await env.DB.prepare(
    "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, top_signal, model, ms, status) VALUES (?,?,?,?,?,?,?)"
  ).bind(stories.length, candidates.length, 1, (story.source||"hn") + ":" + story.title.slice(0, 80), piece.model, Date.now()-t0, "ok").run();
  return { ok: true, slug: saved.slug, title: saved.title, model: piece.model, source: (story.source||"hn"), story: story.title };
}

// ---------------------------------------------------------------------------
// 9. HTML rendering
// ---------------------------------------------------------------------------
var MATH_HEAD = "<script>window.MathJax={tex:{inlineMath:[[\"\\\\(\",\"\\\\)\"]],displayMath:[[\"$$\",\"$$\"],[\"\\\\[\",\"\\\\]\"]],processEscapes:true},svg:{scale:1.1,fontCache:\"global\"},options:{skipHtmlTags:[\"script\",\"noscript\",\"style\",\"textarea\",\"pre\",\"code\"],enableMenu:false}};function __mq(){if(window.MathJax&&MathJax.typesetPromise){MathJax.typesetPromise().catch(function(){})}}if(document.readyState===\"complete\"){setTimeout(__mq,150)}else{window.addEventListener(\"load\",function(){setTimeout(__mq,150)})}</script><script async src=\"https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js\" onerror=\"this.onerror=null;var s=document.createElement('script');s.src='https://unpkg.com/mathjax@3/es5/tex-svg.js';document.head.appendChild(s);\"></script>";
function safeUrl(u) {
  var x = String(u || "").trim();
  return /^https?:\/\//i.test(x) ? x : "";
}

function renderSources(sj) {
  var arr = [];
  try { arr = JSON.parse(sj || "[]"); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  var items = [];
  for (var s of arr) {
    if (typeof s === "string") s = { url: s };
    if (!s || typeof s !== "object") continue;
    var url = safeUrl(s.url || s.href);
    if (!url) continue;
    var label = escHtml(s.label || s.title || url);
    items.push('<li><a href="' + escHtml(url) + '" rel="noopener noreferrer">' + label + "</a></li>");
  }
  if (!items.length) return "";
  return '<section class="refs"><h2>Sources &amp; further reading</h2><ul>' + items.join("") + "</ul></section>";
}

function buildSources(story) {
  var out = [], src = story.source || "hn", u = String(story.url || "").trim();
  if (src === "github") {
    var repo = String(story.id || "").replace(/^.*?([^\/]+\/[^\/]+)$/, "$1");
    out.push({ label: "GitHub repository: " + (repo || story.title), url: u || "https://github.com/" + repo });
  } else if (src === "arxiv") {
    out.push({ label: "arXiv: " + String(story.title || "").slice(0, 120), url: u || "https://arxiv.org/abs/" + story.id });
  } else {
    if (u) { var host = ""; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch (e) {} out.push({ label: host || u, url: u }); }
    if (story.id) out.push({ label: "Hacker News discussion", url: "https://news.ycombinator.com/item?id=" + story.id });
  }
  return out;
}

function mdEmph(x) {
  var parts = String(x).split(/(\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue;
    parts[i] = parts[i].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>");
  }
  return parts.join("");
}

var CSS = `
:root{--bg:#f9f7f4;--fg:#1c1a18;--mut:#6b6560;--line:#e0d9d0;--acc:#5a3e2b;--max:42rem}
@media(prefers-color-scheme:dark){:root{--bg:#161412;--fg:#e8e3dc;--mut:#9a938b;--line:#2e2a25;--acc:#c9956e}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font:17px/1.68 Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:var(--max);margin:0 auto;padding:3rem 1.2rem 5rem}
header{border-bottom:1px solid var(--line);padding-bottom:1.2rem;margin-bottom:2.5rem}
header h1{font-size:1.05rem;font-weight:400;letter-spacing:.04em;color:var(--mut);text-transform:uppercase}
header p{font-size:.88rem;color:var(--mut);margin-top:.3rem}
nav{display:flex;gap:1.2rem;margin-top:.8rem;font-size:.88rem}
nav a{color:var(--acc);text-decoration:none}
nav a:hover{text-decoration:underline}
article{margin-bottom:3rem;padding-bottom:2rem;border-bottom:1px solid var(--line)}
article:last-child{border-bottom:none}
article h2{font-size:1.22rem;font-weight:600;line-height:1.3;margin-bottom:.5rem}
article h2 a{color:var(--fg);text-decoration:none}
article h2 a:hover{color:var(--acc)}
article .meta{font-size:.82rem;color:var(--mut);margin-bottom:.8rem}
article .lede{font-size:.97rem;color:var(--mut);line-height:1.6}
.piece h1{font-size:1.5rem;line-height:1.25;margin-bottom:.6rem}
.piece h2{font-size:1.15rem;margin:1.8rem 0 .5rem;font-weight:600}
.piece h3{font-size:1rem;margin:1.4rem 0 .4rem;font-weight:600;color:var(--acc)}
.piece p{margin-bottom:1rem}
.piece ul,.piece ol{margin:.6rem 0 1rem 1.4rem}
.piece li{margin-bottom:.3rem}
.piece strong{font-weight:600}
.piece em{font-style:italic}
.fb{margin:2.2rem 0 0;padding-top:1.2rem;border-top:1px solid var(--line);font-size:.92rem;color:var(--mut)}
.fb a{margin:0 .7rem 0 0;color:var(--acc);text-decoration:none}
.fb a:hover{text-decoration:underline}
footer{margin-top:4rem;padding-top:1.5rem;border-top:1px solid var(--line);font-size:.82rem;color:var(--mut)}
.chip{display:inline-block;font-size:.75rem;padding:.15rem .5rem;border-radius:3px;background:var(--line);color:var(--mut);margin-right:.4rem}
.refs{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--line)}
.refs h2{font-size:.95rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:400;margin-bottom:.8rem}
.refs ul{margin:0;padding-left:1.2rem}
.refs li{margin-bottom:.4rem;font-size:.92rem}
.refs a{color:var(--acc)}
.refs a:hover{text-decoration:underline}
`;

function renderIndex(pieces) {
  var items = pieces.map(function(p) {
    var date = (p.published_at || "").slice(0, 10);
    var lede = (p.body_md || "").replace(/^#+\s*.+\n?/m, "").replace(/[#*_`]/g, "").trim().slice(0, 180);
    return [
      '<article>',
      '<h2><a href="/p/' + escHtml(p.slug) + '">' + escHtml(p.title) + '</a></h2>',
      '<div class="meta">' + date + (p.core_concept ? ' &middot; <span class="chip">' + escHtml(p.core_concept.slice(0,40)) + '</span>' : '') + '</div>',
      lede ? '<div class="lede">' + escHtml(lede) + '&hellip;</div>' : '',
      '</article>',
    ].join("\n");
  }).join("\n");
  return '<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>q08</title><meta name=description content="Systems-level critique of technical industry friction. Cold, structural, timeless."><style>' + CSS + '</style>' + MATH_HEAD + '</head><body><div class=wrap><header><h1>q08</h1><p>Systems-level critique. Structural. Timeless.</p><nav><a href="/">Index</a><a href="/feed.xml">RSS</a><a href="/subscribe">Subscribe</a><a href="/health">Status</a></nav></header>' + (items || '<p style="color:var(--mut)">No pieces published yet. Check back soon.</p>') + '<footer>q08 &mdash; autonomous signal engine &mdash; updated continuously</footer></div></body></html>';
}

function mdToHtml(md) {
  // Minimal Markdown -> HTML (headings, bold, italic, bullets, paragraphs)
  var lines = md.split("\n");
  var out = [];
  var inUl = false;
  for (var line of lines) {
    var h3 = line.match(/^### (.+)/);
    var h2 = line.match(/^## (.+)/);
    var h1 = line.match(/^# (.+)/);
    var li = line.match(/^[-*] (.+)/);
    var blank = line.trim() === "";
    if (h1) { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<h1>" + escHtml(h1[1]) + "</h1>"); }
    else if (h2) { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<h2>" + escHtml(h2[1]) + "</h2>"); }
    else if (h3) { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<h3>" + escHtml(h3[1]) + "</h3>"); }
    else if (li) { if (!inUl) { out.push("<ul>"); inUl=true; } out.push("<li>" + mdEmph(escHtml(li[1])) + "</li>"); }
    else if (blank) { if (inUl) { out.push("</ul>"); inUl=false; } }
    else { if (inUl) { out.push("</ul>"); inUl=false; } out.push("<p>" + mdEmph(escHtml(line)) + "</p>"); }
  }
  if (inUl) out.push("</ul>");
  return out.join("\n");
}

function renderPiece(p) {
  var body = mdToHtml(p.body_md || "");
  var refs = renderSources(p.sources_json);
  var fb = '<div class="fb">Was this worth your time? <a href="/api/f?slug=' + escHtml(p.slug) + '&s=good">yes</a><a href="/api/f?slug=' + escHtml(p.slug) + '&s=flat">flat</a><a href="/api/f?slug=' + escHtml(p.slug) + '&s=no">no</a></div>';
  var date = (p.published_at || "").slice(0, 10);
  return '<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>' + escHtml(p.title) + ' — q08</title><meta name=description content="' + escHtml((p.body_md||"").replace(/[#*_`\n]/g," ").trim().slice(0,160)) + '"><style>' + CSS + '</style>' + MATH_HEAD + '</head><body><div class=wrap><header><h1><a href="/" style="color:inherit;text-decoration:none">q08</a></h1><nav><a href="/">← Index</a><a href="/feed.xml">RSS</a><a href="/subscribe">Subscribe</a></nav></header><div class=piece><h1>' + escHtml(p.title) + '</h1><div class="meta" style="margin-bottom:1.5rem">' + date + (p.core_concept ? ' &middot; <span class="chip">' + escHtml(p.core_concept.slice(0,40)) + '</span>' : '') + '</div>' + body + fb + refs + '</div><footer>q08 &mdash; autonomous signal engine</footer></div></body></html>';
}

function renderFeed(pieces) {
  var items = pieces.map(function(p) {
    var date = new Date(p.published_at || Date.now()).toUTCString();
    var desc = (p.body_md || "").replace(/\\/g, "").replace(/[<>&"]/g, function(c){return{"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c];}).slice(0, 500);
    return "<item><title>" + escHtml(p.title) + "</title><link>https://q08.org/p/" + escHtml(p.slug) + "</link><pubDate>" + date + "</pubDate><description>" + desc + "...</description></item>";
  }).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>q08</title><link>https://q08.org</link><description>Systems-level critique. Structural. Timeless.</description>' + items + '</channel></rss>';
}

// ---------------------------------------------------------------------------
// 10. Worker export
// ---------------------------------------------------------------------------
// ============ Email + Social ============
async function sha16(s) {
  var enc = new TextEncoder();
  var buf = await crypto.subtle.digest("SHA-256", enc.encode(String(s)));
  return Array.from(new Uint8Array(buf)).slice(0,16).map(function(b){return b.toString(16).padStart(2,"0");}).join("");
}
async function sendEmail(env, to, subject, body) {
  // Tokenless path: native Email Routing send binding (q08.org). No API key needed.
  if (env.SEND_EMAIL) {
    try {
      await env.SEND_EMAIL.send({ to: to, from: "digest@q08.org", subject: subject, text: body });
      return { ok: true, via: "send_email" };
    } catch (e) {
      return { ok: false, error: "send_email: " + String(e && e.message || e) };
    }
  }
  // Fallback: qnfo-email HTTP API (requires EMAIL_API_KEY).
  if (!env.EMAIL) return { ok: false, error: "no email path" };
  try {
    var resp = await env.EMAIL.fetch("https://email.internal/send", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") }, body: JSON.stringify({ to: to, from: "qnfo@qnfo.org", subject: subject, body: body }) });
    return { ok: resp.ok, status: resp.status };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
async function sendDigest(env) {
  var day = utcDay();
  var pieces = await env.DB.prepare("SELECT slug, title FROM published_pieces WHERE published_at >= ?1 ORDER BY published_at ASC").bind(day + "T00:00:00.000Z").all();
  var rows = pieces.results || [];
  if (!rows.length) return { ok: true, skipped: "no pieces today", pieces: 0 };
  var subs = await env.DB.prepare("SELECT email, token FROM subscribers WHERE status='confirmed' LIMIT 500").all();
  var list = rows.map(function(r){ return "- " + r.title + " - https://q08.org/p/" + r.slug; }).join("\n");
  var sent = 0;
  for (var s of (subs.results || [])) {
    var body = "q08 - daily digest (" + day + ")\n\n" + list + "\n\nUnsubscribe: https://q08.org/unsubscribe?t=" + s.token;
    var r = await sendEmail(env, s.email, "q08 - daily digest", body);
    if (r && r.ok) sent++;
  }
  return { ok: true, pieces: rows.length, subscribers: (subs.results||[]).length, sent: sent };
}
// IndexNow: instant search-index ping for a newly published URL (no auth needed).
async function pingIndexNow(env, url) {
  try {
    var resp = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "q08.org", key: INDEXNOW_KEY, keyLocation: ORIGIN + "/" + INDEXNOW_KEY + ".txt", urlList: [url] })
    });
    return { ok: resp.ok, status: resp.status };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// Distribution via qnfo-social (Bluesky + Buffer cross-post). Tokenless:
// write to the shared social_threads queue in qnfo-audit; qnfo-social's cron
// picks it up and cross-posts. Buffer covers Mastodon + LinkedIn + X.
async function queueForDistribution(env, title, slug) {
  if (!env.AUDIT) return { ok: false, skip: "no audit binding" };
  try {
    var text = (title + " \u2014 https://q08.org/p/" + slug).slice(0, 280);
    var id = "q08-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await env.AUDIT.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status) VALUES (?,?,?, 'queued')").bind(id, String(title || "").slice(0, 300), JSON.stringify([text])).run();
    return { ok: true, queued: id };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
async function handleSubscribe(req, env, url) {
  var email = "";
  if (req.method === "POST") {
    try {
      var ct = req.headers.get("Content-Type") || "";
      if (ct.indexOf("application/json") >= 0) { var b = await req.json(); email = b && b.email || ""; }
      else if (ct.indexOf("form") >= 0) { var fd = await req.formData(); email = fd.get("email") || ""; }
    } catch (e) {}
  }
  email = String(email || url.searchParams.get("email") || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    var bad = req.method === "POST";
    return html('<h2>Subscribe</h2><form method=post action=/subscribe><input type=email name=email required><button>Subscribe</button></form>' + (bad ? '<p>Enter a valid email address.</p>' : '<p>One email a day — the daily digest. No spam.</p>'), bad ? 400 : 200);
  }
  var token = await sha16(email + ":q08:sub");
  await env.DB.prepare("INSERT INTO subscribers(email, status, token, created_at) VALUES(?, 'pending', ?, ?) ON CONFLICT(email) DO UPDATE SET token=excluded.token, status=CASE WHEN status='confirmed' THEN 'confirmed' ELSE 'pending' END").bind(email, token, nowIso()).run();
  await sendEmail(env, email, "Confirm your q08 subscription", "Tap to confirm: https://q08.org/confirm?t=" + token);
  return html("<h2>Almost there</h2><p>Check your inbox for a confirmation link.</p>");
}

export default {
  async fetch(req, env, ctx) {
    var url  = new URL(req.url);
    var path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health") {
      var cnt = await env.DB.prepare("SELECT COUNT(*) n FROM published_pieces").first().catch(() => ({n:0}));
      var last = await env.DB.prepare("SELECT slug, title, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 1").first().catch(() => null);
      var runs = await env.DB.prepare("SELECT status, COUNT(*) n FROM engine_runs GROUP BY status").all().catch(() => ({results:[]}));
      return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["signal-scrape", "llm-compose", "essay-publish", "essay-regen", "rss", "mathjax-render", "sources-footer", "email-digest", "indexnow", "reader-verdict-vote", "self-verdict-gate", "feedback-calibration", "cross-day-signal-dedup", "fabrication-gate", "self-referential-signal-emit"], limitations: ["publisher/composer only - does NOT run a general agent tool loop and does not execute arbitrary code", "not a general-purpose model endpoint; use qnfo-ai for inference", "/run is unauthenticated but rate-limited to 5 per IP per hour", "writes only to its own q08-signal D1; never writes research or personal stores", "no streaming"], pieces: cnt.n, last, runs: runs.results });
    }

    if (path === "/run" && req.method === "POST") {
      // Unauthenticated trigger: bound abuse with a per-IP rate limit (crons call generate() directly).
      var runIp = String(req.headers.get("cf-connecting-ip") || "anon");
      var runIk = await sha16("run:" + runIp);
      var runRate = await env.DB.prepare("SELECT COUNT(*) n FROM q08_run_rate WHERE ip_key=? AND created_at > datetime('now','-1 hour')").bind(runIk).first().catch(function(){ return { n: 0 }; });
      if ((runRate && runRate.n || 0) >= 5) return json({ ok: false, error: "rate limited" }, 429);
      await env.DB.prepare("INSERT INTO q08_run_rate (ip_key, created_at) VALUES (?,?)").bind(runIk, nowIso()).run().catch(function(){});
      await env.DB.prepare("DELETE FROM q08_run_rate WHERE created_at < datetime('now','-24 hours')").run().catch(function(){});
      // Detach: generate() takes 30-90s (HN fetch + LLM). Return immediately,
      // run in background via waitUntil so the HTTP response is not blocked.
      var async_mode = url.searchParams.get("async") !== "0";
      if (async_mode) {
        var runId = Date.now().toString(36);
        await env.DB.prepare("INSERT INTO engine_runs (ms,status,error) VALUES (0,'running',?)").bind("run-id:" + runId + " async generation started").run().catch(function(){});
        ctx.waitUntil(generate(env).then(async (out) => {
          await env.DB.prepare("UPDATE engine_runs SET error=? WHERE id=(SELECT MAX(id) FROM engine_runs)")
            .bind("run-id:" + runId + " result:" + JSON.stringify(out).slice(0,200)).run().catch(()=>{});
        }).catch(async (e) => {
          await env.DB.prepare("INSERT INTO engine_runs (ms,status,error) VALUES (0,'error',?)").bind(String(e&&e.message||e).slice(0,500)).run().catch(()=>{});
        }));
        return json({ ok: true, worker: WORKER, version: VERSION, mode: "async", run_id: runId, note: "generating in background; poll /api/runs or /health. Async runs may be cut short by the platform after ~30s; the cron path is the reliable one." });
      }
      var out = await generate(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out });
    }

    if (path === "/regen" && req.method === "POST") {
      // Regenerate a single existing piece from its original signal, through the
      // current directive. Reuses buildPrompt/compose/gate. Rate-limited per IP.
      var rip2 = String(req.headers.get("cf-connecting-ip") || "anon");
      var rik2 = await sha16("regen:" + rip2);
      var rr2 = await env.DB.prepare("SELECT COUNT(*) n FROM q08_run_rate WHERE ip_key=? AND created_at > datetime('now','-1 hour')").bind(rik2).first().catch(function(){ return { n: 0 }; });
      if ((rr2 && rr2.n || 0) >= 10) return json({ ok: false, error: "rate limited" }, 429);
      await env.DB.prepare("INSERT INTO q08_run_rate (ip_key, created_at) VALUES (?,?)").bind(rik2, nowIso()).run().catch(function(){});

      var target = String(url.searchParams.get("slug") || "").slice(0, 200);
      if (!target) return json({ ok: false, error: "slug required" }, 400);
      var prow = await env.DB.prepare("SELECT * FROM published_pieces WHERE slug = ?").bind(target).first();
      if (!prow) return json({ ok: false, error: "piece not found" }, 404);
      var srow = await env.DB.prepare("SELECT * FROM signal_log WHERE (source_id = ? OR source_id = ?) AND friction_point IS NOT NULL AND length(friction_point) > 40 ORDER BY length(friction_point) DESC LIMIT 1").bind(prow.signal_source, String(prow.signal_source||"").indexOf(":") >= 0 ? String(prow.signal_source).split(":").slice(1).join(":") : prow.signal_source).first();
      if (!srow) return json({ ok: false, error: "signal friction not found" }, 404);
      var friction = { core_concept: prow.core_concept || srow.title, friction_point: srow.friction_point || "", signal_strength: srow.signal_strength || "Medium" };
      var recentRows = await env.DB.prepare("SELECT structure_md FROM prompt_pool ORDER BY created_at DESC LIMIT 6").all();
      var recentStructures = (recentRows.results || []).map(function(r){ return r.structure_md; });
      var prompt = buildPrompt(friction, [], recentStructures);
      var piece = await compose(env, prompt);
      var gateResult = gate(piece.text);
      if (!gateResult.ok) {
        var retryPrompt = prompt + "\n\n--- CORRECTIVE FEEDBACK: your previous draft was rejected. Rewrite the ENTIRE essay from scratch with a completely different structure — continuous prose, NO section headers — fixing only these issues ---\n" + gateResult.problems.join("; ");
        var retryPiece = null;
        try { retryPiece = await compose(env, retryPrompt); } catch (e) { retryPiece = null; }
        if (retryPiece && retryPiece.text) {
          var retryGate = gate(retryPiece.text);
          if (retryGate.ok) { piece = retryPiece; gateResult = retryGate; }
          else if (retryGate.problems.length === 1 && /verdict/i.test(retryGate.problems[0]) && retryGate.problems[0].indexOf("self-verdict") < 0) {
            try {
              var vp2 = await compose(env, "You have written an essay that passed all editorial checks. Output exactly one line, nothing else, in this form:\nworth your time: yes|flat|no \u2014 one clause of justification\nUse flat only if a reader gains little beyond the source material; use no if the piece is not worth publishing.");
              var vm3 = (vp2 && vp2.text || "").match(/worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-]\s*\S[^\n]*$/im);
              if (vm3) { retryPiece.text = retryPiece.text.replace(/\s*$/, "") + "\n\n" + vm3[0]; retryGate = gate(retryPiece.text); if (retryGate.ok) { piece = retryPiece; gateResult = retryGate; } }
            } catch (e) {}
          }
        }
      }
      if (!gateResult.ok) return json({ ok: false, error: "gate failed: " + gateResult.problems.join("; ") }, 422);
      piece.text = piece.text.replace(/\n?worth your time:\s*(yes|flat|no)\s*[\u2014\u2013-].*$/im, "").trim();
      var tm = piece.text.match(/^#\s+(.+)$/m);
      var title = tm ? tm[1].trim() : prow.title;
      var body = piece.text.replace(/^#\s+.+\n?/, "").trim();
      await env.DB.prepare("UPDATE published_pieces SET title = ?, body_md = ? WHERE slug = ?").bind(title, body, target).run();
      var skel = body.split("\n").filter(l => l.startsWith("#") || l.startsWith("- ") || l.startsWith("**")).join("\n").slice(0, 800);
      if (skel.length < 50) { var lp = body.split("\n").map(l => l.trim()).filter(l => l.length > 40)[0] || ""; skel = (title + "\n" + lp.slice(0, 400)).slice(0, 800); }
      await env.DB.prepare("UPDATE prompt_pool SET structure_md = ?, active = 0 WHERE piece_id = ?").bind(skel, prow.id).run().catch(function(){});
      return json({ ok: true, slug: prow.slug, title: title, model: piece.model, words: body.split(/\s+/).length });
    }

    if (path === "/api/f") {
      var s = (url.searchParams.get("s") || "").toLowerCase();
      var fslug = String(url.searchParams.get("slug") || "").slice(0, 200);
      if (s !== "good" && s !== "flat" && s !== "no") return json({ ok: false, error: "s must be good|flat|no" }, 400);
      if (!fslug) return json({ ok: false, error: "slug required" }, 400);
      var ip = String(req.headers.get("cf-connecting-ip") || "anon");
      var ipKey = await sha16(ip + ":" + fslug);
      var prev = await env.DB.prepare("SELECT id FROM q08_feedback WHERE ip_key = ? AND slug = ?").bind(ipKey, fslug).first().catch(function(){ return null; });
      if (prev) return json({ ok: true, updated: false, note: "vote already recorded" });
      var rate = await env.DB.prepare("SELECT COUNT(*) n FROM q08_feedback WHERE ip_key = ? AND created_at > datetime('now','-1 hour')").bind(ipKey).first().catch(function(){ return { n: 0 }; });
      if ((rate && rate.n || 0) >= 5) return json({ ok: false, error: "rate limited" }, 429);
      await env.DB.prepare("INSERT OR IGNORE INTO q08_feedback (slug, signal, ip_key, created_at) VALUES (?,?,?,?)").bind(fslug, s, ipKey, nowIso()).run();
      return json({ ok: true, recorded: s });
    }
    if (path === "/feed.xml") {
      var rows = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 20").all();
      return new Response(renderFeed(rows.results || []), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
    }

    if (path.startsWith("/p/")) {
      var slug = path.slice(3);
      var piece = await env.DB.prepare("SELECT * FROM published_pieces WHERE slug=?").bind(slug).first();
      if (!piece) return html("<h1>Not found</h1>", 404);
      // Increment read count
      env.DB.prepare("UPDATE published_pieces SET reads=reads+1 WHERE slug=?").bind(slug).run().catch(() => {});
      return html(renderPiece(piece));
    }

    if (path === "/sitemap.xml") {
      var srows = await env.DB.prepare("SELECT slug, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 5000").all();
      var surls = (srows.results || []).map(function (r) {
        return "<url><loc>" + ORIGIN + "/p/" + encodeURIComponent(r.slug) + "</loc><lastmod>" + String(r.published_at || "").slice(0, 10) + "</lastmod></url>";
      }).join("");
      var sxml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + '<url><loc>' + ORIGIN + '</loc></url><url><loc>' + ORIGIN + '/feed.xml</loc></url>' + surls + '</urlset>';
      return new Response(sxml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=1800" } });
    }

    if (path === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\n\nSitemap: " + ORIGIN + "/sitemap.xml\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (path === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (path === "/subscribe") return await handleSubscribe(req, env, url);
    if (path === "/confirm") { var t0 = url.searchParams.get("t")||""; await env.DB.prepare("UPDATE subscribers SET status='confirmed', confirmed_at=? WHERE token=? AND status!='unsubscribed'").bind(nowIso(), t0).run(); return html("<h2>Subscribed</h2><p>You are subscribed. The daily digest arrives each evening.</p>"); }
    if (path === "/unsubscribe") { var t1 = url.searchParams.get("t")||""; await env.DB.prepare("UPDATE subscribers SET status='unsubscribed' WHERE token=?").bind(t1).run(); return html("<h2>Unsubscribed</h2><p>You have been removed from the daily digest.</p>"); }
    if (path === "/api/pieces") {
      var rows = await env.DB.prepare("SELECT slug, title, core_concept, published_at, reads FROM published_pieces ORDER BY published_at DESC LIMIT 50").all();
      return json(rows.results || []);
    }

    if (path === "/api/signals") {
      var rows = await env.DB.prepare("SELECT id, source, title, volatility_score, ratio, signal_strength, status, created_at FROM signal_log ORDER BY created_at DESC LIMIT 30").all();
      return json(rows.results || []);
    }

    if (path === "/api/runs") {
      var rows = await env.DB.prepare("SELECT * FROM engine_runs ORDER BY id DESC LIMIT 20").all();
      return json(rows.results || []);
    }

    // Index
    var pieces = await env.DB.prepare("SELECT slug, title, body_md, core_concept, published_at FROM published_pieces ORDER BY published_at DESC LIMIT 20").all().catch(() => ({results:[]}));
    return html(renderIndex(pieces.results || []));
  },

  async scheduled(controller, env, ctx) {
    if (controller.cron === "0 17 * * *") { ctx.waitUntil(sendDigest(env)); return; }
    ctx.waitUntil(generate(env).catch(async (e) => {
      await env.DB.prepare(
        "INSERT INTO engine_runs (signals_scraped, signals_scored, piece_published, ms, status, error) VALUES (0,0,0,0,'error',?)"
      ).bind(String(e && e.message || e).slice(0, 500)).run().catch(() => {});
    }));
  },
};
