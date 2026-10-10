// qnfo-paper-explainer v0.3.0 (PAPER-VERIFY-1: every claim grounded in the abstract, two-family fact-check, fail closed)
// Daily autonomous science-translation pipeline (100% cloud, user-free):
//   recent arXiv papers -> AI-select one accessible paper -> plain-English "what it is"
//   + honest everyday-life "why it matters (or not)" -> fact-check -> 4-post Bluesky thread
//   -> D1 audit log (paper_explain_log + cloud_ops_events) + Buffer cross-post
//   (Mastodon/LinkedIn/X via GraphQL API, best-effort).
// Goal: grow QNFO reach/awareness by being the account that explains science to everyone.
// Bluesky account: qnfo.bsky.social (shared with qnfo-social). Posted via our own AT Protocol
// session so the explainer keeps a guaranteed daily cadence, independent of the qnfo-social
// publication queue backlog.
//
// DESIGN GATES (self-imposed, see README):
//   HONEST-OR-NOT-1   every explanation states the application the ABSTRACT states, or plainly that it states none
//                     (STATED_APPLICATION / NONE_STATED); no invented products, timelines or examples.
//   FACT-CHECK-1      all text is checked against the abstract before posting (deterministic names/years/figures check, then two
//                     reviewers from other model families); flagged -> draft; reviewer outage -> nothing posted (fail closed).
//   DEDUPE-1          one explanation per arXiv id (UNIQUE(arxiv_id)).
//   DAILY-CAP-1       max 1 thread/day (DAILY_CAP).
//   KILL-SWITCH-1     paper_explain_state.enabled=0 halts posting (still logs dry runs).

var VERSION = "0.3.1-doi-scrub";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"; // non-reasoning, fp8-fast (24k ctx), fast + cheap
const BSKY = "https://bsky.social/xrpc";
const UA = "Mozilla/5.0 (qnfo-paper-explainer)";
const ARXIV_CATS = "(cat:cs.AI OR cat:cs.LG OR cat:cs.CL OR cat:cs.CV OR cat:cs.CY OR cat:cs.HC OR cat:physics.pop-ph OR cat:q-bio.NC OR cat:econ.GN OR cat:stat.ML)";
const DAILY_CAP = 1;
const MAX_FETCH = 30;
const NL = String.fromCharCode(10);

// ---------- small helpers ----------
function truncate(text, max) {
  const pts = Array.from(String(text || ""));
  if (pts.length <= max) return String(text || "");
  return pts.slice(0, max).join("");
}

function extractText(ai) {
  if (!ai) return "";
  if (typeof ai === "string") return ai;
  if (typeof ai.response === "string" && ai.response) return ai.response;
  if (ai.result) {
    if (typeof ai.result === "string") return ai.result;
    if (typeof ai.result.response === "string" && ai.result.response) return ai.result.response;
  }
  const ch = (ai.choices && ai.choices[0]) || (ai.result && ai.result.choices && ai.result.choices[0]);
  if (ch) {
    if (ch.message && typeof ch.message.content === "string") return ch.message.content;
    if (typeof ch.text === "string") return ch.text;
  }
  if (typeof ai.output === "string") return ai.output;
  return "";
}

function sanitizePosts(raw) {
  return (raw || []).map((x) => truncate(String(x), 290)).filter((x) => x.trim());
}

function auth(request, env) {
  const tok = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return false;
  const exp = env.EXPLAIN_TOKEN;
  if (!exp || tok.length !== exp.length) return false;
  let d = 0;
  for (let i = 0; i < tok.length; i++) d |= tok.charCodeAt(i) ^ exp.charCodeAt(i);
  return d === 0;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ---------- arXiv ----------
function parseArxiv(xml) {
  const entries = xml.split("<entry>").slice(1);
  const out = [];
  for (const en of entries) {
    const title = ((en.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/\s+/g, " ").trim();
    const id = (en.match(/<id>[\s\S]*?arxiv\.org\/abs\/([^<]+)<\/id>/) || [])[1] || "";
    const pub = ((en.match(/<published>([^<]+)<\/published>/) || [])[1] || "").slice(0, 10);
    const summary = ((en.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || "").replace(/\s+/g, " ").trim();
    const authors = [];
    const am = en.match(/<name>([\s\S]*?)<\/name>/g) || [];
    for (const a of am) authors.push(a.replace(/<\/?name>/g, "").trim());
    if (title && id) out.push({ id: id.trim(), title: title.slice(0, 220), published: pub, authors: authors.slice(0, 4), abstract: summary.slice(0, 1500) });
  }
  return out;
}

async function fetchArxiv() {
  const q = encodeURIComponent(ARXIV_CATS);
  const r = await fetch("https://export.arxiv.org/api/query?search_query=" + q + "&start=0&max_results=" + MAX_FETCH + "&sortBy=submittedDate&sortOrder=descending", { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("arxiv " + r.status);
  return parseArxiv(await r.text());
}

// ---------- Bluesky (AT Protocol) ----------
async function bskySession(env) {
  const r = await fetch(BSKY + "/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASS })
  });
  if (!r.ok) throw new Error("bsky session " + r.status);
  return r.json();
}

async function bskyPostText(s, text, reply) {
  const record = { text: truncate(text, 290), createdAt: new Date().toISOString() };
  if (reply) record.reply = reply;
  const r = await fetch(BSKY + "/com.atproto.repo.createRecord", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, "Authorization": "Bearer " + s.accessJwt },
    body: JSON.stringify({ repo: s.did, collection: "app.bsky.feed.post", record })
  });
  if (!r.ok) throw new Error("bsky post " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

async function bskyPostThread(s, posts) {
  let root = null, parent = null;
  const uris = [];
  for (let i = 0; i < posts.length; i++) {
    const reply = i > 0 ? { root, parent } : undefined;
    const res = await bskyPostText(s, posts[i], reply);
    uris.push(res.uri);
    if (i === 0) root = { uri: res.uri, cid: res.cid };
    parent = { uri: res.uri, cid: res.cid };
  }
  return uris;
}

// ---------- Buffer cross-post (GraphQL API) ----------
async function bufferGql(env, query) {
  const r = await fetch("https://api.buffer.com", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.BUFFER_TOKEN || ""), "User-Agent": UA },
    body: JSON.stringify({ query })
  });
  if (!r.ok) throw new Error("buffer gql " + r.status);
  return r.json();
}

async function bufferPost(env, text) {
  if (!env.BUFFER_TOKEN) return { skipped: "no BUFFER_TOKEN" };
  const results = [];
  try {
    const orgRes = await bufferGql(env, "{ account { organizations { id } } }");
    const orgs = (orgRes && orgRes.data && orgRes.data.account && orgRes.data.account.organizations) || [];
    if (!orgs.length) return { error: "no buffer org" };
    const orgId = orgs[0].id;
    const chRes = await bufferGql(env, "{ channels(input: { organizationId: \"" + orgId + "\" }) { id service isDisconnected } }");
    const channels = (chRes && chRes.data && chRes.data.channels) || [];
    for (const svc of ["mastodon", "linkedin", "twitter"]) {
      const ch = channels.find((c) => c.service === svc && !c.isDisconnected);
      if (!ch) { results.push({ platform: svc, status: "no-channel" }); continue; }
      try {
        const mutation = "mutation CreatePost { createPost(input: { text: " + JSON.stringify(text) + ", channelId: \"" + ch.id + "\", schedulingType: automatic, mode: shareNow }) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }";
        const r = await bufferGql(env, mutation);
        const cp = r && r.data && r.data.createPost;
        if (cp && cp.post) results.push({ platform: svc, status: "ok", post_id: cp.post.id });
        else results.push({ platform: svc, status: "error", error: (cp && cp.message) || JSON.stringify(r).slice(0, 120) });
      } catch (e) {
        results.push({ platform: svc, status: "error", error: String(e && e.message || e) });
      }
    }
  } catch (e) {
    results.push({ status: "error", error: String(e && e.message || e) });
  }
  return { results };
}

// ---------- AI select + explain ----------
function parseJSON(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/g, "").trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  const lo = cleaned.indexOf("{"), hi = cleaned.lastIndexOf("}");
  if (lo >= 0 && hi > lo) {
    try { return JSON.parse(cleaned.slice(lo, hi + 1)); } catch (e2) {}
  }
  return null;
}

// PAPER-VERIFY-1 (owner directive 2026-10-10): the prompts below specify PROCESS and STYLE only. They name no topic, product,
// organisation, era or scenario; the only facts a post may carry are the ones in the supplied title and abstract.
const NO_APPLICATION = "The abstract does not state a practical application.";
const ABSTRACT_MAX = 1500;
function paperBlock(p) {
  return p.id + " | " + p.title + " | " + p.authors.slice(0, 3).join(", ") + " | " + p.abstract.slice(0, ABSTRACT_MAX);
}
function explainRules() {
  return [
    "GROUNDING RULE: you work only from the paper text supplied below. Every claim, name, number, date, method and result you write must be stated in the chosen paper's title or abstract. Your own knowledge is not a source. Add no background and no named thing (tool, organisation, person, place) that the abstract does not name, no timelines or forecasts, and no analogies or examples of your own.",
    "Field rules:",
    "- arxiv_id: copied exactly from the chosen paper's line.",
    "- headline: one short plain-English rephrase of the title, using only what the title says.",
    "- what_it_is: 2-3 sentences paraphrasing what the abstract says was done and found, in plain words, no formulas.",
    "- stated_application: if the abstract itself states a use, application or implication, paraphrase or quote it in 1-2 sentences without making it stronger. If it states none, this field is exactly: \"" + NO_APPLICATION + "\"",
    "- relevance_label: exactly one of STATED_APPLICATION (the abstract states an application) or NONE_STATED (it does not).",
    "- buffer_post: ONE self-contained post under 280 characters: the plain-English claim from the abstract plus the arxiv.org/abs/<id> link. No hype.",
    "- posts: exactly 4 posts, each under 280 characters, plain English, no exclamation marks, no emoji, no hype. Use only facts from the abstract; state results with the same strength the abstract does.",
    "  post[0]: the plain-English claim as a hook.",
    "  post[1]: what was done and found, in plain language.",
    "  post[2]: the application the abstract states, or plainly that the abstract states none.",
    "  post[3]: the link arxiv.org/abs/<id> plus one takeaway taken from the abstract."
  ];
}
async function selectAndExplain(env, papers) {
  const prompt = [
    "You are a science translator. Your reader has no scientific training.",
    "Below are recent arXiv papers (id | title | authors | abstract).",
    "Step 1: choose the ONE paper whose abstract can be explained most clearly in plain words without advanced mathematics.",
    "Step 2: for that ONE paper, write a plain-English explanation and a 4-post social thread.",
    "",
    "Reply with STRICT JSON only, exactly this shape:",
    '{"arxiv_id":"...","headline":"...","what_it_is":"...","stated_application":"...","relevance_label":"...","buffer_post":"...","posts":["p1","p2","p3","p4"]}',
    ""
  ].concat(explainRules(), ["", "PAPERS:", papers.map(paperBlock).join(NL + NL)]).join(NL);
  return runExplain(env, prompt);
}
function validSel(p) { return !!(p && p.arxiv_id && Array.isArray(p.posts) && p.posts.length >= 3); }
async function runExplain(env, prompt) {
  const ai = await env.AI.run(MODEL, { messages: [{ role: "user", content: prompt }], max_tokens: 2500 });
  const raw = extractText(ai);
  const parsed = parseJSON(raw);
  if (!validSel(parsed)) {
    const retry = await env.AI.run(MODEL, { messages: [{ role: "user", content: "Your previous reply was not valid JSON with arxiv_id and a 4-post array. Reply with ONLY the JSON object, nothing else." + NL + prompt }], max_tokens: 2500 });
    const raw2 = extractText(retry);
    const parsed2 = parseJSON(raw2);
    if (validSel(parsed2)) return { parsed: parsed2, raw: raw2 };
  }
  return { parsed, raw };
}
// One corrective revision: the writer sees the paper text and the exact problems and must delete or replace each one.
async function reviseExplanation(env, paper, sel, problems) {
  const prompt = [
    "You are a science translator. Independent checkers rejected your draft because the items below are not supported by the paper's title and abstract.",
    "Return the SAME JSON object (same keys) with each such name, number, date or claim deleted or replaced by wording the abstract supports. Add nothing new.",
    "Reply with STRICT JSON only.",
    ""
  ].concat(explainRules(), ["", "PROBLEMS:"], problems.map((x) => "- " + x), ["", "PAPER:", paperBlock(paper), "", "DRAFT:", JSON.stringify(sel)]).join(NL);
  const r = await runExplain(env, prompt);
  return r && r.parsed;
}

// ---------- accuracy layer (PAPER-VERIFY-1) ----------
// Ported from q08-signal-engine Q08-VERIFY-1: (1) deterministic grounding, every capitalised name, year and figure in the
// post text must occur in the paper's title/abstract/authors; (2) two reviewers from model families other than the writer's
// read ALL text, hedged or not, and one unsupported claim fails it; (3) a reviewer outage means "unavailable" and nothing is
// posted (fail closed). There is no degraded or fail-open path.
const GROUND_LEAD = new Set(["the","a","an","in","on","at","when","if","but","and","so","as","that","this","these","those","it","its","each","every","most","some","no","for","with","without","before","after","once","while","because","since","what","where","who","why","how","then","there","here","not","only","even","still","yet","or","nor","by","from","to","of","their","his","her","our","your","one","two","three","such","both","many","any","all","i","we","you","he","she","they","my","whether","although","though","until","unless","instead","perhaps","suppose","imagine","consider","now","today","later","earlier","first","second","third","finally","meanwhile","however","which","whose","than","also","just","another","other","either","neither","same","more","less","few","several","can","could","may","might","would","will","do","does","is","are","was","were","be"]);
const GROUND_OK = new Set(["arxiv","bluesky","mastodon","linkedin","json","html"]);
function groundWords(text) {
  const set = new Set();
  String(text || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[a-z0-9][a-z0-9'.-]*/g, function (w) {
    w = w.replace(/[.'-]+$/, ""); set.add(w); set.add(w.replace(/'s$/, "")); if (w.length > 3 && w.charAt(w.length - 1) === "s") set.add(w.slice(0, -1)); else set.add(w + "s"); return "";
  });
  return set;
}
function groundNumbers(text) {
  const set = new Set(); (String(text || "").match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function (n) { set.add(n.replace(/,/g, "").replace(/\.0+$/, "")); }); return set;
}
// Names, years and figures in `text` that `ground` does not contain. Links and hashtags are removed first (the arXiv link is
// checked separately against the paper id). Returns problem strings; [] means every one is grounded.
function groundingProblems(text, ground) {
  const body = String(text || "").replace(/https?:\/\/\S+|\b(?:www\.)?[a-z0-9.-]+\.(?:org|com|net|io)\/\S*/gi, " ").replace(/#\w+/g, " ");
  const words = groundWords(ground), nums = groundNumbers(ground), out = [], seen = {};
  function add(kind, v) { const k = kind + v.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(kind + ": " + v); }
  const nre = /\$?\d[\d,]*(?:\.\d+)?\s*(%|percent|days?|weeks?|months?|quarters?|years?|hours?)?/gi;
  let m;
  while ((m = nre.exec(body))) {
    const raw = m[0], plain = raw.replace(/[$,\s]/g, "").replace(/(%|percent|days?|weeks?|months?|quarters?|years?|hours?)$/i, "");
    const num = plain.replace(/\.$/, "");
    if (!num || nums.has(num) || nums.has(num.replace(/\.0+$/, ""))) continue;
    const unit = (m[1] || "").toLowerCase();
    // a bare single-digit count is a word, not a claim; everything else (any unit, any year, any larger number) must be in the source
    if (!unit && /^\d$/.test(num) && raw.indexOf("$") < 0) continue;
    const isYear = /^(1[0-9]|20)\d\d$/.test(num) && !unit;
    add(isYear ? "year not in the source" : "figure not in the source", raw.trim());
  }
  body.split(/(?<=[.!?:;—])\s+|\n+/).forEach(function (sent) {
    const toks = sent.match(/[A-Za-z0-9][A-Za-z0-9&'.’-]*|[,;]/g) || [];
    let i = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (!/^[A-Z]/.test(t) || /^[A-Z]$/.test(t) && toks[i + 1] && !/^[A-Z]/.test(toks[i + 1])) { i++; continue; }
      let j = i; const phrase = [];
      while (j < toks.length && /^[A-Z][A-Za-z0-9&'.’-]*$/.test(toks[j])) { phrase.push(toks[j]); j++; if (toks[j] && /^(of|the|and|for|de|von|van|del|la)$/i.test(toks[j]) && toks[j + 1] && /^[A-Z]/.test(toks[j + 1])) { phrase.push(toks[j]); j++; } }
      let lead = 0; while (lead < phrase.length - 1 && GROUND_LEAD.has(phrase[lead].toLowerCase().replace(/[^a-z]/g, ""))) lead++;
      const core = phrase.slice(lead);
      if (core.length && !(core.length === 1 && i === 0 && lead === 0) && !(core.length === 1 && GROUND_LEAD.has(core[0].toLowerCase()))) {
        const joined = core.join(" ").replace(/’/g, "'");
        const low = joined.toLowerCase().replace(/[^a-z0-9'\- ]/g, " ").replace(/\s+/g, " ").trim();
        if (low && !GROUND_OK.has(low)) {
          const miss = low.split(" ").filter(function (w) { return w && !GROUND_OK.has(w) && !GROUND_LEAD.has(w) && !words.has(w) && !words.has(w.replace(/'s$/, "")) && !(w.indexOf("-") > 0 && w.split("-").every(function (x) { return !x || words.has(x); })) && !/^\d+$/.test(w); });
          if (miss.length) add("name not in the source", joined);
        }
      }
      i = Math.max(j, i + 1);
    }
  });
  return out.slice(0, 14);
}
// Every arxiv.org/abs/<id> link must be this paper's id.
function linkProblems(text, id) {
  const out = [];
  const re = /arxiv\.org\/abs\/([^\s)\],;"']+)/gi; let m;
  while ((m = re.exec(String(text || "")))) { const got = m[1].replace(/[.]+$/, ""); if (got !== String(id)) out.push("link names a different paper: " + got); }
  return out;
}

// All reader-facing text of an explanation, in one block (hedged framing included).
function explanationText(sel, posts, bufferText) {
  return [sel.headline, sel.what_it_is, sel.stated_application].concat(posts, [bufferText]).map((x) => String(x || "").trim()).filter(Boolean).join(NL);
}
function groundText(paper) { return [paper.title, (paper.authors || []).join(", "), String(paper.abstract || "").slice(0, ABSTRACT_MAX)].join(NL); }

const REVIEWERS = [
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/deepseek-ai/deepseek-v4-flash-0731"
]; // none is from the writer's family (Meta Llama, MODEL)
const FACTCHECK_PROMPT = [
  "You are a strict fact-checker for a publication that must contain no unsupported claim. You are given SOURCE MATERIAL (a paper's title, authors and abstract) and a DRAFT written from it.",
  "List every sentence or clause in the DRAFT that asserts something about the real world and is not stated in, or a direct paraphrase of, the SOURCE MATERIAL. That covers findings, methods, numbers, names, organisations, timelines, predictions, applications, benefits and statements about everyday life.",
  "Hedged wording (could, might, may, potentially) does NOT make an unsupported claim acceptable: a hedged claim the source does not make is still unsupported. Your own knowledge does not count as support, even if you are sure the claim is true. A claim stronger than the source's own wording is unsupported.",
  "Not violations: the arXiv link, rhetorical questions that assert nothing, and a statement that the abstract states no application.",
  "Answer with exactly one JSON object and nothing else: {\"unsupported\": [up to 8 short quotations copied from the DRAFT, each followed by ' -- ' and the reason in a few words], \"verdict\": \"pass\" or \"fail\"}. verdict is \"pass\" only when unsupported is empty."
].join(NL);
function parseFactVerdict(text) {
  const m = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o; try { o = JSON.parse(m[0]); } catch (e) { return null; }
  let v = String(o && o.verdict || "").toLowerCase().trim();
  if (v !== "pass" && v !== "fail") return null;
  let u = Array.isArray(o.unsupported) ? o.unsupported.map((x) => String(x).replace(/\s+/g, " ").trim().slice(0, 260)).filter(Boolean).slice(0, 8) : [];
  if (v === "pass" && u.length) v = "fail";
  if (v === "fail" && !u.length) u = ["the reviewer rejected the draft without naming a claim"];
  return { verdict: v, unsupported: u };
}
async function factCheckOne(env, modelId, ground, draft) {
  try {
    const body = FACTCHECK_PROMPT + NL + NL + "--- SOURCE MATERIAL ---" + NL + ground + NL + NL + "--- DRAFT ---" + NL + draft;
    const resp = await env.AI.run(modelId, { messages: [{ role: "user", content: body }], max_tokens: 2000, temperature: 0.1 });
    const v = parseFactVerdict(extractText(resp));
    if (v) v.model = modelId;
    return v;
  } catch (e) { return null; }
}
// Two valid verdicts from two reviewers. Fewer than two is "unavailable" (fail closed).
async function factCheck(env, ground, draft, seedText) {
  let start = 0; for (const c of String(seedText || "")) start = (start * 31 + c.charCodeAt(0)) >>> 0;
  const order = REVIEWERS.map((_, i) => REVIEWERS[(start + i) % REVIEWERS.length]);
  const got = [];
  for (let k = 0; k < order.length && got.length < 2; k += 2) {
    const batch = order.slice(k, k + (2 - got.length));
    const rs = await Promise.all(batch.map((id) => factCheckOne(env, id, ground, draft)));
    rs.forEach((r) => { if (r) got.push(r); });
  }
  if (got.length < 2) return { ok: false, unavailable: true, unsupported: [], judges: got, reason: "fewer than two fact-check verdicts" };
  const uns = []; got.forEach((g) => g.unsupported.forEach((u) => { if (uns.indexOf(u) < 0) uns.push(u); }));
  return { ok: got.every((g) => g.verdict === "pass"), unavailable: false, unsupported: uns.slice(0, 10), judges: got, reason: "" };
}
// Deterministic grounding first (free), then the two-reviewer check. ok only when both pass.
async function verifyExplanation(env, paper, sel, posts, bufferText) {
  if (!paper || !String(paper.abstract || "").trim()) return { ok: false, stage: "source", problems: ["no abstract to check against"], unavailable: true };
  const draft = explanationText(sel, posts, bufferText);
  const det = groundingProblems(draft, groundText(paper)).concat(linkProblems(draft, paper.id));
  if (det.length) return { ok: false, stage: "grounding", problems: det, unavailable: false };
  const fc = await factCheck(env, groundText(paper), draft, paper.id);
  if (fc.unavailable) return { ok: false, stage: "factcheck", problems: ["fact-check unavailable: " + fc.reason], unavailable: true };
  if (!fc.ok) return { ok: false, stage: "factcheck", problems: fc.unsupported.map((u) => "unsupported claim: " + u), unavailable: false };
  return { ok: true, stage: "pass", problems: [], unavailable: false };
}
function normaliseSel(sel) {
  const posts = sanitizePosts(sel.posts).slice(0, 4);
  const given = String(sel.stated_application || "").trim();
  const label = sel.relevance_label === "STATED_APPLICATION" && given && given !== NO_APPLICATION ? "STATED_APPLICATION" : "NONE_STATED";
  const stated = label === "STATED_APPLICATION" ? given.slice(0, 900) : NO_APPLICATION;
  return { posts, label, stated, bufferText: truncate(String(sel.buffer_post || ""), 280), headline: String(sel.headline || "").slice(0, 200), whatItIs: String(sel.what_it_is || "").slice(0, 900) };
}

// ---------- D1 ----------
async function ensureTables(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS paper_explain_log (id INTEGER PRIMARY KEY AUTOINCREMENT, arxiv_id TEXT UNIQUE, headline TEXT, what_it_is TEXT, everyday_relevance TEXT, relevance_label TEXT, why_not TEXT, posts TEXT, status TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')))").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS paper_explain_state (key TEXT PRIMARY KEY, value TEXT)").run();
}

async function stateGet(env, key, fallback) {
  try {
    const r = await env.DB.prepare("SELECT value FROM paper_explain_state WHERE key = ?1").bind(key).first();
    return (r && r.value !== null && r.value !== undefined) ? r.value : fallback;
  } catch (e) { return fallback; }
}

async function alreadyExplained(env) {
  try {
    const r = await env.DB.prepare("SELECT arxiv_id FROM paper_explain_log WHERE status != 'failed'").all();
    const set = new Set((r.results || []).map((x) => x.arxiv_id));
    return set;
  } catch (e) { return new Set(); }
}

async function countToday(env) {
  try {
    const r = await env.DB.prepare("SELECT COUNT(*) n FROM paper_explain_log WHERE status IN ('posted','queued') AND created_at >= datetime('now','start of day')").first();
    return Number((r && r.n) || 0);
  } catch (e) { return 0; }
}

async function logRow(env, row) {
  await env.DB.prepare("INSERT INTO paper_explain_log (arxiv_id, headline, what_it_is, everyday_relevance, relevance_label, why_not, posts, status, error) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(arxiv_id) DO UPDATE SET headline=excluded.headline, what_it_is=excluded.what_it_is, everyday_relevance=excluded.everyday_relevance, relevance_label=excluded.relevance_label, why_not=excluded.why_not, posts=excluded.posts, status=excluded.status, error=excluded.error WHERE paper_explain_log.status IN ('failed','dry')").bind(row.arxiv_id, row.headline, row.what_it_is, row.everyday_relevance, row.relevance_label, row.why_not, JSON.stringify(row.posts), row.status, row.error || null).run();
}

async function recordEvent(env, text, meta) {
  try {
    await env.DB.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind("pe-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), new Date().toISOString(), "paper-explain", String(text).slice(0, 2000), JSON.stringify(meta || {}).slice(0, 1500), "paper-explain", meta && meta.status || "ok").run();
  } catch (e) {}
}

// ---------- core run ----------
async function run(env, opts) {
  const out = { version: VERSION, fetched: 0, candidates: 0, selected: null, status: "ok", posted: false, dry: !!opts.dry, arxiv_id: null, posts: [], explanation: null, issues: [], error: null };
  try {
    await ensureTables(env);
    const enabled = await stateGet(env, "enabled", "1");
    if (enabled !== "1" && !opts.dry) {
      out.status = "disabled"; out.error = "kill switch enabled=0"; return out;
    }

    const today = await countToday(env);
    if (today >= DAILY_CAP && !opts.dry && !opts.force) {
      out.status = "capped"; out.error = "daily cap " + DAILY_CAP + " reached (" + today + " today)"; return out;
    }

    const papers = await fetchArxiv();
    out.fetched = papers.length;
    if (!papers.length) { out.status = "empty"; return out; }

    const seen = await alreadyExplained(env);
    const fresh = papers.filter((p) => !seen.has(p.id));
    out.candidates = fresh.length;
    if (!fresh.length) { out.status = "no-fresh"; out.error = "all fetched papers already explained"; return out; }

    const selRes = await selectAndExplain(env, fresh.slice(0, 10));
    out.raw = (selRes && selRes.raw ? String(selRes.raw).slice(0, 6000) : "");
    const sel = selRes && selRes.parsed;
    if (!sel || !sel.arxiv_id || !Array.isArray(sel.posts) || sel.posts.length < 3) {
      out.status = "no-selection"; out.error = "AI selection/explanation failed"; return out;
    }

    // PAPER-VERIFY-1: the paper must be one the writer was shown (its abstract is the only source of truth).
    const shortlist = fresh.slice(0, 10);
    const paper = shortlist.find((p) => p.id === sel.arxiv_id);
    if (!paper) { out.status = "no-selection"; out.error = "selected id is not among the supplied papers"; return out; }
    let n = normaliseSel(sel);
    const asDraft = (x) => ({ headline: x.headline, what_it_is: x.whatItIs, stated_application: x.stated });
    let ev = await verifyExplanation(env, paper, asDraft(n), n.posts, n.bufferText);
    if (!ev.ok && !ev.unavailable) {
      // one corrective revision, then the whole check runs again from the start
      let sel2 = null;
      try { sel2 = await reviseExplanation(env, paper, sel, ev.problems); } catch (e) { sel2 = null; }
      if (validSel(sel2) && sel2.arxiv_id === paper.id) {
        const n2 = normaliseSel(sel2);
        const ev2 = await verifyExplanation(env, paper, asDraft(n2), n2.posts, n2.bufferText);
        if (ev2.ok || ev2.unavailable) { n = n2; ev = ev2; } else { ev = { ok: false, stage: ev2.stage, problems: ev.problems.concat(ev2.problems), unavailable: false }; }
      }
    }
    const posts = n.posts, bufferText = n.bufferText, headline = n.headline, whatItIs = n.whatItIs, everyday = n.stated, label = n.label;
    const whyNot = label === "NONE_STATED" ? NO_APPLICATION : "";
    out.issues = ev.problems || [];
    out.arxiv_id = paper.id;
    out.selected = { arxiv_id: paper.id, headline, relevance_label: label };
    out.posts = posts;
    out.buffer_text = bufferText;
    out.explanation = { what_it_is: whatItIs, stated_application: everyday, relevance_label: label };

    if (ev.unavailable) {
      // FAIL CLOSED: a reviewer outage (or a missing abstract) means nothing is posted. No log row is written, so the paper stays
      // eligible and the next run tries again.
      out.status = "unverified"; out.error = "fact-check unavailable; nothing posted (fail closed)";
      await recordEvent(env, "paper-explain unverified, nothing posted (fail closed): " + paper.id, { status: "unverified", arxiv_id: paper.id });
      try {
        const dup = await env.DB.prepare("SELECT COUNT(*) n FROM agent_issues WHERE status='open' AND title LIKE 'PAPER-EXPLAIN-CHECKER-UNAVAILABLE%'").first();
        if (!dup || Number(dup.n) === 0) {
          const mx = await env.DB.prepare("SELECT COALESCE(MAX(id),0) m FROM agent_issues").first();
          await env.DB.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now'),datetime('now'))").bind(Number(mx.m) + 1, "PAPER-EXPLAIN-CHECKER-UNAVAILABLE: fewer than two fact-check verdicts, post withheld", "fail closed; nothing was posted for " + paper.id + "; the next run retries it", "qnfo-paper-explainer", "fleet-self-improve", "medium", "open").run();
        }
      } catch (e2) {}
      return out;
    }

    if (!ev.ok) {
      await logRow(env, { arxiv_id: paper.id, headline, what_it_is: whatItIs, everyday_relevance: everyday, relevance_label: label, why_not: whyNot, posts, status: "draft", error: JSON.stringify(ev.problems).slice(0, 400) });
      await recordEvent(env, "paper-explain draft withheld: " + paper.id + " (" + ev.stage + ", " + ev.problems.length + " problem(s))", { status: "draft", arxiv_id: paper.id });
      out.status = "draft"; return out;
    }

    await logRow(env, { arxiv_id: paper.id, headline, what_it_is: whatItIs, everyday_relevance: everyday, relevance_label: label, why_not: whyNot, posts, status: opts.dry ? "dry" : "queued", error: null });

    if (!opts.dry) {
      try {
        const s = await bskySession(env);
        const uris = await bskyPostThread(s, posts);
        out.posted = true; out.uris = uris;
        await env.DB.prepare("UPDATE paper_explain_log SET status='posted' WHERE arxiv_id=?1 AND status='queued'").bind(paper.id).run();
        await recordEvent(env, "paper-explain posted: " + paper.id + " -> " + uris[0], { status: "posted", arxiv_id: paper.id, relevance_label: label });
      } catch (e) {
        await env.DB.prepare("UPDATE paper_explain_log SET status='failed', error=?1 WHERE arxiv_id=?2 AND status='queued'").bind(String(e && e.message || e).slice(0, 300), paper.id).run();
        throw e;
      }
      if (bufferText) {
        try {
          const br = await bufferPost(env, bufferText);
          out.buffer = br;
          await recordEvent(env, "paper-explain buffer cross-post: " + paper.id + " " + JSON.stringify(br).slice(0, 300), { status: "buffer", arxiv_id: paper.id });
        } catch (e) {
          out.buffer = { error: String(e && e.message || e) };
        }
      }
    } else {
      await recordEvent(env, "paper-explain dry run: " + paper.id + " (" + label + ")", { status: "dry", arxiv_id: paper.id });
    }
    out.status = opts.dry ? "dry" : "posted";
    return out;
  } catch (e) {
    out.status = "error"; out.error = String(e && e.message || e);
    try { await recordEvent(env, "paper-explain error: " + out.error, { status: "error" }); } catch (e2) {}
    return out;
  }
}

export const __verify = { groundingProblems, linkProblems, parseFactVerdict, factCheck, verifyExplanation, normaliseSel, explainRules, selectAndExplain, reviseExplanation, FACTCHECK_PROMPT, REVIEWERS, NO_APPLICATION, run };

export default {
  async scheduled(event, env, ctx) {
    const out = await run(env, { dry: false });
    console.log("paper-explain", JSON.stringify(out));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname, m = request.method;
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (p === "/health" && m === "GET") {
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-paper-explainer", version: VERSION, bindings: { db: !!env.DB, ai: !!env.AI, bsky_handle: !!env.BSKY_HANDLE, bsky_pass: !!env.BSKY_APP_PASS } }), { headers: { "Content-Type": "application/json", ...CORS } });
    }
    if (!auth(request, env)) return new Response("unauthorized", { status: 401, headers: CORS });
    try {
      if (p === "/run" && m === "GET") {
        const dry = url.searchParams.get("post") !== "1";
        const force = url.searchParams.get("force") === "1";
        const out = await run(env, { dry, force });
        return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      if (p === "/log" && m === "GET") {
        const rows = await env.DB.prepare("SELECT id, arxiv_id, headline, relevance_label, status, created_at FROM paper_explain_log ORDER BY id DESC LIMIT 30").all();
        return new Response(JSON.stringify(rows.results || []), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      if (p === "/state" && m === "GET") {
        const enabled = await stateGet(env, "enabled", "1");
        const today = await countToday(env);
        return new Response(JSON.stringify({ enabled, daily_cap: DAILY_CAP, today }), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      if (p === "/enable" && m === "POST") {
        const b = await request.json().catch(() => ({}));
        const v = String(b.enabled === 0 || b.enabled === "0" ? "0" : "1");
        await env.DB.prepare("INSERT INTO paper_explain_state (key, value) VALUES ('enabled', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(v).run();
        return new Response(JSON.stringify({ ok: true, enabled: v }), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      if (p === "/probe" && m === "GET") {
        const ai = await env.AI.run(MODEL, { messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 30 });
        return new Response(JSON.stringify({ model: MODEL, keys: ai ? Object.keys(ai) : null, response_field: ai && ai.response, result_field: ai && ai.result ? (typeof ai.result === "string" ? ai.result : Object.keys(ai.result)) : null, extracted: extractText(ai) }), { headers: { "Content-Type": "application/json", ...CORS } });
      }
      return new Response("not found", { status: 404, headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { "Content-Type": "application/json", ...CORS } });
    }
  }
};
