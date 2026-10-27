// qnfo-jobsearch: verified-claims job matcher (JOBSEARCH-1). Charter pillar: reach.
// Hourly cron fetches public ATS feeds (Greenhouse, Lever, Ashby) plus Remotive and Arbeitnow, gates and scores each posting
// against the owner's claim ledger, assembles a tailored resume and note ONLY from ledger sentences, re-verifies every output
// line, and stores the result in D1 (jobsearch_matches). Nothing is ever sent: status moves pending_owner_approval -> approved/rejected/applied
// by the owner (POST needs x-loop-token). No LinkedIn/Indeed scraping (LinkedIn User Agreement s8.2).
// JOBSEARCH-OPS-1 (1.1.0): e-mailed-code owner sign-in via qnfo-email (no secret to manage), feed health and retry, self-healing runs, posting lifecycle (expired), dedupe, retention, GET /api/ops self-report.
// Routes: GET / (web UI) | GET /api | GET /api/matches | GET /api/matches/:id | GET /api/runs | GET /api/ledger | POST /api/run | POST /api/matches/:id/status | GET /health
// Port of the jobsearch/ Python modules (tests: jobsearch/test_jobsearch.py, qnfo-jobsearch/worker.test.mjs).
var VERSION = "1.1.4";
const WORKER = "qnfo-jobsearch";
const LEDGER = {
 "ledger_verified_on": "2026-10-01",
 "_note": "Claim ledger. Source: Documents/Rowan Brad Quni-Gudzinas - CV (verified, corrected).md (2026-10-01). Every sentence the tool emits must equal a 'text' or 'pitch' here. Edit this file, never the generated output.",
 "person": {
  "name": "Rowan Brad Quni-Gudzinas",
  "also_published_as": "Brad Gudzinas",
  "location": "Amsterdam, Netherlands",
  "email": "rowan.quni@qnfo.org",
  "sign_in_email": "rwnquni@outlook.com",
  "links": {
   "site": "https://qnfo.org",
   "papers": "https://papers.qnfo.org",
   "linkedin": "https://www.linkedin.com/in/rowan-quni/",
   "orcid": "https://orcid.org/0009-0002-4317-5604"
  },
  "career_start": 2004
 },
 "unverified_needs_owner": [
  "US citizenship vs. work-authorization basis (stated only: authorized in US)",
  "basis of NL authorization (permit type; whether it extends to other EU states)"
 ],
 "facts": [
  {
   "id": "F01",
   "cluster": [
    "research_mgmt",
    "federal"
   ],
   "employer": "U.S. DOT, Federal Highway Administration",
   "period": "2011-2015",
   "text": "Managed a $1.5M+ federal research portfolio as a certified Contracting Officer's Representative: technical oversight, budgets, milestones, and acceptance of contractor deliverables.",
   "pitch": "At the Federal Highway Administration I managed a $1.5M+ federal research portfolio as a certified Contracting Officer's Representative."
  },
  {
   "id": "F02",
   "cluster": [
    "transport_modeling",
    "federal",
    "data_product"
   ],
   "employer": "U.S. DOT, Federal Highway Administration",
   "period": "2011-2015",
   "text": "Led technical components of the national Tour-Based Model System for long-distance passenger travel forecasting.",
   "pitch": "I led technical components of the national Tour-Based Model System for long-distance passenger travel forecasting."
  },
  {
   "id": "F03",
   "cluster": [
    "policy_research",
    "data_product"
   ],
   "employer": "AARP Public Policy Institute",
   "period": "2016-2021",
   "text": "Led the AARP Livability Index: 50+ data sources across 7 domains, scoring U.S. neighborhoods nationwide, across multiple public releases.",
   "pitch": "At AARP I led the Livability Index: 50+ data sources across 7 domains, scoring U.S. neighborhoods nationwide."
  },
  {
   "id": "F04",
   "cluster": [
    "policy_research"
   ],
   "employer": "AARP Public Policy Institute",
   "period": "2016-2021",
   "text": "The Index and its method are cited in 20+ academic and policy studies.",
   "pitch": "The Livability Index and its method are cited in 20+ academic and policy studies."
  },
  {
   "id": "F05",
   "cluster": [
    "policy_research"
   ],
   "employer": "AARP Public Policy Institute",
   "period": "2016-2021",
   "text": "Co-authored the Livability Index 2018 report and AARP policy work on housing affordability, including the 2016 analysis of Low-Income Housing Tax Credits.",
   "pitch": "I co-authored the Livability Index 2018 report and AARP policy work on housing affordability."
  },
  {
   "id": "F06",
   "cluster": [
    "ai_systems",
    "research_integrity",
    "research_mgmt"
   ],
   "employer": "QNFO",
   "period": "2024-present",
   "text": "Built and run an autonomous research system on Cloudflare (44+ live workers) that drafts, referees, revises, versions, publishes, and corrects papers.",
   "pitch": "I built and run an autonomous research system on Cloudflare (44+ live workers) that drafts, referees, revises, versions, publishes, and corrects papers."
  },
  {
   "id": "F07",
   "cluster": [
    "research_integrity",
    "ai_systems"
   ],
   "employer": "QNFO",
   "period": "2024-present",
   "text": "Designed the audit method: The Universal Ignorance Audit and Epistemic Legibility in AI-Assisted Science.",
   "pitch": "I designed a published audit method for AI-assisted research: The Universal Ignorance Audit and Epistemic Legibility in AI-Assisted Science."
  },
  {
   "id": "F08",
   "cluster": [
    "ai_systems",
    "quantum_energy"
   ],
   "employer": "QNFO",
   "period": "2024-present",
   "text": "Proposed JPCUB, a whole-system energy benchmark for computing (joules per correct answer), with a measurement protocol, estimates for 17 quantum platforms, and an extension to LLM inference.",
   "pitch": "I proposed JPCUB, a whole-system energy benchmark for computing (joules per correct answer), with estimates for 17 quantum platforms and an extension to LLM inference."
  },
  {
   "id": "F09",
   "cluster": [
    "research_integrity"
   ],
   "employer": "QNFO",
   "period": "2024-present",
   "text": "Publish an open library of preprints with DOIs and a queryable knowledge graph.",
   "pitch": "I publish an open library of preprints with DOIs and a queryable knowledge graph."
  },
  {
   "id": "F10",
   "cluster": [
    "ai_systems",
    "nonprofit"
   ],
   "employer": "Empowering Change",
   "period": "2023-2024",
   "text": "Built an LLM legal-navigation tool for self-represented litigants: document drafting, procedural guidance, and plain-language translation of legal terms.",
   "pitch": "I built an LLM legal-navigation tool for self-represented litigants: document drafting, procedural guidance, and plain-language translation of legal terms."
  },
  {
   "id": "F11",
   "cluster": [
    "nonprofit",
    "leadership"
   ],
   "employer": "Empowering Change",
   "period": "2023-2024",
   "text": "Took the nonprofit from incorporation to public launch.",
   "pitch": "As Executive Director and Founder of Empowering Change I took the nonprofit from incorporation to public launch."
  },
  {
   "id": "F12",
   "cluster": [
    "data_science",
    "federal"
   ],
   "employer": "Deloitte Consulting LLP",
   "period": "2015-2016",
   "text": "Delivered analytics and machine-learning engagements for federal and public-sector clients.",
   "pitch": "At Deloitte I delivered analytics and machine-learning engagements for federal and public-sector clients."
  },
  {
   "id": "F13",
   "cluster": [
    "transport_modeling",
    "policy_research"
   ],
   "employer": "Deloitte Consulting LLP",
   "period": "2015-2016",
   "text": "Co-authored a 2016 Transportation Research Board paper on updating the National Household Travel Survey with American Community Survey data.",
   "pitch": "I co-authored a 2016 Transportation Research Board paper on updating the National Household Travel Survey with American Community Survey data."
  },
  {
   "id": "F14",
   "cluster": [
    "transport_modeling",
    "policy_research"
   ],
   "employer": "U.S. DOT, Federal Highway Administration",
   "period": "2011-2015",
   "text": "Presented national long-distance travel data needs at the 2011 TRB National Household Travel Survey workshop.",
   "pitch": "I presented national long-distance travel data needs at the 2011 TRB National Household Travel Survey workshop."
  },
  {
   "id": "F15",
   "cluster": [
    "product"
   ],
   "employer": "iManage; Epsilon (Publicis Groupe); AARP",
   "period": "2016-2023",
   "text": "Product management roles: Platform Data Product Manager at iManage (2022 to 2023), Senior Product Manager at Epsilon (2021 to 2022), Product Manager and Senior Methods Advisor at AARP Public Policy Institute (2016 to 2021).",
   "pitch": "I have held product roles at iManage (Platform Data Product Manager), Epsilon (Senior Product Manager), and AARP (Product Manager and Senior Methods Advisor)."
  },
  {
   "id": "F16",
   "cluster": [
    "credentials"
   ],
   "employer": "",
   "period": "",
   "text": "Certifications: Project Management Professional (PMP, 2016), Contracting Officer's Representative (COR, 2011), American Institute of Certified Planners (AICP, 2009).",
   "pitch": "I hold PMP, COR, and AICP certifications."
  },
  {
   "id": "F17",
   "cluster": [
    "credentials"
   ],
   "employer": "Rutgers University",
   "period": "2004-2008",
   "text": "Education: M.S., City and Regional Studies, Rutgers University (2008); B.A., Urban Studies and Community Planning, Rutgers University-Camden (2004).",
   "pitch": "I hold an M.S. in City and Regional Studies from Rutgers University."
  }
 ],
 "skills": [
  "research program management",
  "federal contract oversight",
  "product management",
  "statistical modeling",
  "travel-demand modeling",
  "gis",
  "llm agent systems",
  "cloudflare workers",
  "d1",
  "r2",
  "vectorize",
  "python",
  "javascript",
  "sql",
  "machine learning",
  "data science"
 ],
 "headlines": [
  {
   "id": "H1",
   "cluster": [
    "research_mgmt"
   ],
   "text": "Research program leader: 15 years running national research programs and data products at the U.S. Federal Highway Administration and AARP."
  },
  {
   "id": "H2",
   "cluster": [
    "ai_systems",
    "research_integrity"
   ],
   "text": "Research systems builder: founder of QNFO, an independent research imprint with an AI-assisted pipeline, a published audit method, and a public correction trail."
  }
 ],
 "closing": "Full CV, papers, and contact: qnfo.org",
 "owner_stated": {
  "stated": "2026-10-27",
  "work_authorization": [
   "NL",
   "US"
  ],
  "salary_floor": "varies by role type and location; no filter applied",
  "employment_types": [
   "full-time",
   "contract"
  ],
  "languages": [
   "English"
  ],
  "relocation": "anywhere, no boundary (stated 2026-10-27)"
 }
};

// ------------------------------------------------------------------ operations layer (JOBSEARCH-OPS-1)
const OWNER_EMAIL = LEDGER.person.sign_in_email || LEDGER.person.email;
const LEDGER_VERIFIED_ON = LEDGER.ledger_verified_on || "2026-10-01";
const SESSION_MS = 12 * 3600 * 1000, CODE_MS = 15 * 60 * 1000, CODE_MAX_PER_HOUR = 6, CODE_MIN_GAP_MS = 60 * 1000, CODE_MAX_TRIES = 5;
const DDL = [
  "CREATE TABLE IF NOT EXISTS jobsearch_feeds (feed TEXT PRIMARY KEY, last_ok_at TEXT, last_count INTEGER, last_error TEXT, last_error_at TEXT, consecutive_fail INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS jobsearch_meta (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS jobsearch_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code_hash TEXT NOT NULL, salt TEXT NOT NULL, created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS jobsearch_sessions (token_hash TEXT PRIMARY KEY, created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)",
];
let ensured = false;
async function ensure(env) {
  if (ensured) return;
  for (const q of DDL) await env.JOBS_DB.prepare(q).run();
  ensured = true;
}
const iso = (ms) => new Date(ms).toISOString();
const log = (event, o) => console.log(JSON.stringify({ worker: WORKER, event, ...o }));
const logErr = (event, e) => console.error(JSON.stringify({ worker: WORKER, event, error: String((e && e.message) || e) }));
async function sha256hex(x) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(x)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constEq(a, b) {
  a = String(a); b = String(b);
  let r = a.length === b.length ? 0 : 1;
  const n = Math.max(a.length, b.length, 1);
  for (let i = 0; i < n; i++) r |= (a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i % (b.length || 1))) | 0;
  return r === 0;
}
const randHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const maskedOwner = () => OWNER_EMAIL.replace(/^(.).*(@.*)$/, "$1***$2");
async function setMeta(env, k, v) {
  await env.JOBS_DB.prepare("INSERT INTO jobsearch_meta (k, v, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?2, updated_at=?3").bind(k, String(v), new Date().toISOString()).run();
}
// feed key -> id prefix of the postings it produced (a feed that failed this run never expires anything)
function feedPrefix(feed) {
  const [kind, arg] = feed.split(":");
  return { greenhouse: `gh:${arg}:`, lever: `lv:${arg}:`, ashby: `ab:${arg}:`, remotive: "rm:", arbeitnow: "an:" }[kind];
}
const dedupeKey = (j) => `${j.company}|${j.title}|${j.location}`.toLowerCase().replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------ feeds
const BOARDS = {
  greenhouse: ["anthropic", "scaleai", "mongodb", "elastic", "gitlab", "databricks", "stripe"],
  lever: ["palantir", "mistral"],
  ashby: ["openai", "cohere", "notion", "elevenlabs"],
  remotive: ["data", "product", "all-others"],
  arbeitnow: true,
};
const DISPLAY = { openai: "OpenAI", scaleai: "Scale AI", gitlab: "GitLab", mongodb: "MongoDB", anthropic: "Anthropic", databricks: "Databricks", elastic: "Elastic", stripe: "Stripe", palantir: "Palantir", mistral: "Mistral", cohere: "Cohere", notion: "Notion", elevenlabs: "ElevenLabs" };

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function stripHtml(s) {
  s = decodeEntities(s);
  s = s.replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
async function getJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(url, { headers: { "user-agent": "qnfo-jobsearch/1.0 (+https://qnfo.org)" }, signal: ac.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const FETCHERS = {
  async greenhouse(slug) {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    return (d.jobs || []).map((j) => ({ id: `gh:${slug}:${j.id}`, source: "greenhouse", company: slug, title: j.title || "", location: (j.location || {}).name || "", url: j.absolute_url || "", desc: stripHtml(j.content || "") }));
  },
  async lever(slug) {
    const d = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return d.map((j) => ({ id: `lv:${slug}:${j.id}`, source: "lever", company: slug, title: j.text || "", location: (j.categories || {}).location || "", url: j.hostedUrl || "", desc: (j.descriptionPlain || "") + "\n" + (j.additionalPlain || "") }));
  },
  async ashby(slug) {
    const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    return (d.jobs || []).filter((j) => j.isListed !== false).map((j) => ({ id: `ab:${slug}:${j.id}`, source: "ashby", company: slug, title: j.title || "", location: (j.location || "") + (j.isRemote ? " (Remote)" : ""), url: j.jobUrl || "", desc: j.descriptionPlain || stripHtml(j.descriptionHtml || "") }));
  },
  async remotive(cat) {
    const d = await getJson(`https://remotive.com/api/remote-jobs?category=${cat}`);
    return (d.jobs || []).map((j) => ({ id: `rm:${j.id}`, source: "remotive", company: j.company_name || "", title: j.title || "", location: "Remote - " + (j.candidate_required_location || ""), url: j.url || "", desc: stripHtml(j.description || "") }));
  },
  async arbeitnow() {
    const out = [];
    for (let p = 1; p <= 3; p++) {
      const d = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${p}`);
      for (const j of d.data || []) out.push({ id: `an:${j.slug}`, source: "arbeitnow", company: j.company_name || "", title: j.title || "", location: (j.location || "") + (j.remote ? " (Remote)" : ""), url: j.url || "", desc: stripHtml(j.description || "") });
    }
    return out;
  },
};

// ------------------------------------------------------------------ matching (port of match.py)
const CLUSTER_KW = {
  research_mgmt: ["research program", "research portfolio", "research operations", "research management", "program management", "research strategy", "head of research", "research lead"],
  federal: ["federal government", "federal agenc", "government agenc", "public sector", "public administration", "government"],
  transport_modeling: ["transportation", "travel demand", "mobility", "urban planning", "transit", "forecasting"],
  policy_research: ["public policy", "policy research", "survey", "social science", "evidence-based"],
  ai_systems: ["llm", "large language model", "ai agent", "agentic", "generative ai", "applied ai", "machine learning", "ai evaluation", "evals", "rag "],
  research_integrity: ["research integrity", "reproducib", "peer review", "scientific integrity", "open science", "provenance", "responsible ai", "ai governance", "ai safety", "audit", "trustworthy"],
  data_product: ["data product", "data platform", "analytics"],
  quantum_energy: ["quantum", "energy efficiency", "benchmark"],
  nonprofit: ["nonprofit", "non-profit", "civil society"],
  product: ["product manager", "product management", "roadmap"],
  data_science: ["data science", "data scientist"],
};
const TITLE_STRONG = ["research manager", "research program", "head of research", "director of research", "research director", "research operations", "research integrity", "ai governance", "ai policy", "research lead", "data product", "ai evaluation", "research strategy", "program manager, research", "research partnerships", "science policy", "responsible ai", "trust and safety research"];
const TITLE_MEDIUM = ["product manager", "program manager", "principal", "director", "head of", "lead", "research", "policy", "strategist"];
const TITLE_EXCLUDE = ["intern", "junior", "entry", "graduate", "new grad", "apprentice", "sales", "scientist", "account executive", "recruiter", "counsel", "attorney", "engineer", "architect", "solutions", "customer success", "devops", "site reliability", "security engineer", "designer", "marketing", "finance", "accountant", "payroll"];
const ABSOLUTE_EXCLUDE = ["intern", "junior", "entry", "graduate", "new grad", "apprentice", "trainee", "engineer", "architect"];
const LOC_BAD_REMOTE = ["us only", "united states only", "us-only", "usa only", "canada only", "uk only", "india only", "latam", "apac only"];
const HOME = ["amsterdam", "netherlands", "nederland", "rotterdam", "utrecht", "eindhoven", "the hague", "europe", "emea", "european", "eu ", "eu-", "worldwide", "anywhere", "global"];
const EUROPE_OTHER = ["germany", "berlin", "munich", "france", "paris", "london", "uk", "united kingdom", "ireland", "dublin", "spain", "madrid", "barcelona", "portugal", "lisbon", "italy", "belgium", "brussels", "denmark", "copenhagen", "sweden", "stockholm", "norway", "oslo", "finland", "helsinki", "austria", "vienna", "switzerland", "zurich", "poland", "warsaw", "czech", "prague"];
const US_RE = /\b(us|usa|united states|san francisco|new york|seattle|washington|boston|austin|chicago|los angeles|palo alto|mountain view|menlo park|sf|nyc|dc)\b|, (ca|ny|wa|ma|tx|il|dc)\b/;
const CORE = new Set(["federal", "policy_research", "transport_modeling", "research_mgmt"]);
const FRONTIER = new Set(["ai_systems", "research_integrity"]);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text, kws) => kws.filter((k) => text.includes(k));

function clustersIn(desc, title) {
  const t = desc.toLowerCase(), ti = (title || "").toLowerCase();
  const out = new Set();
  for (const [c, kws] of Object.entries(CLUSTER_KW)) if (has(t, kws).length >= 2 || has(ti, kws).length) out.add(c);
  return out;
}
function locationGate(loc, descHead) {
  const l = (loc || "").toLowerCase() + " ";
  if (!l.trim()) return ["check", "location missing"];
  if (LOC_BAD_REMOTE.some((b) => l.includes(b))) return ["fail", `location restricted: ${loc}`];
  if (l.includes("united states") && l.includes("remote") && !HOME.some((k) => l.includes(k))) return ["ok", `US-based remote; owner authorized in US (${loc})`];
  if (HOME.some((k) => l.includes(k))) return ["ok", loc];
  if (EUROPE_OTHER.some((k) => new RegExp("\\b" + escRe(k) + "\\b").test(l))) return ["check", `Europe but not NL; relocation or employer-of-record unverified (${loc})`];
  if (l.replace(/[^a-z]/g, "") === "remote" || l.replace(/[^a-z]/g, "") === "remoteremote") {
    if (/(must|should) (be )?(located|based|reside) in the (u\.?s|united states|uk|canada)/.test(descHead.toLowerCase())) return ["fail", "remote but posting requires US/UK/CA residence"];
    return ["check", "remote, region unspecified"];
  }
  if (US_RE.test(l)) return ["check", `US on-site/hybrid: relocation from Amsterdam, owner says negotiable (${loc})`];
  return ["check", `Elsewhere: owner will relocate but is authorized only in NL/US; visa needed (${loc})`];
}
function evaluate(job) {
  const title = job.title.toLowerCase(), desc = job.desc || "";
  const why = [], flags = [];
  let locPen = 0;
  if (ABSOLUTE_EXCLUDE.some((x) => title.includes(x))) return { status: "excluded", reason: "seniority or role family below target" };
  const strong = has(title, TITLE_STRONG), medium = has(title, TITLE_MEDIUM);
  if (TITLE_EXCLUDE.some((x) => title.includes(x)) && !strong.length) return { status: "excluded", reason: "role family excluded by title" };
  if (!strong.length && !medium.length) return { status: "excluded", reason: "title not in target families" };
  const [gate, locNote] = locationGate(job.location, desc.slice(0, 3000));
  if (gate === "fail") return { status: "excluded", reason: locNote };
  if (gate === "check") { flags.push("LOCATION: " + locNote); locPen = /^(Elsewhere|Europe)/.test(locNote) ? 15 : 10; }
  const cl = clustersIn(desc, job.title);
  const tScore = strong.length ? 40 : (medium.length >= 2 || medium.includes("research")) ? 20 : 12;
  const eScore = Math.min(45, 9 * cl.size);
  const uniq = [...cl].some((c) => CORE.has(c)) && [...cl].some((c) => FRONTIER.has(c));
  if (strong.length) why.push("title match: " + strong[0]); else why.push("title family: " + medium.slice(0, 2).join(", "));
  why.push(cl.size ? "evidence clusters: " + [...cl].sort().join(", ") : "no evidence clusters");
  if (uniq) why.push("uncommon intersection: research-program or policy-research management + AI or research-integrity systems");
  let score = tScore + eScore + (uniq ? 15 : 0) - locPen;
  const low = desc.toLowerCase();
  if (/ph\.?d\.?[^.\n]{0,40}(required|must)|(required|must)[^.\n]{0,40}ph\.?d/.test(low)) { flags.push("DEGREE: PhD appears required; owner holds M.S."); score -= 20; }
  if (/security clearance|u\.?s\.? citizen/.test(low)) flags.push("AUTH: clearance/citizenship language present");
  if (/right to work|work authori[sz]ation|visa sponsorship|eligible to work/.test(low) && gate === "check" && !/^US/.test(locNote)) flags.push("AUTH: work-authorization language; owner is authorized in NL and US only");
  const lang = [...low.matchAll(/(?:fluen\w*|proficien\w*|native)[^.\n]{0,30}\b(german|dutch|french|spanish|italian|japanese|korean|mandarin|portuguese|hindi)/g)].map((m) => m[1]);
  if (lang.length) flags.push("LANGUAGE: posting asks for " + [...new Set(lang)].sort().join(", ") + "; owner lists English only");
  const yrs = [...low.matchAll(/(\d{1,2})\+?\s*(?:or more )?years/g)].map((m) => +m[1]);
  if (yrs.length && Math.max(...yrs) > 22) flags.push(`YEARS: asks ${Math.max(...yrs)}+ years`);
  const tier = score >= 70 && cl.size ? "A" : score >= 45 ? "B" : "C";
  return { status: "ok", score, tier, clusters: [...cl].sort(), unique: uniq, why, flags };
}

// ------------------------------------------------------------------ tailoring + verification (port of tailor.py)
const FACTS = Object.fromEntries(LEDGER.facts.map((f) => [f.id, f]));
const HEADS = Object.fromEntries(LEDGER.headlines.map((h) => [h.id, h]));
const P = LEDGER.person;
const STATIC = new Set(["Hello,", "Best regards,", "## Experience highlights", "## Credentials", LEDGER.closing, P.name]);
const FORBIDDEN = ["kubernetes", "tensorflow", "pytorch", "java", "rust", "golang", "aws", "azure", "gcp", "spark", "docker", "react", "tableau", "power bi", "snowflake", "databricks", "scrum master", "six sigma", "cissp", "phd", "ph.d", "mba", "cfa", "security clearance", "fluent"];
const tag = (line, t) => `${line} <!--${t}-->`;

function pickFacts(clusters, k) {
  const cl = new Set(clusters), scored = [];
  LEDGER.facts.forEach((f, i) => {
    if (f.id === "F16" || f.id === "F17") return;
    const s = f.cluster.filter((c) => cl.has(c)).length;
    if (s) scored.push([-s, i, f]);
  });
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.slice(0, k).map((x) => x[2]);
}
function headline(clusters) {
  const cl = new Set(clusters);
  const a = ["research_mgmt"].filter((c) => cl.has(c)).length + ["federal", "policy_research", "transport_modeling"].filter((c) => cl.has(c)).length;
  const b = HEADS.H2.cluster.filter((c) => cl.has(c)).length;
  return a > b ? HEADS.H1 : HEADS.H2;
}
function jobTerms(job, clusters, n = 2) {
  const d = (job.desc + " " + job.title).toLowerCase(), out = [];
  for (const c of clusters) {
    for (const kw of CLUSTER_KW[c] || []) {
      const k = kw.trim();
      if (d.includes(k) && !out.includes(k) && k.length > 4) { out.push(k); break; }
    }
    if (out.length >= n) break;
  }
  return out;
}
function buildResume(job, m) {
  const facts = pickFacts(m.clusters, 5), h = headline(m.clusters);
  const L = [tag("# " + P.name, "P"), tag(`${P.location} | ${P.email} | ${P.links.site} | ${P.links.linkedin}`, "P"), tag(`Earlier work is published under ${P.also_published_as}.`, "P"), "", tag(h.text, "H:" + h.id), "", tag("## Experience highlights", "S")];
  for (const f of facts) L.push(tag("- " + f.text, "F:" + f.id));
  L.push("", tag("## Credentials", "S"), tag("- " + FACTS.F16.text, "F:F16"), tag("- " + FACTS.F17.text, "F:F17"));
  return L.join("\n") + "\n";
}
function buildNote(job, m) {
  const facts = pickFacts(m.clusters, 3), terms = jobTerms(job, m.clusters);
  const L = [tag("Hello,", "S"), "", tag(`I am applying for the ${job.title} role at ${job.company}.`, "J:title")];
  if (terms.length) L.push(tag("The posting mentions " + terms.map((t) => `"${t}"`).join(" and ") + ", which is the work I have done:", "J:terms:" + terms.join("|")));
  L.push("");
  for (const f of facts) L.push(tag(f.pitch, "F:" + f.id));
  L.push("", tag(LEDGER.closing, "S"), "", tag("Best regards,", "S"), tag(P.name, "S"));
  return L.join("\n") + "\n";
}
const nums = (s) => new Set(String(s).match(/\d[\d,.]*\+?/g) || []);
const LEDGER_LOW = JSON.stringify(LEDGER).toLowerCase();
function verify(doc, job) {
  const bad = [];
  const allowed = new Set();
  const addAll = (set) => set.forEach((x) => allowed.add(x));
  for (const f of LEDGER.facts) { addAll(nums(f.text)); addAll(nums(f.pitch)); }
  for (const h of LEDGER.headlines) addAll(nums(h.text));
  addAll(nums(JSON.stringify(P))); addAll(nums(job.title)); addAll(nums(job.company));
  const allowedTrim = new Set([...allowed].map((x) => x.replace(/[.,]+$/, "")));
  const jd = (job.desc + " " + job.title).toLowerCase();
  doc.split("\n").forEach((raw, i) => {
    const n = i + 1;
    if (!raw.trim()) return;
    const m = raw.match(/^(.*?) <!--(.+)-->$/);
    if (!m) { bad.push(`L${n}: untagged line: ${raw.slice(0, 60)}`); return; }
    const text = m[1], t = m[2], kind = t.split(":")[0];
    if (kind === "F") {
      const f = FACTS[t.split(":")[1]], body = text.startsWith("- ") ? text.slice(2) : text;
      if (!f || (body !== f.text && body !== f.pitch)) bad.push(`L${n}: text does not equal ledger fact ${t}`);
    } else if (kind === "H") {
      const h = HEADS[t.split(":")[1]];
      if (!h || text !== h.text) bad.push(`L${n}: headline differs from ledger ${t}`);
    } else if (kind === "S") {
      if (!STATIC.has(text)) bad.push(`L${n}: static line not allowlisted: ${text.slice(0, 60)}`);
    } else if (kind === "P") {
      if (!(text.startsWith("# " + P.name) || text.includes(P.email) || text.startsWith("Earlier work is published under"))) bad.push(`L${n}: person line not from ledger`);
    } else if (kind === "J") {
      if (t === "J:title") { if (text !== `I am applying for the ${job.title} role at ${job.company}.`) bad.push(`L${n}: job line altered`); }
      else for (const q of text.matchAll(/"([^"]+)"/g)) if (!jd.includes(q[1].toLowerCase())) bad.push(`L${n}: quoted term not in posting: ${q[1]}`);
    } else bad.push(`L${n}: unknown tag ${t}`);
  });
  const low = doc.toLowerCase(), ct = (job.company + " " + job.title).toLowerCase();
  for (const term of FORBIDDEN) {
    if (new RegExp("\\b" + escRe(term) + "\\b").test(low) && !ct.includes(term) && !LEDGER_LOW.includes(term)) bad.push(`forbidden unclaimed term in output: ${term}`);
  }
  for (const num of nums(doc.replace(/<!--.*?-->/g, ""))) if (!allowed.has(num) && !allowedTrim.has(num.replace(/[.,]+$/, ""))) bad.push(`number not in ledger: ${num}`);
  return bad;
}
const stripTags = (s) => s.replace(/ <!--.*?-->$/gm, "");

// ------------------------------------------------------------------ pipeline
function rank(jobs) {
  const ok = [], excl = {};
  for (const j of jobs) {
    const r = evaluate(j);
    if (r.status === "ok" && r.tier !== "C") ok.push({ ...j, match: r });
    else { const k = (r.reason || "score below threshold").replace(/:.*/, ""); excl[k] = (excl[k] || 0) + 1; }
  }
  ok.sort((a, b) => b.match.score - a.match.score);
  return [ok, excl];
}
async function pool(tasks, n) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); } }));
  return res;
}
async function collectAndRank(onlyGroups) {
  const tasks = [], feedsList = [];
  for (const [kind, args] of Object.entries(BOARDS)) {
    if (onlyGroups && !onlyGroups.includes(kind)) continue;
    for (const a of kind === "arbeitnow" ? [true] : args) {
      const feed = kind === "arbeitnow" ? "arbeitnow" : `${kind}:${a}`;
      feedsList.push(feed);
      tasks.push(async () => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try { return { feed, jobs: await FETCHERS[kind](a) }; }
          catch (e) { if (attempt === 2) return { feed, err: `${feed}: ${e.message}` }; await new Promise((r) => setTimeout(r, 1500)); }
        }
      });
    }
  }
  const kept = [], errors = [], excl = {}, feedResults = [];
  let fetched = 0;
  // each feed is ranked as soon as it is parsed so only passing jobs stay in memory
  await pool(tasks.map((t) => async () => {
    const r = await t();
    if (r.err) { errors.push(r.err); feedResults.push({ feed: r.feed, ok: false, error: r.err }); return; }
    for (const jb of r.jobs) jb.company = DISPLAY[jb.company] || jb.company;
    fetched += r.jobs.length;
    feedResults.push({ feed: r.feed, ok: true, count: r.jobs.length });
    const [ok, ex] = rank(r.jobs);
    for (const [k, v] of Object.entries(ex)) excl[k] = (excl[k] || 0) + v;
    kept.push(...ok);
  }), 3);
  kept.sort((a, b) => b.match.score - a.match.score);
  return { kept, errors, excl, fetched, feeds: feedsList.length, feedResults };
}
function artifactsFor(j) {
  const res = buildResume(j, j.match), note = buildNote(j, j.match);
  const v = verify(res, j).concat(verify(note, j));
  return v.length ? { verified: 0, blocked: v.join("; "), resume: null, note: null } : { verified: 1, blocked: null, resume: stripTags(res), note: stripTags(note) };
}
async function run(env) {
  await ensure(env);
  const t0 = Date.now(), started = iso(t0);
  // self-heal: a run that never finished (isolate killed, D1 error) is closed by the next run instead of reading as "running" forever
  await env.JOBS_DB.prepare("UPDATE jobsearch_runs SET finished_at=?1, errors_json=?2 WHERE finished_at IS NULL AND started_at < ?3")
    .bind(started, JSON.stringify(["run did not finish: closed by the next run"]), iso(t0 - 15 * 60 * 1000)).run();
  const rid = (await env.JOBS_DB.prepare("INSERT INTO jobsearch_runs (started_at) VALUES (?)").bind(started).run()).meta.last_row_id;
  try {
    const { kept, errors, excl, fetched, feeds, feedResults } = await collectAndRank();
    const per = {}, seen = new Set(), picked = [];
    for (const j of kept) {
      const dk = dedupeKey(j);
      if (seen.has(dk)) continue;               // the same posting listed on two boards
      seen.add(dk);
      if ((per[j.company] || 0) < 3) { per[j.company] = (per[j.company] || 0) + 1; picked.push(j); }
    }
    let blocked = 0;
    const now = new Date().toISOString();
    const stmts = [];
    for (const j of picked.slice(0, 40)) {
      const a = artifactsFor(j);
      if (!a.verified) blocked++;
      stmts.push(env.JOBS_DB.prepare(
        `INSERT INTO jobsearch_matches (id, first_seen, last_seen, run_id, company, title, location, url, tier, score, why_json, flags_json, verified, blocked_reason, resume_md, note_md, status)
         VALUES (?1,?2,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,'pending_owner_approval')
         ON CONFLICT(id) DO UPDATE SET last_seen=?2, run_id=?3, tier=?8, score=?9, why_json=?10, flags_json=?11, verified=?12, blocked_reason=?13, resume_md=?14, note_md=?15, title=?5, location=?6, url=?7`
      ).bind(j.id, now, rid, j.company, j.title, j.location, j.url, j.match.tier, j.match.score, JSON.stringify(j.match.why), JSON.stringify(j.match.flags), a.verified, a.blocked, a.resume, a.note));
    }
    // feed health: success resets the streak, failure extends it (detector fm-jobsearch-feed-down reads 3 in a row)
    for (const f of feedResults) {
      stmts.push(f.ok
        ? env.JOBS_DB.prepare("INSERT INTO jobsearch_feeds (feed, last_ok_at, last_count, consecutive_fail) VALUES (?1,?2,?3,0) ON CONFLICT(feed) DO UPDATE SET last_ok_at=?2, last_count=?3, consecutive_fail=0, last_error=NULL").bind(f.feed, now, f.count)
        : env.JOBS_DB.prepare("INSERT INTO jobsearch_feeds (feed, last_error, last_error_at, consecutive_fail) VALUES (?1,?2,?3,1) ON CONFLICT(feed) DO UPDATE SET last_error=?2, last_error_at=?3, consecutive_fail=consecutive_fail+1").bind(f.feed, f.error.slice(0, 300), now));
    }
    // lifecycle: a pending match whose feed answered this run but did not list it for 48 h is gone upstream or no longer matches
    const cutoff = iso(t0 - 48 * 3600 * 1000), prefixes = new Set();
    const okFeeds = new Set(feedResults.filter((f) => f.ok).map((f) => f.feed));
    for (const f of feedResults) {
      if (!f.ok) continue;
      if (f.feed.startsWith("remotive:") && !BOARDS.remotive.every((c) => okFeeds.has("remotive:" + c))) continue;
      prefixes.add(feedPrefix(f.feed));
    }
    for (const pre of prefixes) stmts.push(env.JOBS_DB.prepare("UPDATE jobsearch_matches SET status='expired', decided_at=?3 WHERE status='pending_owner_approval' AND id LIKE ?1 AND last_seen < ?2").bind(pre + "%", cutoff, now));
    // retention
    stmts.push(env.JOBS_DB.prepare("DELETE FROM jobsearch_matches WHERE status IN ('expired','rejected') AND last_seen < ?").bind(iso(t0 - 90 * 86400000)));
    stmts.push(env.JOBS_DB.prepare("DELETE FROM jobsearch_codes WHERE created_ms < ?").bind(t0 - 86400000));
    stmts.push(env.JOBS_DB.prepare("DELETE FROM jobsearch_sessions WHERE expires_ms < ?").bind(t0 - 86400000));
    await env.JOBS_DB.batch(stmts);
    await env.JOBS_DB.prepare("UPDATE jobsearch_runs SET finished_at=?, feeds=?, fetched=?, passed=?, stored=?, blocked=?, excluded_json=?, errors_json=? WHERE id=?")
      .bind(new Date().toISOString(), feeds, fetched, kept.length, Math.min(picked.length, 40), blocked, JSON.stringify(excl), JSON.stringify(errors), rid).run();
    await setMeta(env, "ledger_verified_on", LEDGER_VERIFIED_ON);
    await setMeta(env, "worker_version", VERSION);
    await setMeta(env, "email_binding", env.EMAIL ? "1" : "0");
    log("run-ok", { run_id: rid, fetched, passed: kept.length, blocked, feed_errors: errors.length, ms: Date.now() - t0 });
    return { run_id: rid, feeds, fetched, passed: kept.length, stored: Math.min(picked.length, 40), blocked, errors };
  } catch (e) {
    logErr("run-failed", e);
    await env.JOBS_DB.prepare("UPDATE jobsearch_runs SET finished_at=?, errors_json=? WHERE id=?").bind(new Date().toISOString(), JSON.stringify(["run failed: " + String((e && e.message) || e).slice(0, 300)]), rid).run().catch((e2) => logErr("run-failed-record", e2));
    throw e;
  }
}

// ------------------------------------------------------------------ http
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" } });
const parseRow = (r) => (r ? { ...r, why: JSON.parse(r.why_json || "[]"), flags: JSON.parse(r.flags_json || "[]"), why_json: undefined, flags_json: undefined } : r);
async function tokenOk(request, env) {
  const t = request.headers.get("x-loop-token") || "";
  if (!env.LOOP_TOKEN) return false;
  const [expected, actual] = await Promise.all([sha256hex(env.LOOP_TOKEN), sha256hex(t)]);
  return constEq(expected, actual);
}
async function ownerSession(request, env) {
  try {
    const tok = (await tokenOk(request, env)) ? "loop" : "";
    if (tok) return { kind: "loop-token" };
    const c = /(?:^|;\s*)jobs_session=([0-9a-f]{64})/.exec(request.headers.get("cookie") || "");
    const b = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") || "");
    const raw = (c && c[1]) || (b && b[1]);
    if (!raw) return null;
    await ensure(env);
    const row = await env.JOBS_DB.prepare("SELECT expires_ms FROM jobsearch_sessions WHERE token_hash=?1 AND revoked=0").bind(await sha256hex(raw)).first();
    return row && Number(row.expires_ms) > Date.now() ? { kind: "session", hash: await sha256hex(raw) } : null;
  } catch (e) { logErr("session-check", e); return null; }
}
async function authRequest(env) {
  if (!env.EMAIL) return [503, { error: "e-mail sign-in is not available: the EMAIL service binding is missing" }];
  await ensure(env);
  const now = Date.now();
  // The request route is public, so the cap must not let a stranger lock the owner out: it is generous (6 an hour), the answer says when to retry,
  // and a code already e-mailed stays valid for 15 minutes whatever the cap says (verify accepts any unexpired code).
  const rec = await env.JOBS_DB.prepare("SELECT COUNT(*) AS n, MIN(created_ms) AS first, MAX(created_ms) AS last FROM jobsearch_codes WHERE created_ms > ?").bind(now - 3600000).first();
  if (Number(rec.n) >= CODE_MAX_PER_HOUR) {
    const retry = Math.max(1, Math.ceil((Number(rec.first) + 3600000 - now) / 60000));
    return [429, { error: `code limit reached; a new code can be sent in ${retry} min. A code e-mailed in the last 15 min still works: enter it.`, retry_after_minutes: retry, enter_existing_code: true }];
  }
  if (rec.last && now - Number(rec.last) < CODE_MIN_GAP_MS) return [200, { ok: true, sent: false, note: "a code was sent less than a minute ago; check " + maskedOwner() }];
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const salt = randHex(8);
  await env.JOBS_DB.prepare("INSERT INTO jobsearch_codes (code_hash, salt, created_ms, expires_ms) VALUES (?1,?2,?3,?4)").bind(await sha256hex(salt + code), salt, now, now + CODE_MS).run();
  try {
    const r = await env.EMAIL.fetch("https://qnfo-email/send", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: OWNER_EMAIL, subject: "Job matches sign-in code", body: `Your sign-in code for the job matches page is ${code}. It expires in 15 minutes. If you did not ask for it, ignore this message.`, notify: true }) });
    if (!r.ok) { logErr("auth-mail", "send HTTP " + r.status); return [502, { error: "the code could not be e-mailed (HTTP " + r.status + ")" }]; }
  } catch (e) { logErr("auth-mail", e); return [502, { error: "the code could not be e-mailed" }]; }
  return [200, { ok: true, sent: true, to: maskedOwner(), expires_minutes: 15 }];
}
async function authVerify(env, code) {
  await ensure(env);
  code = String(code || "").trim();
  if (!/^\d{6}$/.test(code)) return [400, { error: "enter the 6-digit code" }];
  const now = Date.now();
  // any unexpired, unused code that has not used up its tries is a candidate (the owner may hold two e-mails)
  const rows = (await env.JOBS_DB.prepare("SELECT id, code_hash, salt, tries FROM jobsearch_codes WHERE used=0 AND expires_ms > ?1 AND tries < ?2 ORDER BY id DESC LIMIT 6").bind(now, CODE_MAX_TRIES).all()).results;
  if (!rows.length) return [401, { error: "no valid code; request a new one" }];
  let hit = null;
  for (const r of rows) if (constEq(await sha256hex(r.salt + code), r.code_hash)) hit = r;
  if (!hit) {
    await env.JOBS_DB.prepare("UPDATE jobsearch_codes SET tries=tries+1 WHERE used=0 AND expires_ms > ?1 AND tries < ?2").bind(now, CODE_MAX_TRIES).run();
    const left = CODE_MAX_TRIES - 1 - Math.max(...rows.map((r) => Number(r.tries)));
    return left <= 0 ? [429, { error: "too many wrong attempts; request a new code" }] : [401, { error: "wrong code" }];
  }
  await env.JOBS_DB.prepare("UPDATE jobsearch_codes SET used=1 WHERE id=?").bind(hit.id).run();
  const token = randHex(32);
  await env.JOBS_DB.prepare("INSERT INTO jobsearch_sessions (token_hash, created_ms, expires_ms) VALUES (?1,?2,?3)").bind(await sha256hex(token), now, now + SESSION_MS).run();
  return [200, { ok: true, token, expires_hours: SESSION_MS / 3600000 }, `jobs_session=${token}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; Secure; SameSite=Strict`];
}
// Operational self-report: the same checks as the fm-jobsearch-* detector contracts in migrations/2026-10-27-jobsearch-ops.sql
async function opsReport(env) {
  await ensure(env);
  const db = env.JOBS_DB, now = Date.now();
  const last = await db.prepare("SELECT * FROM jobsearch_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").first();
  const recent = (await db.prepare("SELECT passed, fetched FROM jobsearch_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 3").all()).results;
  const unfinished = (await db.prepare("SELECT COUNT(*) AS n FROM jobsearch_runs WHERE finished_at IS NULL AND started_at < ?").bind(iso(now - 15 * 60000)).first()).n;
  const feeds = (await db.prepare("SELECT feed, last_ok_at, last_count, last_error, consecutive_fail FROM jobsearch_feeds ORDER BY feed").all()).results;
  const counts = (await db.prepare("SELECT status, COUNT(*) AS n FROM jobsearch_matches GROUP BY status").all()).results;
  const blockedN = (await db.prepare("SELECT COUNT(*) AS n FROM jobsearch_matches WHERE verified=0 AND status='pending_owner_approval'").first()).n;
  const stalePending = (await db.prepare("SELECT COUNT(*) AS n FROM jobsearch_matches WHERE status='pending_owner_approval' AND last_seen < ?").bind(iso(now - 72 * 3600000)).first()).n;
  const ageMin = last ? Math.round((now - Date.parse(last.finished_at)) / 60000) : null;
  const ledgerAge = Math.floor((now - Date.parse(LEDGER_VERIFIED_ON)) / 86400000);
  const checks = [
    { fm: "jobsearch-cron-stalled", ok: ageMin !== null && ageMin <= 120, detail: ageMin === null ? "no finished run yet" : `last run finished ${ageMin} min ago (limit 120)` },
    { fm: "jobsearch-run-unfinished", ok: Number(unfinished) === 0, detail: `${unfinished} run(s) open for over 15 min (the next run closes them)` },
    { fm: "jobsearch-feed-down", ok: !feeds.some((f) => f.consecutive_fail >= 3), detail: feeds.filter((f) => f.consecutive_fail >= 3).map((f) => f.feed + " x" + f.consecutive_fail).join(", ") || "no feed failed 3 runs in a row" },
    { fm: "jobsearch-verifier-blocked", ok: Number(blockedN) === 0, detail: `${blockedN} pending match(es) whose drafts failed verification` },
    { fm: "jobsearch-stale-pending", ok: Number(stalePending) === 0, detail: `${stalePending} pending match(es) not seen for 72 h` },
    { fm: "jobsearch-ledger-stale", ok: ledgerAge <= 90, detail: `ledger verified ${LEDGER_VERIFIED_ON}, ${ledgerAge} days old (limit 90)` },
    { fm: "jobsearch-intake-collapse", ok: !(recent.length >= 3 && recent.every((r) => Number(r.fetched) < 1000 || Number(r.passed) === 0)), detail: recent.map((r) => `${r.fetched}/${r.passed}`).join(" ") + " (fetched/passed, last 3 runs)" },
    { fm: "jobsearch-auth-unavailable", ok: !!env.EMAIL || !!env.LOOP_TOKEN, detail: `email sign-in ${env.EMAIL ? "bound" : "missing"}, loop token ${env.LOOP_TOKEN ? "set" : "not set"}` },
  ];
  return { worker: WORKER, version: VERSION, status: checks.every((c) => c.ok) ? "ok" : "degraded", checked_at: iso(now), last_run: last ? { id: last.id, finished_at: last.finished_at, fetched: last.fetched, passed: last.passed, stored: last.stored, blocked: last.blocked } : null, feeds, matches_by_status: Object.fromEntries(counts.map((c) => [c.status, c.n])), checks };
}
const INDEX = {
  worker: WORKER, version: VERSION,
  routes: {
    "GET /": "web UI", "GET /api/matches?tier=A|B&status=&q=&limit=": "ranked matches without artifacts", "GET /api/matches/:id": "one match with resume_md and note_md",
    "GET /api/runs": "recent pipeline runs", "GET /api/ledger": "the claim ledger every output sentence must come from", "GET /api/ops": "operational self-report: the fm-jobsearch-* checks, feed health, counts", "POST /api/auth/request": "e-mail a 6-digit sign-in code to the owner", "POST /api/auth/verify": "{code} -> owner session (cookie jobs_session, 12 h)", "GET /api/auth/me": "signed-in state", "POST /api/auth/logout": "revoke the session", "POST /api/run": "trigger a run (10-minute cooldown)",
    "POST /api/matches/:id/status": "owner decision {status: approved|rejected|applied|pending_owner_approval}; needs an owner session or x-loop-token", "GET /health": "version",
  },
  policy: "nothing is sent; approval is a status change only",
};

const handler = {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env).catch((e) => console.log("[jobsearch] run failed " + e.message))); },
  async fetch(request, env, ctx) {
    const url = new URL(request.url), p = url.pathname, m = request.method;
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-loop-token", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    if (p === "/health") return J({ ok: true, worker: WORKER, version: VERSION, ledger_verified_on: LEDGER_VERIFIED_ON });
    if (p === "/" && m === "GET") return new Response(UI, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (p === "/api" && m === "GET") return J(INDEX);
    if (p === "/api/ledger" && m === "GET") return J({ person: { ...LEDGER.person, sign_in_email: undefined }, owner_stated: LEDGER.owner_stated, unverified_needs_owner: LEDGER.unverified_needs_owner, facts: LEDGER.facts.map((f) => ({ id: f.id, text: f.text, employer: f.employer, period: f.period })), headlines: LEDGER.headlines });
    if (p === "/api/ops" && m === "GET") { const rep = await opsReport(env); return J(rep, rep.status === "ok" ? 200 : 503); }
    if (p === "/api/auth/request" && m === "POST") { const [st, body] = await authRequest(env); return J(body, st); }
    if (p === "/api/auth/verify" && m === "POST") {
      let b = {}; try { b = await request.json(); } catch (e) { logErr("bad-json-body", e); }
      const [st, body, cookie] = await authVerify(env, b.code);
      const r = J(body, st);
      if (cookie) r.headers.append("set-cookie", cookie);
      return r;
    }
    if (p === "/api/auth/me" && m === "GET") return J({ signed_in: !!(await ownerSession(request, env)), email_sign_in: !!env.EMAIL });
    if (p === "/api/auth/logout" && m === "POST") {
      const ses = await ownerSession(request, env);
      if (ses && ses.hash) await env.JOBS_DB.prepare("UPDATE jobsearch_sessions SET revoked=1 WHERE token_hash=?").bind(ses.hash).run();
      const r = J({ ok: true }); r.headers.append("set-cookie", "jobs_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"); return r;
    }
    if (p === "/api/runs" && m === "GET") {
      const r = await env.JOBS_DB.prepare("SELECT id, started_at, finished_at, feeds, fetched, passed, stored, blocked, excluded_json, errors_json FROM jobsearch_runs ORDER BY id DESC LIMIT 10").all();
      return J({ runs: r.results.map((x) => ({ ...x, excluded: JSON.parse(x.excluded_json || "{}"), errors: JSON.parse(x.errors_json || "[]"), excluded_json: undefined, errors_json: undefined })) });
    }
    if (p === "/api/matches" && m === "GET") {
      const tier = url.searchParams.get("tier"), status = url.searchParams.get("status"), q = (url.searchParams.get("q") || "").toLowerCase();
      const lim = Math.min(200, +url.searchParams.get("limit") || 100);
      const r = await env.JOBS_DB.prepare("SELECT id, first_seen, last_seen, company, title, location, url, tier, score, why_json, flags_json, verified, blocked_reason, status, decided_at FROM jobsearch_matches ORDER BY score DESC, last_seen DESC LIMIT 500").all();
      let rows = r.results.map(parseRow);
      if (tier) rows = rows.filter((x) => x.tier === tier);
      if (status) rows = rows.filter((x) => x.status === status);
      if (q) rows = rows.filter((x) => (x.title + " " + x.company + " " + x.location).toLowerCase().includes(q));
      return J({ count: rows.length, matches: rows.slice(0, lim) });
    }
    let mm = p.match(/^\/api\/matches\/(.+?)(\/status)?$/);
    if (mm && m === "GET" && !mm[2]) {
      const row = await env.JOBS_DB.prepare("SELECT * FROM jobsearch_matches WHERE id=?").bind(decodeURIComponent(mm[1])).first();
      return row ? J(parseRow(row)) : J({ error: "not found" }, 404);
    }
    if (mm && m === "POST" && mm[2]) {
      if (!env.LOOP_TOKEN && !env.EMAIL) return J({ error: "writes disabled: neither the EMAIL binding nor LOOP_TOKEN is available" }, 503);
      if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      let body = {}; try { body = await request.json(); } catch (e) { console.error(JSON.stringify({ worker: WORKER, event: "bad-json-body", error: e.message })); }
      if (!["approved", "rejected", "applied", "pending_owner_approval"].includes(body.status)) return J({ error: "status must be approved|rejected|applied|pending_owner_approval" }, 400);
      const id = decodeURIComponent(mm[1]);
      const cur = await env.JOBS_DB.prepare("SELECT verified FROM jobsearch_matches WHERE id=?").bind(id).first();
      if (!cur) return J({ error: "not found" }, 404);
      if (!cur.verified && body.status !== "rejected" && body.status !== "pending_owner_approval") return J({ error: "artifacts failed verification; only rejected is allowed" }, 409);
      await env.JOBS_DB.prepare("UPDATE jobsearch_matches SET status=?, decided_at=? WHERE id=?").bind(body.status, new Date().toISOString(), id).run();
      return J({ ok: true, id, status: body.status });
    }
    if (p === "/api/run" && m === "POST") {
      const last = await env.JOBS_DB.prepare("SELECT started_at FROM jobsearch_runs ORDER BY id DESC LIMIT 1").first();
      if (last && Date.now() - Date.parse(last.started_at) < 10 * 60 * 1000) return J({ error: "cooldown: last run started " + last.started_at }, 429);
      ctx.waitUntil(run(env).catch((e) => console.log("[jobsearch] run failed " + e.message)));
      return J({ ok: true, started: true, note: "poll GET /api/runs" }, 202);
    }
    return J({ error: "not found", see: "/api" }, 404);
  },
};
handler.__test = { evaluate, rank, buildResume, buildNote, verify, stripHtml, locationGate, LEDGER, dedupeKey, feedPrefix };
export default handler;

// ------------------------------------------------------------------ web UI (light theme, plain JS, talks only to the API above)
const UI = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Job matches: verified claims only</title>
<style>
:root{--bg:#f7f7f4;--card:#fff;--ink:#1c1c1a;--mute:#6b6b66;--line:#e2e2dc;--a:#1a7f4b;--b:#a06a00;--bad:#b3261e;--acc:#1f4fd8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:18px 20px;border-bottom:1px solid var(--line);background:#fff;position:sticky;top:0;z-index:2}
h1{margin:0 0 4px;font-size:19px}.sub{color:var(--mute);font-size:13px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}
select,input,button{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:#fff}
button{cursor:pointer}button.p{background:var(--acc);color:#fff;border-color:var(--acc)}button:disabled{opacity:.5;cursor:default}
main{max-width:900px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 12px}
.row{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.t{font-weight:600;font-size:16px}
.badge{font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;color:#fff}.A{background:var(--a)}.B{background:var(--b)}
.mute{color:var(--mute);font-size:13px}.flag{color:var(--bad);font-size:13px;margin-top:4px}
.st{font-size:12px;border:1px solid var(--line);border-radius:99px;padding:1px 8px}.st.approved{border-color:var(--a);color:var(--a)}.st.rejected{border-color:var(--bad);color:var(--bad)}
pre{white-space:pre-wrap;background:#fbfbf8;border:1px solid var(--line);border-radius:8px;padding:10px;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace}
.acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}a{color:var(--acc)}
.note{background:#fff8e1;border:1px solid #f0d98a;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:12px}
</style></head><body>
<header><h1>Job matches: verified claims only</h1><div class="sub" id="meta">loading…</div>
<div class="bar"><select id="tier"><option value="">All tiers</option><option>A</option><option>B</option></select>
<select id="status"><option value="">All statuses</option><option value="pending_owner_approval">Pending</option><option>approved</option><option>rejected</option><option>applied</option></select>
<input id="q" placeholder="Search title, company, place" size="26"><button id="run" class="p">Run now</button><a href="/api" class="mute">API</a> <a href="/api/ledger" class="mute">Claim ledger</a> <a href="/api/ops" class="mute">Operations</a> <span id="who" class="mute"></span><button id="signin" onclick="signIn().catch(e=>alert(e.message))">Sign in</button><button id="signout" style="display:none" onclick="api(\'/api/auth/logout\',{method:\'POST\'}).then(who)">Sign out</button></div></header>
<main><div class="note">Every sentence in a resume or note is copied from the claim ledger and re-checked line by line; a failed check blocks the draft. Nothing is sent: approve only marks your decision, then you apply from the posting link.</div><div id="list"></div></main>
<script>
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function api(path,opt){const r=await fetch(path,opt);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j}
async function load(){
  const q=new URLSearchParams();for(const k of['tier','status','q']){const v=$('#'+k).value;if(v)q.set(k,v)}
  const [m,r]=await Promise.all([api('/api/matches?'+q),api('/api/runs')]);
  const last=r.runs[0];$('#meta').textContent=last?('Last run '+last.started_at+' | '+last.fetched+' postings from '+last.feeds+' feeds | '+last.passed+' passed gates | '+last.blocked+' blocked by verifier'+(last.errors.length?' | feed errors: '+last.errors.length:'')):'No run yet. Press Run now.';
  $('#list').innerHTML=m.matches.map(x=>'<div class="card" id="c-'+esc(x.id)+'"><div class="row"><span class="badge '+x.tier+'">'+x.tier+' '+x.score+'</span><span class="t">'+esc(x.title)+'</span><span class="mute">'+esc(x.company)+' | '+esc(x.location||'n/a')+'</span><span class="st '+esc(x.status)+'">'+esc(x.status.replace(/_/g,' '))+'</span></div>'
   +'<div class="mute">'+esc(x.why.join(' | '))+'</div>'+x.flags.map(f=>'<div class="flag">Check: '+esc(f)+'</div>').join('')
   +(x.verified?'':'<div class="flag">Blocked by verifier: '+esc(x.blocked_reason)+'</div>')
   +'<div class="acts"><a href="'+esc(x.url)+'" target="_blank" rel="noopener"><button>Open posting</button></a><button onclick="show(\\''+esc(x.id)+'\\')">Resume and note</button>'
   +'<button onclick="decide(\\''+esc(x.id)+'\\',\\'approved\\')">Approve</button><button onclick="decide(\\''+esc(x.id)+'\\',\\'rejected\\')">Reject</button><button onclick="decide(\\''+esc(x.id)+'\\',\\'applied\\')">Mark applied</button></div><div class="art"></div></div>').join('')||'<p class="mute">No matches yet.</p>';
}
async function show(id){const el=document.getElementById('c-'+id).querySelector('.art');if(el.innerHTML){el.innerHTML='';return}
  const d=await api('/api/matches/'+encodeURIComponent(id));if(!d.verified){el.innerHTML='<pre>Blocked: '+esc(d.blocked_reason)+'</pre>';return}
  el.innerHTML='<h4>Resume</h4><pre>'+esc(d.resume_md)+'</pre><h4>Note</h4><pre>'+esc(d.note_md)+'</pre><button onclick="navigator.clipboard.writeText(this.dataset.t)" data-t="'+esc(d.note_md)+'">Copy note</button> <button onclick="navigator.clipboard.writeText(this.dataset.t)" data-t="'+esc(d.resume_md)+'">Copy resume</button>'}
async function signIn(){let r;try{r=await api('/api/auth/request',{method:'POST'})}catch(e){if(!/limit/.test(e.message))throw e;r={sent:false,note:e.message}}const c=prompt((r.sent===false?r.note:'A 6-digit code was e-mailed to '+r.to)+' Enter the code:');if(!c)return false;await api('/api/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:c})});who();return true}
async function who(){try{const m=await api('/api/auth/me');$('#who').textContent=m.signed_in?'Signed in':'Not signed in';$('#signin').style.display=m.signed_in?'none':'';$('#signout').style.display=m.signed_in?'':'none'}catch(e){$('#who').textContent='Sign-in status unavailable: '+e.message}}
async function decide(id,status){
  const call=()=>api('/api/matches/'+encodeURIComponent(id)+'/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status})});
  try{await call()}catch(e){if(/sign in/.test(e.message)){try{if(await signIn())await call();else return}catch(e2){alert(e2.message);return}}else{alert(e.message);return}}load()}
$('#run').onclick=async()=>{$('#run').disabled=true;try{await api('/api/run',{method:'POST'});$('#meta').textContent='Run started. Refreshing in 40 s…';setTimeout(()=>{load();$('#run').disabled=false},40000)}catch(e){alert(e.message);$('#run').disabled=false}};
for(const k of['tier','status'])$('#'+k).onchange=load;$('#q').oninput=()=>{clearTimeout(window._t);window._t=setTimeout(load,300)};load();who();
</script></body></html>`;
