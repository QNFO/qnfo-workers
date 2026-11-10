// qnfo-jobsearch: verified-claims job matcher (JOBSEARCH-1). Charter pillar: personal.
// Hourly cron fetches public ATS feeds (Greenhouse, Lever, Ashby) plus Remotive and Arbeitnow, gates and scores each posting
// against the owner's claim ledger, assembles a tailored resume and note ONLY from ledger sentences, re-verifies every output
// line, and stores the result in D1 (jobsearch_matches). Nothing is ever sent: status moves pending_owner_approval -> approved/rejected/applied
// by the owner (POST needs x-loop-token). No LinkedIn/Indeed scraping (LinkedIn User Agreement s8.2).
// JOBSEARCH-OPS-1 (1.1.0): e-mailed-code owner sign-in via qnfo-email (no secret to manage), feed health and retry, self-healing runs, posting lifecycle (expired), dedupe, retention, GET /api/ops self-report.
// JOBSEARCH-OUTCOME-1 (1.2.0): append-only status events, outcome funnel (applied, replies, interviews, offers), reply rate of applications older than 21 days, metrics jobsearch_reply_rate_90d / jobsearch_interview_rate_90d / jobsearch_applied_30d written each run, no_reply after 21 days.
// JOBSEARCH-PROFILE-1 (1.3.0): yes/no search survey, role families drawn from the whole record (policy, transport and planning, data, product, program, research, consulting, nonprofit, GIS, contracts, social policy), location gates from the owner answers (Netherlands and remote by default, US and other on-site only when selected), likes and dislikes teach the search, rejected matches stay hidden, "check a job" analysis of a pasted link or text.
// JOBSEARCH-CV-1 (1.5.0): the CV is part of this worker (page /cv): a yes/no interview that builds the claim bank, review of unconfirmed claims, roles, achievements and publications edited in D1, a resume per job (summary, roles, selected work, education, skills) and a cover note, history and backup. The search is tied to that bank (evidence the owner can back up weighs more; what the CV lacks is shown as a gap), decided postings (rejected, applied, approved) never come back under another id, rejections carry a reason the search learns from, and a wider net: stretch matches outside the stated preferences, more boards and aggregators.
// Routes: GET / (web UI) | GET /api | GET /api/matches | GET /api/matches/:id | GET /api/runs | GET /api/ledger | POST /api/run | POST /api/matches/:id/status | GET /health
// Port of the jobsearch/ Python modules (tests: jobsearch/test_jobsearch.py, qnfo-jobsearch/worker.test.mjs).
var VERSION = "1.20.0-codeagent";
// WORKERS-AI-ATTRIBUTION-1 (2026-10-01, #1681): per-worker Workers AI attribution. Returns a shallow env copy whose AI
// binding records each .run() (calls, errors, ms, tokens, neurons) into qnfo-audit ai_call_counters (purpose 'binding').
// Neurons = usage tokens x Cloudflare's published per-model rates (neurons per M tokens). Fail-soft; env is never mutated.
var __AI_ATTR_RATES = { "@cf/zai-org/glm-5.3": [127273, 400000], "@cf/zai-org/glm-5.3-flash": [13636, 45455], "@cf/nvidia/nemotron-3-120b-a12b": [45455, 136364], "@cf/moonshotai/kimi-k2.6": [86364, 363636], "@cf/moonshotai/kimi-k2.7-code": [86364, 363636], "@cf/openai/gpt-oss-120b": [31818, 68182], "@cf/openai/gpt-oss-20b": [18182, 27273], "@cf/deepseek-ai/deepseek-v4-pro-0813": [120000, 360000], "@cf/deepseek-ai/deepseek-v4-flash-0731": [40000, 120000], "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805], "@cf/qwen/qwen3-30b-a3b-fp8": [4625, 30475], "@cf/qwen/qwen3.8-27b": [40909, 290909], "@cf/baai/bge-base-en-v1.5": [6058, 0], "@cf/baai/bge-small-en-v1.5": [1841, 0], "@cf/baai/bge-large-en-v1.5": [18582, 0] };
function __aiAttrEnv(env, worker, aiKey, dbKey) {
  try {
    if (!env || env.__aiAttr) return env;
    var ai = env[aiKey], db = env[dbKey];
    if (!ai || typeof ai.run !== "function" || !db) return env;
    var wrapped = new Proxy(ai, { get: function (t, p) {
      if (p !== "run") { var v = Reflect.get(t, p); return typeof v === "function" ? v.bind(t) : v; }
      return async function (model, input, opts) {
        var t0 = Date.now(), ok = 1, res;
        try { res = await t.run(model, input, opts); return res; } catch (e) { ok = 0; throw e; }
        finally {
          try {
            var u = res && typeof res === "object" && res.usage || {};
            var chars = 0; try { chars = JSON.stringify(input && (input.messages || input.prompt || input.text) || input || "").length; } catch (e1) {} // standards-ok: the counter is fail-soft by design, an AI call never fails because of its own bookkeeping
            var inTok = Number(u.prompt_tokens || u.input_tokens || 0) || Math.round(chars / 4);
            var outTok = Number(u.completion_tokens || u.output_tokens || 0);
            var r = __AI_ATTR_RATES[String(model)] || [0, 0];
            var neurons = (inTok * r[0] + outTok * r[1]) / 1e6;
            await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms, in_tok, out_tok, neurons) VALUES (?1,?2,'binding',?3,1,?4,?5,?6,?7,?8,?9) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+excluded.errors, in_chars=in_chars+excluded.in_chars, ms=ms+excluded.ms, in_tok=in_tok+excluded.in_tok, out_tok=out_tok+excluded.out_tok, neurons=neurons+excluded.neurons")
              .bind(new Date().toISOString().slice(0, 10), worker, String(model).slice(0, 120), ok ? 0 : 1, chars, Date.now() - t0, inTok, outTok, neurons).run();
          } catch (e2) {} // standards-ok: the counter is fail-soft by design, an AI call never fails because of its own bookkeeping
        }
      };
    } });
    var copy = Object.assign({}, env);
    copy[aiKey] = wrapped;
    copy.__aiAttr = 1;
    return copy;
  } catch (e) {
    return env;
  }
}
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
    "federal",
    "contracting",
    "program_mgmt"
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
    "data_product",
    "urban_planning",
    "survey_methods"
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
    "data_product",
    "social_policy",
    "survey_methods",
    "gis"
   ],
   "employer": "AARP Public Policy Institute",
   "period": "2016-2021",
   "text": "Led the AARP Livability Index: 50+ data sources across 7 domains, scoring U.S. neighborhoods nationwide, across multiple public releases.",
   "pitch": "At AARP I led the Livability Index: 50+ data sources across 7 domains, scoring U.S. neighborhoods nationwide."
  },
  {
   "id": "F04",
   "cluster": [
    "policy_research",
    "social_policy"
   ],
   "employer": "AARP Public Policy Institute",
   "period": "2016-2021",
   "text": "The Index and its method are cited in 20+ academic and policy studies.",
   "pitch": "The Livability Index and its method are cited in 20+ academic and policy studies."
  },
  {
   "id": "F05",
   "cluster": [
    "policy_research",
    "social_policy"
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
    "leadership",
    "program_mgmt"
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
    "federal",
    "consulting"
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
    "policy_research",
    "survey_methods",
    "urban_planning"
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
    "policy_research",
    "urban_planning"
   ],
   "employer": "U.S. DOT, Federal Highway Administration",
   "period": "2011-2015",
   "text": "Presented national long-distance travel data needs at the 2011 TRB National Household Travel Survey workshop.",
   "pitch": "I presented national long-distance travel data needs at the 2011 TRB National Household Travel Survey workshop."
  },
  {
   "id": "F15",
   "cluster": [
    "product",
    "data_product"
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
    "research_integrity",
    "autonomous_systems"
   ],
   "text": "Autonomous AI systems researcher: founder of QNFO, an autonomous research system in production with a published failure record, after 20 years of systems work at the U.S. Federal Highway Administration and AARP."
  },
  {
   "id": "H3",
   "cluster": [
    "data_product",
    "product",
    "data_science",
    "survey_methods"
   ],
   "text": "Data and product leader: 15 years running national research programs and data products at the U.S. Federal Highway Administration and AARP; later product roles at Epsilon and iManage."
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
let LEDGER_VERIFIED_ON = LEDGER.ledger_verified_on || "2026-10-01";
const SESSION_MS = 12 * 3600 * 1000, CODE_MS = 15 * 60 * 1000, CODE_MAX_PER_HOUR = 6, CODE_MIN_GAP_MS = 60 * 1000, CODE_MAX_TRIES = 5;
const DDL = [
  "CREATE TABLE IF NOT EXISTS jobsearch_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT, feeds INTEGER, fetched INTEGER, passed INTEGER, stored INTEGER, blocked INTEGER, excluded_json TEXT, errors_json TEXT)",
  "CREATE TABLE IF NOT EXISTS jobsearch_matches (id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, run_id INTEGER, company TEXT, title TEXT, location TEXT, url TEXT, tier TEXT, score INTEGER, why_json TEXT, flags_json TEXT, verified INTEGER NOT NULL DEFAULT 0, blocked_reason TEXT, resume_md TEXT, note_md TEXT, status TEXT NOT NULL DEFAULT 'pending_owner_approval', decided_at TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_jobsearch_matches_rank ON jobsearch_matches (score DESC, last_seen DESC)",
  "CREATE TABLE IF NOT EXISTS jobsearch_feeds (feed TEXT PRIMARY KEY, last_ok_at TEXT, last_count INTEGER, last_error TEXT, last_error_at TEXT, consecutive_fail INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS jobsearch_meta (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS jobsearch_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code_hash TEXT NOT NULL, salt TEXT NOT NULL, created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS jobsearch_sessions (token_hash TEXT PRIMARY KEY, created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS jobsearch_events (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, event TEXT NOT NULL, ts TEXT NOT NULL, note TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_jobsearch_events_match ON jobsearch_events (match_id, ts)",
  "CREATE TABLE IF NOT EXISTS jobsearch_prefs (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS jobsearch_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, title TEXT, company TEXT, verdict TEXT NOT NULL, source TEXT)",
  "CREATE TABLE IF NOT EXISTS jobsearch_bank (k TEXT PRIMARY KEY, v TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 0, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS jobsearch_bank_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, rev INTEGER NOT NULL, v TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS jobsearch_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, title TEXT, company TEXT, url TEXT, fit INTEGER, verdict TEXT, resume_md TEXT, note_md TEXT)",
  "CREATE TABLE IF NOT EXISTS jobsearch_calib (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, title TEXT, company TEXT, rubric_fit INTEGER, judge_fit INTEGER, owner TEXT NOT NULL)",
];
let ensured = false;
async function ensure(env) {
  if (ensured) return;
  for (const q of DDL) await env.JOBS_DB.prepare(q).run();
  try { await env.JOBS_DB.prepare("ALTER TABLE jobsearch_feedback ADD COLUMN reason TEXT").run(); } catch (e) { if (!/duplicate column/i.test(String((e && e.message) || e))) throw e; }
  try { await env.JOBS_DB.prepare("ALTER TABLE jobsearch_matches ADD COLUMN gaps_json TEXT").run(); } catch (e) { if (!/duplicate column/i.test(String((e && e.message) || e))) throw e; }   // PROMPTED-RECALL-1: what the posting asks for that the CV cannot back   // why a posting was rejected: the search learns from it
  ensured = true; try { await generateWeeklyDossier(env); } catch (e) { logErr("dossier", e); }   // JOBSEARCH-DOSSIER-SOFT-1: a side job never takes a request down (the Monday query on a missing column returned 1101 on 2026-11-09)
}
// REACH-FOCUS-1.7: weekly dossier of five named people/organizations
async function generateWeeklyDossier(env) {
  // Run only on Monday UTC
  const now = new Date();
  if (now.getUTCDay() !== 1) return;
  // Select up to five distinct employers from recent non‑stretch matches
  const rows = await env.JOBS_DB.prepare(
    "SELECT DISTINCT company AS employer FROM jobsearch_matches WHERE company IS NOT NULL AND tier <> 'C' ORDER BY last_seen DESC LIMIT 5"
  ).all();
  const dossier = (rows.results || []).map(r => r.employer).filter(Boolean);
  if (dossier.length) await setMeta(env, "weekly_dossier", JSON.stringify(dossier));
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
  return { greenhouse: `gh:${arg}:`, lever: `lv:${arg}:`, ashby: `ab:${arg}:`, recruitee: `rc:${arg}:`, smartrecruiters: `sr:${arg}:`, remotive: "rm:", muse: "mu:", jobicy: "jb:", arbeitnow: "an:", remoteok: "rok:", himalayas: "him:", hn: "hn:", publicsector: `ps:${arg}:`, workable: `wk:${arg}:` }[kind];
}
const dedupeKey = (j) => `${j.company}|${j.title}|${j.location}`.toLowerCase().replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------ feeds
// JOBSEARCH-SOURCES-1 (2026-10-28; tier B from 35 so data-product roles at Amsterdam employers surface, legal titles excluded outright): boards chosen for the owner's record (policy and research management, data products, transport and mobility, AI) and for
// Amsterdam and EU employers; each slug was probed live against the public API before it was added. A board that fails 3 runs in a row shows in /api/ops.
const BOARDS = {
  greenhouse: ["anthropic", "scaleai", "mongodb", "elastic", "gitlab", "databricks", "stripe", "adyen", "bird", "datadog", "cloudflare", "canonical", "grafanalabs", "mozilla", "wikimedia", "khanacademy",
    "codeforamerica", "givewell", "dataiku", "fivetran", "nesta", "gallup", "rti", "ideo", "waymo", "nuro", "lyft",
    "givedirectly", "goodfire", "turing", "via", "catawiki", "labelbox"],   // JOBSEARCH-AUTONOMY-1: ionq, psiquantum and riverlane (quantum) dropped
  lever: ["palantir", "mendix", "brookings", "oliverwyman", "zoox", "apolloresearch", "metr"],   // JS-7 (2026-11-05): mistral left Lever (HTTP 404 on Lever, Ashby and Greenhouse, 0 postings on SmartRecruiters) and held fm-jobsearch-feed-down red at 3 failed runs
  ashby: ["openai", "cohere", "notion", "elevenlabs", "mollie", "mapbox", "perplexity", "snowflake", "faculty", "wayve", "cerebras", "anyscale", "modal", "fireworks", "redwoodresearch", "pinecone", "runway", "miro"],
  recruitee: ["bunq", "msf", "solvinity", "sweco"],   // sweco: transport, urban and water planning consultancy (probed 2026-11-05: 179 offers, Netherlands among them)
  smartrecruiters: ["oecd"],                           // JOBSEARCH-SOURCES-1 (JS-7): OECD policy research and statistics roles (probed 2026-11-05: 22 postings)
  remotive: ["data", "product", "all-others", "q=research", "q=policy", "q=scientist", "q=autonomous", "q=ai safety", "q=program manager", "q=analyst",
    "q=transportation", "q=forecasting", "q=simulation", "q=modelling", "q=evaluation", "q=systems", "q=agents", "q=geospatial", "q=ai governance", "q=ai policy", "q=decision science"],   // JOBSEARCH-DIRECTIONS-1: queries drawn from the record's own work (network models, travel forecasting, simulation, geospatial, evaluation), not from role titles
  muse: [],   // JOBSEARCH-MUSE-RETIRED-1 (issue 2562, 2026-11-09): all 8 Muse feeds answered HTTP 404 for 20 runs in a row, so /api/ops stayed degraded (503) and the traffic-health journey counted it as a 5xx; an empty list drops them from ACTIVE_FEEDS and the fetch loop (re-add the combinations when the endpoint answers again)
  jobicy: ["netherlands", "europe", "emea", "tag:research", "tag:data science", "tag:policy", "tag:machine learning"],
  remoteok: [true],
  himalayas: [10],
  hn: [true],
  arbeitnow: true,
  publicsector: ["werkenvoornederland", "academictransfer", "euraxess"],
};
// JOBSEARCH-FIT-1 (2026-11-09): employers that post the owner's target roles (AI governance, evaluation and assurance, autonomous-systems research, mobility modelling)
// and whose roles are often seen only on LinkedIn. These slugs could not be probed from the session (its egress proxy refuses the ATS hosts), so the worker probes
// them itself: a candidate board that answers is ranked like any board and recorded in jobsearch_feeds; one that answers 404 or fails is skipped silently and never
// counts as a feed outage. GET /api/ops lists which candidates answered ("candidates_live"); a live one moves into BOARDS by a later change.
const CANDIDATE_BOARDS = {
  greenhouse: ["deepmind", "appliedintuition", "aurorainnovation", "motional", "kodiak", "zipline", "credoai", "epochai", "partnershiponai", "isomorphiclabs", "here", "tomtom", "bosch", "arcadis", "thoughtworks", "humanloop", "anthropicpolicy"],
  lever: ["holisticai", "arthur", "fiddlerai", "farai", "conjecture", "aisafety", "governanceai", "oxa", "einride", "volocopter", "lilium"],
  ashby: ["patronus-ai", "haize-labs", "grayswan", "apollo-research", "lakera", "transluce", "epoch", "far-ai", "safe-ai", "aisi", "goodfire", "meter", "metr"],
  workable: ["holistic-ai", "saidot", "trail-ml", "tno", "royal-haskoningdhv", "goudappel", "deltares", "rand-europe", "ada-lovelace-institute", "the-alan-turing-institute", "alan-turing-institute", "turing", "govai", "centre-for-the-governance-of-ai"],
};
const ACTIVE_FEEDS = new Set(Object.entries(BOARDS).flatMap(([kind, args]) =>
  kind === "arbeitnow" ? ["arbeitnow"] : args.map((arg) => `${kind}:${arg}`)
));
const DISPLAY = { openai: "OpenAI", scaleai: "Scale AI", gitlab: "GitLab", mongodb: "MongoDB", anthropic: "Anthropic", databricks: "Databricks", elastic: "Elastic", stripe: "Stripe", palantir: "Palantir", mistral: "Mistral", cohere: "Cohere", notion: "Notion", elevenlabs: "ElevenLabs", adyen: "Adyen", bird: "Bird", datadog: "Datadog", cloudflare: "Cloudflare", canonical: "Canonical", grafanalabs: "Grafana Labs", mozilla: "Mozilla", wikimedia: "Wikimedia Foundation", khanacademy: "Khan Academy", codeforamerica: "Code for America", givewell: "GiveWell", dataiku: "Dataiku", fivetran: "Fivetran", nesta: "Nesta", gallup: "Gallup", rti: "RTI International", ideo: "IDEO", waymo: "Waymo", nuro: "Nuro", lyft: "Lyft", mendix: "Mendix", brookings: "Brookings Institution", oliverwyman: "Oliver Wyman", zoox: "Zoox", mollie: "Mollie", mapbox: "Mapbox", perplexity: "Perplexity", snowflake: "Snowflake", givedirectly: "GiveDirectly", goodfire: "Goodfire", ionq: "IonQ", psiquantum: "PsiQuantum", riverlane: "Riverlane", turing: "The Alan Turing Institute", via: "Via", catawiki: "Catawiki", labelbox: "Labelbox", apolloresearch: "Apollo Research", metr: "METR", rigetti: "Rigetti", faculty: "Faculty", wayve: "Wayve", cerebras: "Cerebras", anyscale: "Anyscale", modal: "Modal", fireworks: "Fireworks AI", redwoodresearch: "Redwood Research", pinecone: "Pinecone", runway: "Runway", miro: "Miro", bunq: "bunq", msf: "Doctors Without Borders (MSF)", solvinity: "Solvinity", sweco: "Sweco",
    deepmind: "DeepMind", tno: "TNO", cwi: "CWI", "european-commission": "European Commission", nwo: "NWO", "university-of-amsterdam": "University of Amsterdam" };

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
async function getHtml(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(url, { headers: { "user-agent": "qnfo-jobsearch/1.0 (+https://qnfo.org; contact via https://qnfo.org)", "accept": "text/html" }, signal: ac.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
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
  // JOBSEARCH-FIT-1: Workable public job widget (used by many EU research institutes and AI-governance start-ups); details=true carries the posting text
  async workable(slug) {
    const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`);
    return (Array.isArray(d.jobs) ? d.jobs : []).map((j) => ({ id: `wk:${slug}:${j.shortcode || j.id || j.title}`, source: "workable", company: d.name || slug, title: j.title || "", location: [j.city, j.state, j.country].filter(Boolean).join(", ") + (j.telecommuting ? " (Remote)" : ""), url: j.url || j.application_url || `https://apply.workable.com/${slug}/j/${j.shortcode || ""}`, desc: stripHtml((j.description || "") + " " + (j.requirements || "")) }));
  },
  async remotive(cat) {
    const d = await getJson(cat.startsWith("q=") ? `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(cat.slice(2))}&limit=100` : `https://remotive.com/api/remote-jobs?category=${cat}`);
    return (d.jobs || []).map((j) => ({ id: `rm:${j.id}`, source: "remotive", company: j.company_name || "", title: j.title || "", location: "Remote - " + (j.candidate_required_location || ""), url: j.url || "", desc: stripHtml(j.description || "") }));
  },
  // The Muse: all industries (consulting, public sector, nonprofits, product, data); arg is "location|category", 3 pages of 20
  async muse(arg) {
    const [loc, cat] = arg.split("|"), out = [];
    for (let p = 1; p <= 3; p++) {
      const d = await getJson(`https://www.themuse.com/api/public/jobs?page=${p}&location=${encodeURIComponent(loc)}${cat ? "&category=" + encodeURIComponent(cat) : ""}`);
      for (const j of d.results || []) out.push({ id: `mu:${j.id}`, source: "muse", company: (j.company && j.company.name) || "", title: j.name || "", location: (j.locations || []).map((l) => l.name).join(" | "), url: (j.refs && j.refs.landing_page) || "", desc: stripHtml(j.contents || "") });
      if (p >= (d.page_count || 1)) break;
    }
    return out;
  },
  // Jobicy: remote roles by region
  async jobicy(geo) {
    const d = await getJson(geo.startsWith("tag:") ? `https://jobicy.com/api/v2/remote-jobs?count=100&tag=${encodeURIComponent(geo.slice(4))}` : `https://jobicy.com/api/v2/remote-jobs?count=100&geo=${geo}`);
    return (d.jobs || []).map((j) => ({ id: `jb:${j.id}`, source: "jobicy", company: j.companyName || "", title: j.jobTitle || "", location: "Remote - " + (Array.isArray(j.jobGeo) ? j.jobGeo.join(", ") : j.jobGeo || ""), url: j.url || "", desc: stripHtml(j.jobDescription || j.jobExcerpt || "") }));
  },
  // JOBSEARCH-CV-1 wider net: Recruitee company boards, RemoteOK, Himalayas, and the monthly Hacker News "Who is hiring" thread. Every fetcher tolerates an unexpected answer shape (returns nothing).
  async recruitee(slug) {
    const d = await getJson(`https://${slug}.recruitee.com/api/offers/`);
    return (Array.isArray(d.offers) ? d.offers : []).map((j) => ({ id: `rc:${slug}:${j.id}`, source: "recruitee", company: slug, title: j.title || "", location: [j.city, j.country].filter(Boolean).join(", ") + (j.remote ? " (Remote)" : ""), url: j.careers_url || "", desc: stripHtml((j.description || "") + " " + (j.requirements || "")) }));
  },
  // RemoteOK terms: link back to the listing and name RemoteOK as the source; every match keeps the RemoteOK url and shows "via RemoteOK".
  async remoteok() {
    const d = await getJson("https://remoteok.com/api");
    return (Array.isArray(d) ? d.slice(1) : []).filter((j) => j && j.position).map((j) => ({ id: `rok:${j.id}`, source: "remoteok", company: j.company || "", title: j.position || "", location: "Remote - " + (j.location || "Worldwide"), url: j.url || (j.slug ? "https://remoteok.com/remote-jobs/" + j.slug : ""), desc: stripHtml(j.description || "") }));
  },
  async himalayas(pages) {
    const out = [];
    let cursor = "";
    for (let p = 0; p < pages; p++) {
      const d = await getJson("https://himalayas.app/jobs/api?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
      for (const j of Array.isArray(d.jobs) ? d.jobs : []) out.push({ id: `him:${(j.guid || j.applicationLink || j.title || "").split("/").slice(-2).join("-").slice(0, 80)}`, source: "himalayas", company: j.companyName || "", title: j.title || "", location: "Remote - " + ((j.locationRestrictions || []).join(", ") || "Worldwide"), url: j.guid || j.applicationLink || "", desc: stripHtml(j.description || j.excerpt || "") });
      cursor = d.nextCursor || "";
      if (!cursor) break;
    }
    return out;
  },
  async hn() {
    const st = await getJson("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=6");
    const story = (st.hits || []).find((h) => /who is hiring/i.test(h.title || "") && !/freelancer|wants to be hired/i.test(h.title || ""));
    if (!story) return [];
    const d = await getJson(`https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&hitsPerPage=1000`);
    const ROLE = /(manager|engineer|scientist|researcher|analyst|director|lead|head|product|policy|physicist|economist|statistician|developer|designer|architect|fellow)/i;
    const out = [];
    for (const c of d.hits || []) {
      if (String(c.parent_id) !== String(story.objectID) || !c.comment_text) continue;
      const text = stripHtml(c.comment_text), head = (text.split("\n")[0] || "").split("|").map((x) => x.trim()).filter(Boolean);
      if (head.length < 3) continue;
      const title = head.slice(1, 4).find((x) => ROLE.test(x)) || head[1];
      out.push({ id: `hn:${c.objectID}`, source: "hn", company: head[0].slice(0, 80), title: title.slice(0, 140), location: head.filter((x, i) => i > 0 && x !== title).join(" | ").slice(0, 160), url: `https://news.ycombinator.com/item?id=${c.objectID}`, desc: text });
    }
    return out;
  },
  async arbeitnow() {
    const out = [];
    for (let p = 1; p <= 3; p++) {
      const d = await getJson(`https://www.arbeitnow.com/api/job-board-api?page=${p}`);
      for (const j of d.data || []) out.push({ id: `an:${j.slug}`, source: "arbeitnow", company: j.company_name || "", title: j.title || "", location: (j.location || "") + (j.remote ? " (Remote)" : ""), url: j.url || "", desc: stripHtml(j.description || "") });
    }
    return out;
  },
  // JOBSEARCH-SOURCES-1 (JS-7): SmartRecruiters company boards (public API, intended for syndication). The list holds no text, so a posting whose title
  // could be in the owner's lane gets one detail request (at most 40 a run); the others are listed by title and location and the gates drop them.
  async smartrecruiters(id) {
    const list = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings?limit=100`);
    const out = [];
    let detailed = 0;
    for (const p of Array.isArray(list.content) ? list.content : []) {
      const loc = p.location || {};
      const job = { id: `sr:${id}:${p.id}`, source: "smartrecruiters", company: (p.company && p.company.name) || id, title: p.name || "", location: [loc.city, loc.country && String(loc.country).toUpperCase()].filter(Boolean).join(", ") + (loc.remote ? " (Remote)" : ""), url: `https://jobs.smartrecruiters.com/${encodeURIComponent(id)}/${p.id}`, desc: "" };
      if (detailed < 40 && titleCandidate(job.title)) {
        detailed++;
        try {
          const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings/${p.id}`);
          const secs = (d.jobAd && d.jobAd.sections) || {};
          job.desc = stripHtml(["companyDescription", "jobDescription", "qualifications", "additionalInformation"].map((k) => (secs[k] && secs[k].text) || "").join("\n"));
          if (d.postingUrl) job.url = d.postingUrl;
        } catch (e) { logErr("smartrecruiters-detail", e); }
      }
      out.push(job);
    }
    return out;
  },
  // JOBSEARCH-NL-PUBLIC-SECTOR-1 (JS-11, issue #1000643): the work the owner knows best (policy, transport and planning, public-sector research) is posted on
  // Dutch government, university and EU research sites that publish no RSS or API. Terms were read first (robots.txt fetched 2026-11-05, recorded in PUBLIC_SECTOR below).
  async publicsector(arg) {
    const s = PUBLIC_SECTOR[arg];
    if (!s) return [];
    return s.sitemap ? publicSectorSitemap(arg, s) : publicSectorListing(arg, s);
  },
};

// A title that could be in the owner's lane: no hard-noise word, and a role family or a generic management title. Used to spend detail requests only where they can pay off.
function titleCandidate(title) {
  const t = String(title || "").toLowerCase();
  if (ABSOLUTE_EXCLUDE.some((x) => t.includes(x) && !ENGINEERING_WORDS.includes(x))) return false;
  return has(t, TITLE_MEDIUM).length > 0 || Object.values(FAMILIES).some((kws) => has(t, kws).length > 0);
}
const familyTitle = (title) => { const t = String(title || "").toLowerCase(); return Object.values(FAMILIES).some((kws) => has(t, kws).length > 0); };
// The answer to lever (1) of the issue, per site: what robots.txt and the terms allow, and how this reader behaves.
//  werkenvoornederland.nl  robots: allow all except /login, Request-rate 10/1, publishes sitemap-vacatures.xml (about 1,300 open vacancies of Dutch ministries and agencies) ->
//                          read the sitemap (1 request), then at most 30 posting pages an hour, one a second, each through its schema.org JobPosting JSON-LD.
//  academictransfer.com    robots: User-agent * allow, Crawl-delay 10; AI training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot) are disallowed, and this is not one: it is one
//                          person's job lookup that never trains a model -> the sitemap only (1 request an hour), titles from the URL, no posting pages (they would take 10 s each).
//  euraxess.ec.europa.eu   robots: no URLs with a query string and no api paths, so only the plain listing page /jobs/search, one request an hour.
//  jobs.ac.uk              robots allow reading, but the postings are UK on-site; not read.
//  LinkedIn and Indeed are never read (LinkedIn User Agreement 8.2).
const PUBLIC_SECTOR = {
  werkenvoornederland: { sitemap: "https://www.werkenvoornederland.nl/sitemap-vacatures.xml", base: "https://www.werkenvoornederland.nl", company: "Rijksoverheid (Werken voor Nederland)", detail: 30, delayMs: 1000, titleFrom: "wvn" },
  academictransfer: { sitemap: "https://www.academictransfer.com/sitemap-vacancies.xml", base: "https://www.academictransfer.com", company: "Academic Transfer (Dutch universities)", detail: 0, delayMs: 10000, titleFrom: "at", max: 150 },
  euraxess: { url: "https://euraxess.ec.europa.eu/jobs/search", base: "https://euraxess.ec.europa.eu", company: "EURAXESS (EU research careers)", location: "EU" },
};
function sitemapUrls(xml) {
  const out = [];
  for (const m of String(xml || "").matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const loc = (/<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(m[1]) || [])[1];
    if (loc) out.push({ loc: decodeEntities(loc), lastmod: (/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(m[1]) || [])[1] || "" });
  }
  return out;
}
// the vacancy title as the URL slug writes it: ".../vacatures/projectleider-effectief-toezicht-NVWA-2026-4529" -> "projectleider effectief toezicht"
function slugTitle(loc, from) {
  let last = String(loc || "").replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() || "";
  try { last = decodeURIComponent(last); } catch (e) { logErr("publicsector-slug", e); }
  if (from === "wvn") last = last.replace(/-[A-Za-z0-9]{2,12}-\d{4}-\d+$/, "");
  return last.replace(/-+/g, " ").replace(/\s+/g, " ").trim();
}
async function publicSectorSitemap(arg, s) {
  const urls = sitemapUrls(await getText(s.sitemap));
  if (!urls.length) throw new Error("the sitemap listed no vacancies");
  const cands = [];
  for (const u of urls) {
    if (!u.loc.startsWith(s.base)) continue;
    const title = slugTitle(u.loc, s.titleFrom);
    if (!title || !titleCandidate(title)) continue;
    cands.push({ ...u, title, fam: familyTitle(title) });
  }
  cands.sort((a, b) => (b.fam - a.fam) || String(b.lastmod).localeCompare(String(a.lastmod)));
  const picked = cands.slice(0, s.detail || s.max || 100);
  const out = [];
  let failed = 0;
  for (const c of picked) {
    const job = { id: `ps:${arg}:${(await sha256hex(c.loc)).slice(0, 16)}`, source: "publicsector", company: s.company, title: c.title, location: "Netherlands", url: c.loc, desc: "" };
    if (s.detail) {
      await new Promise((r) => setTimeout(r, s.delayMs));
      try {
        const ld = jsonLdPosting(await getHtml(c.loc));
        if (ld) {
          if (ld.title) job.title = ld.title;
          if (ld.company && ld.company.trim()) job.company = ld.company.trim();
          if (ld.location) job.location = ld.location;
          job.desc = ld.desc || "";
        } else failed++;
      } catch (e) { failed++; logErr("publicsector-posting", e); }
    }
    out.push(job);
  }
  if (s.detail && picked.length >= 5 && failed === picked.length) throw new Error(`no posting page of ${picked.length} could be read`);
  return out;
}
// A plain listing page: each posting is an <a> whose href carries the job path; anchors with a job-like href and a title-like text are kept.
async function publicSectorListing(arg, s) {
  const html = await getHtml(s.url);
  const out = [], seen = new Set();
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = decodeEntities(m[1]);
    const text = stripHtml(m[2]);
    if (!/\/(vacature|vacatures|job|jobs|vacancy|vacancies|position)\b/i.test(href)) continue;
    if (!/^https?:/.test(href)) href = s.base + (href.startsWith("/") ? href : "/" + href);
    if (!href.startsWith(s.base)) continue;
    if (text.length < 5 || text.length > 200) continue;
    const key = (s.company + "|" + text).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `ps:${arg}:${(await sha256hex(href)).slice(0, 16)}`, source: "publicsector", company: s.company, title: text, location: s.location || "Netherlands", url: href, desc: "" });
  }
  return out;
}
async function getText(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(url, { headers: { "user-agent": "qnfo-jobsearch/1.0 (+https://qnfo.org; contact via https://qnfo.org)", "accept": "application/xml,text/xml;q=0.9,text/html;q=0.8" }, signal: ac.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

// ------------------------------------------------------------------ matching (port of match.py)
// ------------------------------------------------------------------ search profile (JOBSEARCH-PROFILE-1)
// The owner answers yes/no questions (survey); answers and the likes and dislikes he gives drive the gates, so the search is his, not a fixed AI-lab filter.
// [id, group, question, default]; default null = unanswered (no effect beyond a small ranking nudge)
const SURVEY = [
  ["loc_nl", "Where", "Roles in Amsterdam or elsewhere in the Netherlands (on-site or hybrid)?", true],
  ["loc_remote", "Where", "Fully remote roles open to Europe or worldwide?", true],
  ["loc_eu", "Where", "Roles on-site in another EU country or the UK (you would move)?", false],
  ["loc_us", "Where", "Roles on-site in the United States (you would move)?", false],
  ["loc_world", "Where", "Roles on-site anywhere else in the world (you would move)?", false],
  ["fam_policy", "Work", "Public policy research and advisory (policy analyst, advisor, officer, head of policy)?", true],
  ["fam_transport", "Work", "Transport, mobility, urban and regional planning?", true],
  ["fam_data", "Work", "Data science and analytics leadership (head of data, analytics manager, lead data scientist)?", true],
  ["fam_product", "Work", "Product management, especially data and platform products?", true],
  ["fam_program", "Work", "Program, project and portfolio management (you hold the PMP)?", true],
  ["fam_research", "Work", "Research management: research director, grants, research operations, senior researcher?", true],
  ["fam_consult", "Work", "Consulting and advisory (consultant, principal, engagement manager)?", true],
  ["fam_nonprofit", "Work", "Nonprofit, foundation and NGO leadership (executive director, program director)?", true],
  ["fam_gis", "Work", "GIS and geospatial analysis?", true],
  ["fam_contract", "Work", "Contracts and procurement oversight (you were a certified contracting officer representative)?", true],
  ["fam_social", "Work", "Housing, ageing, community and social policy?", true],
  ["fam_climate", "Work", "Sustainability, climate and energy-transition roles?", null],
  ["fam_autonomy", "Work", "Autonomous and AI systems research: agentic systems, AI evaluation and assurance, AI oversight and socio-technical systems research?", true],   // JOBSEARCH-AUTONOMY-1 (owner direction 2026-11-09): the lead target
  ["fam_ai", "Work", "AI and machine-learning product, governance, safety and research-integrity roles?", true],
  ["fam_strategy", "Work", "Founder-in-residence, AI strategy and product strategy roles for autonomous systems (roles that hire for systems thinking, not coding)?", true],   // JOBSEARCH-ULTRASTABLE-1 (owner, 2026-11-10): "I'm a thinker. I'm a systems person"
  ["fam_sysmodel", "Work", "Systems modelling, simulation and decision-science roles (network models, travel-demand models, digital twins, operations research)?", true],   // JOBSEARCH-FIT-1
  ["fam_quantum", "Work", "Quantum computing roles?", false],   // JOBSEARCH-AUTONOMY-1: quantum is no longer a target (owner, 2026-11-09); a yes brings it back
  ["fam_edu", "Work", "Teaching, training and academic roles?", null],
  ["fam_science", "Work", "Research scientist, quantitative and applied-science roles (statistics, modelling, physics)?", true],
  ["fam_tech", "Work", "Hands-on coding roles (research engineer, ML or AI engineer, data engineer, member of technical staff)?", false],   // JOBSEARCH-FIT-1 (owner, 2026-11-09): a systems researcher, not a coder; these roles were the rejections
  ["lvl_manage", "Level", "Roles that manage people?", null],
  ["lvl_mid", "Level", "Roles below senior level (no senior, lead, head, principal or director in the title)?", null],
  ["type_contract", "Contract", "Contract, freelance or interim engagements?", true],
];
const SURVEY_IDS = new Set(SURVEY.map((q) => q[0]));
// role families: title terms (a hit means the title is in your lane) and the survey question that switches the family on or off
const FAMILIES = {
  fam_policy: ["policy analyst", "policy advisor", "policy adviser", "policy officer", "policy manager", "policy lead", "head of policy", "director of policy", "public policy", "policy researcher", "senior policy", "policy and research", "science policy", "policy specialist", "policy director",
    "beleidsadviseur", "beleidsmedewerker", "beleidsonderzoeker", "beleidsmanager", "beleidsstrateeg", "beleidscoordinator", "adviseur beleid", "hoofd beleid", "strategisch adviseur"],   // JOBSEARCH-NL-PUBLIC-SECTOR-1: the Dutch titles of the same work
  fam_transport: ["transport", "mobility", "urban planner", "urban planning", "regional planning", "spatial planning", "transport planner", "city planner", "land use", "transport model", "smart city", "traffic", "infrastructure planning", "urban development",
    "verkeerskundige", "verkeersmodelleur", "vervoerplanner", "mobiliteitsadviseur", "mobiliteitsmanager", "adviseur mobiliteit", "verkeer en vervoer", "stedenbouwkundige", "ruimtelijk planner", "ruimtelijke ordening", "gebiedsontwikkeling"],
  fam_data: ["data scientist", "head of data", "director of data", "analytics manager", "analytics lead", "director of analytics", "head of analytics", "head of insights", "data science manager", "chief data", "data strategy", "insights manager", "data analytics manager", "lead data", "principal data", "data product", "data lead",
    "datascientist", "data-analist", "data analist", "data-adviseur", "data adviseur", "datamanager", "hoofd data"],
  fam_product: ["product manager", "product owner", "head of product", "group product", "product lead", "director of product", "principal product", "product management"],
  fam_program: ["program manager", "programme manager", "project manager", "portfolio manager", "pmo", "delivery manager", "head of programs", "head of programmes", "director of programs", "programme director", "program director", "program lead", "programme lead",
    "programmamanager", "programmaleider", "programmadirecteur", "portfoliomanager", "projectmanager", "projectleider"],
  fam_research: ["research manager", "research director", "research program", "research programme", "head of research", "director of research", "research operations", "research lead", "grants manager", "research coordinator", "research partnerships", "research strategy", "senior researcher", "principal researcher", "research advisor", "research adviser", "research fellow", "evaluation manager", "monitoring and evaluation", "research program manager", "research programme manager", "research portfolio", "ai research manager", "head of ai research", "ai research lead", "research partnerships lead",
    "onderzoeker", "onderzoeksleider", "onderzoeksmanager", "onderzoeksadviseur", "hoofd onderzoek", "wetenschappelijk onderzoeker"],
  fam_consult: ["consultant", "engagement manager", "advisory", "associate partner", "management consult*", "strategy consult*"],
  fam_nonprofit: ["executive director", "managing director", "country director", "chief of staff", "director of operations", "foundation"],
  fam_gis: ["gis", "geospatial", "geographic information", "spatial data", "spatial analyst", "geo-informatie", "geo informatie"],
  fam_contract: ["contracting officer", "contract manager", "contracts manager", "procurement manager", "vendor manager", "sourcing manager"],
  fam_social: ["housing", "social policy", "community development", "ageing", "aging", "livability", "affordable"],
  fam_climate: ["sustainability", "climate", "energy transition", "esg", "net zero", "decarbon"],
  fam_ai: ["ai governance", "ai policy", "applied ai", "ai product", "ml product", "responsible ai", "ai safety", "trust and safety", "ai evaluation", "ai ethics", "ai strategy", "ai program", "ai programme", "research integrity", "scientific integrity", "open science",
    "ai risk", "model risk", "operational risk", "ai assurance", "ai audit", "algorithmic audit", "ai standards", "ai regulation", "ai act", "ai compliance", "ai policy researcher", "technology policy", "tech policy", "digital policy"],   // JOBSEARCH-FIT-1 (2026-11-09): AI governance, policy, risk and assurance titles
  fam_autonomy: ["autonomous systems", "autonomous system", "autonomy", "agentic", "multi-agent", "ai systems", "systems research", "systems researcher", "ai research", "ai assurance", "ai evaluation", "model evaluation", "evaluations",
    "ai oversight", "agent governance", "agent oversight", "agentops", "ai operations", "human oversight", "socio-technical", "sociotechnical", "complex systems", "ai safety", "alignment", "red team", "red teaming", "frontier risk", "safety research", "evals lead", "evaluation lead", "evaluation scientist"],
  // JOBSEARCH-FIT-1: systems modelling and decision science, the owner's 20-year thread (network models, FHWA tour-based model, simulation) as a role family of its own
  fam_sysmodel: ["simulation", "network model*", "network modelling", "network modeling", "systems model*", "systems analyst", "systems analysis", "decision science", "decision scientist", "decision analyst", "decision support", "operations research",
    "transport model*", "transportation model*", "travel demand", "digital twin", "system dynamics", "modelling lead", "modeling lead", "agent-based", "verkeersmodel*", "modelleur"],
  // JOBSEARCH-ULTRASTABLE-1 (2026-11-10): roles that value high-level systems design and direction; the founder and director of Ultrastable is in this lane
  fam_strategy: ["founder in residence", "founder-in-residence", "entrepreneur in residence", "entrepreneur-in-residence", "venture builder", "venture partner", "chief ai officer", "head of ai", "director of ai", "vp of ai", "ai strategy", "ai transformation",
    "head of automation", "automation strategy", "product strategy", "head of strategy", "strategy lead", "strategy director", "chief of staff", "head of innovation", "innovation lead", "ai adoption", "platform strategy", "operating model", "head of platform"],
  fam_quantum: ["quantum"],
  fam_edu: ["lecturer", "professor", "teaching fellow", "instructor", "trainer", "education manager", "learning manager", "curriculum"],
  fam_science: ["research scientist", "applied scientist", "quantitative researcher", "quantitative analyst", "physicist", "economist", "statistician", "computational scientist", "research associate", "postdoctoral", "principal investigator", "data scientist", "scientist"],
  fam_tech: ["research engineer", "machine learning engineer", "ml engineer", "ai engineer", "data engineer", "analytics engineer", "applied ai engineer", "software engineer, research", "research software engineer"],
};
const CLUSTER_KW = {
  research_mgmt: ["research program", "research portfolio", "research operations", "research management", "program management", "research strategy", "head of research", "research lead", "grant", "wetenschappelijk", "onderzoek"],
  federal: ["federal government", "federal agenc*", "government agenc*", "public sector", "public administration", "government", "ministry", "municipal", "european commission", "rijksoverheid", "ministerie", "gemeente", "provincie", "waterschap", "overheid"],
  transport_modeling: ["transportation", "travel demand", "mobility", "transit", "forecasting", "traffic", "infrastructure", "mobiliteit", "verkeersmodel", "vervoersmodel", "verkeer en vervoer"],
  urban_planning: ["urban planning", "regional planning", "land use", "spatial planning", "urban development", "city planning", "smart city", "ruimtelijke ordening", "ruimtelijke planning", "stedelijke ontwikkeling", "gebiedsontwikkeling"],
  gis: ["gis", "geospatial", "arcgis", "qgis", "spatial analysis", "geographic information", "geo-informatie", "geografische informatie"],
  policy_research: ["public policy", "policy research", "survey", "social science", "evidence-based", "policy analysis", "stakeholder", "beleidsonderzoek", "beleidsevaluatie", "beleidsanalyse", "beleidsadvies"],
  social_policy: ["housing", "affordab*", "ageing", "aging", "older adults", "livability", "community development", "social policy", "volkshuisvesting", "woningmarkt", "ouderenbeleid", "leefbaarheid"],
  survey_methods: ["statistical", "econometric", "survey methodology", "statistics", "modelling", "modeling", "quantitative"],
  ai_systems: ["llm", "large language model", "ai agent", "agentic", "generative ai", "applied ai", "machine learning", "ai evaluation", "evals", "rag "],
  research_integrity: ["research integrity", "reproducib*", "peer review", "scientific integrity", "open science", "provenance", "responsible ai", "ai governance", "ai safety", "audit", "trustworthy"],
  data_product: ["data product", "data platform", "analytics", "dashboard", "data strategy", "data governance"],
  autonomous_systems: ["autonomous system*", "autonomy", "agentic", "multi-agent", "multi agent", "ai agent*", "agent-based", "ai safety", "alignment", "ai assurance", "oversight", "failure mode*", "socio-technical", "sociotechnical"],
  platform_strategy: ["founder", "0 to 1", "zero to one", "0-to-1", "platform strategy", "product strategy", "ai strategy", "ai transformation", "ai adoption", "operating model", "systems thinking", "coding agents", "ai coding", "developer productivity",
    "autonomous development", "self-governing", "agent orchestration", "agentops", "ai operations", "governance of agents", "agent oversight", "venture",
    "agent platform", "agent governance", "governance framework", "operating doctrine", "human oversight", "human-in-the-loop", "red team*", "evaluation design", "verification", "ai risk", "nist ai rmf", "eu ai act", "iso/iec 42001", "iso 42001"],   // JOBSEARCH-SKILLS-1   // JOBSEARCH-ULTRASTABLE-1
  systems_modeling: ["systems modeling", "systems modelling", "system dynamics", "complex systems", "network model*", "network analysis", "simulation model*", "decision support", "operations research", "systems thinking"],
  quantum_energy: ["quantum", "energy efficiency", "benchmark"],
  nonprofit: ["nonprofit", "non-profit", "civil society", "ngo", "foundation", "philanthrop*"],
  product: ["product manager", "product management", "roadmap", "product strategy", "stakeholder"],
  data_science: ["data science", "data scientist", "machine learning", "predictive"],
  program_mgmt: ["program management", "programme management", "project management", "portfolio", "pmo", "delivery", "milestone", "budget"],
  contracting: ["contracting officer", "procurement", "vendor management", "contract management", "deliverables", "tender"],
  consulting: ["consulting", "advisory", "client engagement", "clients"],
  climate: ["sustainab*", "climate", "energy transition", "net zero", "decarbon*"],
  software: ["python", "javascript", "typescript", "software engineering", "serverless", "distributed systems", "cloud infrastructure"],
  physics_theory: ["theoretical physics", "quantum field theory", "renormali*", "effective field theory", "statistical mechanics", "perturbation theory", "path integral", "condensed matter", "particle physics", "high energy physics"],
  high_dim_stats: ["high-dimensional", "high dimensional", "regulari*", "lasso", "dimensionality reduction", "shrinkage", "penali*"],
  numerics: ["numerical", "simulation", "monte carlo", "optimization", "scientific computing", "linear algebra", "differential equations"],
  teaching: ["teaching", "lecturer", "instructor", "curriculum", "tutor"],
  writing: ["technical writing", "peer-reviewed", "scientific writing", "publications", "report writing"],
};
const TITLE_MEDIUM = ["product manager", "program manager", "programme manager", "principal", "director", "head of", "lead", "strategist", "manager", "analyst", "advisor", "adviser", "consultant", "researcher", "specialist", "policy", "research"];
const SENIOR_RE = /\b(senior|sr\.?|lead|head|director|principal|chief|vp|vice president|staff|manager|partner|executive)\b/i;
const MANAGE_RE = /\b(head of|director|manager|lead|chief|vp|vice president)\b/i;
// hard noise: never your lane, whatever else the title says
const ABSOLUTE_EXCLUDE = ["intern", "junior", "entry", "graduate", "new grad", "apprentice", "trainee", "engineer", "architect", "counsel", "attorney", "lawyer", "paralegal", "legal", "marketing", "forward deployed", "deployment strategist",
  "sales", "account executive", "account manager", "business development", "recruit", "talent", "payroll", "accountant", "accounting", "treasury", "fp&a", "tax ", "facilities", "warehouse", "driver", "nurse", "technician",
  "customer success", "customer support", "customer service", "support specialist", "financial", "webinar", "solutions", "devops", "site reliability", "designer", "finance", "people partner", "hr ", "receptionist", "assistant",
  "stagiair", "stageplaats", "afstudeer", "assistent", "administratief", "secretaresse", "verpleegkundige", "chauffeur", "jurist", "juridisch", "advocaat", "controller", "salaris", "monteur", "schoonmaak", "beveiliger", "handhaver", "toezichthouder", "rechercheur", "boa ", "verpleegkundig", "stage "];   // the Dutch forms of the same noise (JOBSEARCH-NL-PUBLIC-SECTOR-1)
const TITLE_EXCLUDE_SOFT = [];   // JOBSEARCH-CONTENT-FIRST-1 (owner 2026-11-09): no title word excludes a field any more
// seniority words in a title are a level, not a field, and stay a hard filter; every other ABSOLUTE_EXCLUDE word now only matters when the posting text shows nothing of the record
const LEVEL_EXCLUDE = new Set(["intern", "junior", "entry", "graduate", "new grad", "apprentice", "trainee", "stagiair", "stageplaats", "afstudeer", "stage "]);
const CONTENT_MIN = 6;   // distinctive terms a posting must share with the record when its title says nothing
const ENGINEERING_WORDS = ["engineer", "architect"];   // excluded unless the title is a research-engineering title and the posting shows evidence of the owner record
const LOC_BAD_REMOTE = ["us only", "united states only", "us-only", "usa only", "canada only", "uk only", "india only", "latam", "apac only"];
const HOME = ["amsterdam", "netherlands", "nederland", "rotterdam", "utrecht", "eindhoven", "the hague", "den haag", "delft", "leiden", "groningen", "haarlem", "almere", "amersfoort",
  "maastricht", "zwolle", "arnhem", "nijmegen", "tilburg", "apeldoorn", "enschede", "zoetermeer", "dordrecht", "leeuwarden", "alkmaar", "deventer", "hilversum", "amstelveen", "lelystad", "heerlen", "roermond", "hoofddorp", "nieuwegein", "zaandam", "zaanstad", "schiedam", "wageningen", "veenendaal", "hengelo", "almelo", "middelburg", "vlissingen", "rijswijk", "zeist", "bilthoven", "venlo", "helmond", "hertogenbosch", "den bosch", "noord-holland", "zuid-holland", "flevoland", "gelderland", "overijssel", "drenthe", "friesland"];   // JOBSEARCH-NL-PUBLIC-SECTOR-1: Dutch government postings name any municipality; names under six letters stay out because the test is a substring (ede is in sweden)
const REGION_WIDE = ["europe", "emea", "european", "eu ", "eu-", "worldwide", "anywhere", "global"];
const EUROPE_OTHER = ["germany", "berlin", "munich", "france", "paris", "london", "uk", "united kingdom", "ireland", "dublin", "spain", "madrid", "barcelona", "portugal", "lisbon", "italy", "belgium", "brussels", "denmark", "copenhagen", "sweden", "stockholm", "norway", "oslo", "finland", "helsinki", "austria", "vienna", "switzerland", "zurich", "poland", "warsaw", "czech", "prague", "luxembourg", "estonia", "latvia", "lithuania", "hungary", "romania", "greece", "croatia", "slovenia", "slovakia", "bulgaria", "malta", "cyprus"];
const US_RE = /\b(us|usa|united states|san francisco|new york|seattle|washington|boston|austin|chicago|los angeles|palo alto|mountain view|menlo park|sf|nyc|dc)\b|, (ca|ny|wa|ma|tx|il|dc)\b/;
const CORE = new Set(["federal", "policy_research", "transport_modeling", "research_mgmt", "urban_planning", "social_policy", "contracting"]);
const FRONTIER = new Set(["ai_systems", "research_integrity", "autonomous_systems", "platform_strategy"]);
const DATA_SIDE = new Set(["data_product", "data_science", "survey_methods", "ai_systems", "gis", "systems_modeling"]);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EUROPE_OTHER_RE = EUROPE_OTHER.map((k) => new RegExp("\\b" + escRe(k) + "\\b"));
// Keywords match whole words; a trailing * allows an intentional stem to continue to the word end.
const KW_RE = new Map();
const kwRe = (k) => { let r = KW_RE.get(k); if (!r) { const stem = k.endsWith("*"); const term = stem ? k.slice(0, -1) : k; r = new RegExp("(?<![a-z])" + escRe(term) + (stem ? "[a-z]*" : "(?![a-z])")); KW_RE.set(k, r); } return r; };
const has = (text, kws) => kws.filter((k) => kwRe(k).test(text));
const STOP_TOKENS = new Set(["senior", "lead", "head", "manager", "director", "principal", "global", "europe", "remote", "team", "and", "for", "the", "with", "staff", "group", "associate"]);
const tokens = (title) => [...new Set(String(title || "").toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 4 && !STOP_TOKENS.has(t)))];

// ctx = what the owner told us. answers: {id: true|false|null}; learned: {boost:Set, block:Set} from likes and dislikes of real postings
const COMPANY_SUFFIX = /(^|\s)(b\.?v\.?|n\.?v\.?|inc\.?|ltd\.?|llc|gmbh|plc|s\.?a\.?|co\.?)(?=$|\s)/g;
const OPT_IN_FAMILIES = new Set(["fam_edu", "fam_tech"]);   // JOBSEARCH-FIT-1: coding roles need an explicit yes
const coKey = (c) => String(c || "").toLowerCase().replace(COMPANY_SUFFIX, " ").replace(/[^a-z0-9]+/g, "");
function makeCtx(answers, feedback, outcomeWeights = {}, owned = null) {
  const a = {};
  for (const [id, , , def] of SURVEY) a[id] = answers && Object.prototype.hasOwnProperty.call(answers, id) && answers[id] !== undefined ? answers[id] : def;
  const fam = new Set(Object.keys(FAMILIES).filter((k) => a[k] !== false && !(OPT_IN_FAMILIES.has(k) && a[k] !== true)));   // teaching and academic titles need a yes: an unanswered question must not surface every lectureship
  const like = {}, dis = {};
  const co = {};
  // what a rejection teaches depends on why: "field" counts double for the title words, "level", "location" and "applied" teach nothing about the words, "company" blocks the employer at once
  for (const f of feedback || []) {
    const teachesWords = !["level", "location", "applied"].includes(f.reason), w = f.reason === "field" || f.reason === "coding" ? 2 : 1;
    if (teachesWords) for (const t of tokens(f.title)) { const m = f.verdict === "like" ? like : dis; m[t] = (m[t] || 0) + w; }
    const k = coKey(f.company);
    if (k) { const o = co[k] || (co[k] = { like: 0, dis: 0 }); if (f.verdict === "like") o.like++; else if (f.reason !== "applied") o.dis += f.reason === "company" ? 3 : 1; }
  }
  const boost = new Set(Object.keys(like).filter((t) => !dis[t])), block = new Set(Object.keys(dis).filter((t) => dis[t] >= 2 && !like[t]));
  const coKeys = Object.keys(co);
  const coPen = new Set(coKeys.filter((k) => co[k].dis >= 2 && !co[k].like)), coDrop = new Set(coKeys.filter((k) => co[k].dis >= 4 && !co[k].like)), coBoost = new Set(coKeys.filter((k) => co[k].like >= 1 && !co[k].dis));
  return { a, fam, learned: { boost, block, coPen, coDrop, coBoost }, outcomeWeights, owned };
}
const DEFAULT_CTX = makeCtx({}, []);   // owned = null: every cluster counts as evidence (the unit tests and the unauthenticated paths)

function clustersIn(desc, title) {
  const t = desc.toLowerCase(), ti = (title || "").toLowerCase();
  const out = new Set();
  for (const [c, kws] of Object.entries(CLUSTER_KW)) if (has(t, kws).length >= 2 || has(ti, kws).length) out.add(c);
  return out;
}
const OUTCOME_FEATURES = new Set([
  ...Object.keys(FAMILIES).map((family) => `family:${family.replace(/^fam_/, "")}`),
  ...Object.keys(CLUSTER_KW).map((cluster) => `cluster:${cluster}`),
]);
function scoreFeatures(families, clusters) {
  return [...new Set([
    ...[...families].map((family) => `family:${family.replace(/^fam_/, "")}`),
    ...[...clusters].map((cluster) => `cluster:${cluster}`),
  ])].filter((feature) => OUTCOME_FEATURES.has(feature));
}
function featuresFromWhy(why) {
  const features = new Set();
  for (const line of Array.isArray(why) ? why : []) {
    let m = /^title in your lane: (.+)$/.exec(line);
    if (m) for (const family of m[1].split(",")) features.add(`family:${family.trim()}`);
    m = /^evidence in the posting: (.+)$/.exec(line);
    if (m) for (const cluster of m[1].split(",")) features.add(`cluster:${cluster.trim()}`);
  }
  return [...features].filter((feature) => OUTCOME_FEATURES.has(feature));
}
function applicationSnapshot(match) {
  let why = [];
  try { why = JSON.parse(match.why_json || "[]"); } catch (e) { logErr("application-snapshot", e); }
  return JSON.stringify({ version: 1, tier: match.tier, score: Number(match.score), features: featuresFromWhy(why) });
}
function parseApplicationSnapshot(note) {
  try {
    const snapshot = JSON.parse(note || "");
    if (snapshot.version !== 1 || !["A", "B", "C"].includes(snapshot.tier) || !Number.isFinite(snapshot.score) || !Array.isArray(snapshot.features)) return null;
    return { tier: snapshot.tier, score: snapshot.score, features: snapshot.features.filter((feature) => OUTCOME_FEATURES.has(feature)) };
  } catch (e) { return null; }
}
function outcomeScoreWeights(rows, now = Date.now()) {
  const lower = now - 90 * 86400000, upper = now - NO_REPLY_DAYS * 86400000;
  const mature = rows.filter((row) => row.applied_ms >= lower && row.applied_ms <= upper && Array.isArray(row.features));
  if (mature.length < MIN_N) return {};
  const featureStats = new Map();
  let replies = 0;
  for (const row of mature) {
    if (row.replied) replies++;
    for (const feature of new Set(row.features.filter((key) => OUTCOME_FEATURES.has(key)))) {
      const stat = featureStats.get(feature) || { count: 0, replies: 0 };
      stat.count++;
      if (row.replied) stat.replies++;
      featureStats.set(feature, stat);
    }
  }
  const weights = {};
  for (const [feature, stat] of featureStats) {
    const without = mature.length - stat.count, withoutReplies = replies - stat.replies;
    if (stat.count < 2 || without < 2) continue;
    const withRate = (stat.replies + 1) / (stat.count + 2);
    const withoutRate = (withoutReplies + 1) / (without + 2);
    const support = Math.min(stat.count / (stat.count + 4), without / (without + 4));
    const weight = Math.max(-8, Math.min(8, Math.round((withRate - withoutRate) * 24 * support)));
    if (weight) weights[feature] = weight;
  }
  return weights;
}
function locationGate(loc, descHead, ctx = DEFAULT_CTX) {
  const l = (loc || "").toLowerCase() + " ";
  const a = ctx.a;
  if (!l.trim()) return ["check", "location missing"];
  if (LOC_BAD_REMOTE.some((b) => l.includes(b))) return ["fail", `location restricted: ${loc}`];
  const home = HOME.some((k) => l.includes(k)), remote = l.includes("remote");
  const otherEu = EUROPE_OTHER_RE.some((re) => re.test(l)) || /\b(serbia|ukraine|turkey|albania|bosnia|montenegro|macedonia|moldova|georgia|armenia)\b/.test(l);
  // a region word ("Europe", "EMEA") counts as open to Europe only when no other country or city is named, or when the role is remote
  const wide = REGION_WIDE.some((k) => l.includes(k)) && (remote || (!otherEu && !US_RE.test(l)));
  if (home) return a.loc_nl === false ? ["fail", `Netherlands not selected: ${loc}`] : ["ok", loc];
  if (wide) return a.loc_remote === false && remote ? ["fail", `remote not selected: ${loc}`] : ["ok", loc];
  if (otherEu)
    return a.loc_eu ? ["check", `Europe outside NL: you would move; employer-of-record or permit unverified (${loc})`] : ["fail", `Europe outside NL not selected: ${loc}`];
  if (l.replace(/[^a-z]/g, "") === "remote" || l.replace(/[^a-z]/g, "") === "remoteremote") {
    if (/(must|should) (be )?(located|based|reside) in the (u\.?s|united states|uk|canada)/.test((descHead || "").toLowerCase())) return ["fail", "remote but posting requires US/UK/CA residence"];
    return a.loc_remote === false ? ["fail", "remote not selected"] : ["check", "remote, region unspecified"];
  }
  if (US_RE.test(l)) {
    // remote inside the US is still a US job (time zone, payroll): it needs the US answer, not the Europe-remote one
    return a.loc_us ? ["check", `US on-site/hybrid: you would move from Amsterdam (${loc})`] : ["fail", `US on-site not selected: ${loc}`];
  }
  return a.loc_world ? ["check", `Elsewhere: you would move; authorized only in NL/US, visa needed (${loc})`] : ["fail", `outside NL, EU and US, not selected: ${loc}`];
}
// JOBSEARCH-LINKEDIN-1 (owner, 2026-11-09: "I don't even know what keywords I should be searching for on LinkedIn"). LinkedIn cannot be read by this worker
// (User Agreement 8.2), so the search hands the owner the exact searches instead: LinkedIn's boolean job search, filtered to senior and director level and the last
// week, in the places the owner chose; the same query on Google restricted to linkedin.com/jobs, and on Indeed. A posting found there is pasted into "Check a posting".
const LINKEDIN_SEARCHES = [
  { id: "ai_gov", label: "AI governance, policy and risk", why: "Your FHWA and AARP program leadership plus your AI audit method", q: '("AI governance" OR "AI policy" OR "responsible AI" OR "AI risk" OR "AI assurance") NOT (engineer OR developer)' },
  { id: "ai_eval", label: "AI evaluation and assurance research", why: "Your published audit method for autonomous AI systems", q: '("AI evaluation" OR "model evaluation" OR "AI audit" OR "evaluations lead" OR "red teaming") AND (research OR lead OR manager) NOT (engineer OR developer)' },
  { id: "autonomy", label: "Autonomous and agentic systems research", why: "QNFO: you run an autonomous research system in production", q: '("autonomous systems" OR "agentic" OR "multi-agent" OR "AI systems") AND (researcher OR "research lead" OR "research manager") NOT (engineer OR developer)' },
  { id: "sysmodel", label: "Systems modelling and simulation", why: "Network models at DVRPC and IBI; the FHWA Tour-Based Model System", q: '("systems modelling" OR "systems modeling" OR "simulation" OR "network modelling" OR "network modeling" OR "digital twin") AND (lead OR senior OR principal) NOT (engineer OR developer)' },
  { id: "mobility", label: "Transport and mobility AI", why: "20 years of transportation network modelling; co-directed the $10M NHTS", q: '(mobility OR transport OR transportation OR "travel demand") AND (AI OR modelling OR modeling OR analytics) AND (lead OR senior OR principal OR manager) NOT (engineer OR developer)' },
  { id: "strategy", label: "AI strategy and founder-in-residence", why: "You founded and direct Ultrastable, an autonomous development platform: systems design and direction, not coding", q: '("founder in residence" OR "entrepreneur in residence" OR "AI strategy" OR "head of AI" OR "AI transformation" OR "product strategy") NOT (engineer OR developer)' },
  { id: "decision", label: "Decision science", why: "AARP Livability Index: decision support built from 50+ data sources", q: '("decision science" OR "decision scientist" OR "decision support" OR "operations research") NOT (engineer OR developer)' },
  { id: "research_lead", label: "Research program and portfolio leadership", why: "You directed national research programs and contractor teams", q: '("research program manager" OR "research programme manager" OR "head of research" OR "research director" OR "research portfolio" OR "AI research manager")' },
  { id: "ai_policy_nl", label: "AI policy in Dutch government (in Dutch)", why: "Dutch ministries and regulators post AI governance roles on LinkedIn", q: '("AI" OR "algoritme" OR "algoritmes") AND (beleidsadviseur OR "strategisch adviseur" OR toezicht OR governance)' },
];
function linkedinSearches(ctx = DEFAULT_CTX) {
  const a = ctx.a, places = [];
  if (a.loc_nl !== false) places.push({ key: "nl", label: "Netherlands", li: "location=Netherlands", indeed: "https://nl.indeed.com/jobs?l=Nederland&fromage=7&q=", google: "Netherlands" });
  if (a.loc_remote !== false) places.push({ key: "remote", label: "Remote in Europe", li: "location=European%20Union&f_WT=2", indeed: "https://nl.indeed.com/jobs?l=Remote&fromage=7&q=", google: "remote Europe" });
  if (a.loc_eu) places.push({ key: "eu", label: "Europe", li: "location=European%20Union", indeed: "https://de.indeed.com/jobs?fromage=7&q=", google: "Europe" });
  if (a.loc_us) places.push({ key: "us", label: "United States", li: "location=United%20States", indeed: "https://www.indeed.com/jobs?fromage=7&q=", google: "United States" });
  if (!places.length) places.push({ key: "nl", label: "Netherlands", li: "location=Netherlands", indeed: "https://nl.indeed.com/jobs?l=Nederland&fromage=7&q=", google: "Netherlands" });
  const enc = encodeURIComponent;
  const plain = (q) => q.replace(/\s+NOT\s+\([^)]*\)/g, "").replace(/\bAND\b/g, " ").replace(/\s+/g, " ").trim();
  return {
    how: "Each search opens LinkedIn filtered to mid-senior and director roles posted in the last week. On LinkedIn, switch on Job alert at the top of the results so new roles come to you. Paste any posting you like into Check a posting below: the search scores it against your record and remembers it.",
    searches: LINKEDIN_SEARCHES.map((x) => ({
      ...x,
      links: places.map((pl) => ({
        place: pl.label,
        linkedin: `https://www.linkedin.com/jobs/search/?keywords=${enc(x.q)}&${pl.li}&f_E=4%2C5%2C6&f_TPR=r604800&sortBy=DD`,
        google: `https://www.google.com/search?q=${enc("site:linkedin.com/jobs/view " + plain(x.q) + " " + pl.google)}&tbs=qdr:w`,
        indeed: pl.indeed + enc(plain(x.q)),
      })),
    })),
  };
}
// score the posting against the profile. mode "analyze" never drops a posting: it reports the fit and what the gates would say
// JOBSEARCH-FIT-1 (owner, 2026-11-09: "I'm applying for jobs and get rejected because you're showing me shitty jobs"). The owner is a systems researcher who directs
// and evaluates systems, not a coder. Audit of the live record that day: 5 of the 7 roles applied to or approved were hands-on coding or big-lab research-engineering roles
// (Flexport Applied AI Engineer x2, Tavily Staff Applied AI Researcher, OpenAI Applied AI Engineer, Turing Staff Research Scientist), and 36 of 63 pending matches were
// engineer, data-engineer or plain data-scientist titles, or outside the places the owner chose. A posting is read for how much hands-on code it asks for; a heavy load drops it.
const CODING_SIGNALS = [
  ["production code", /production[- ](?:grade |quality |ready )?code/], ["writing code", /(?:write|writing|ship|shipping) (?:clean |high[- ]quality |production )?code/], ["hands-on coding", /hands[- ]on (?:coding|programming|development)/],
  ["software engineering experience", /software (?:engineering|development) (?:experience|background|skills)|experience (?:as|in) (?:a )?software (?:engineer|development)/],
  ["strong programming", /(?:strong|excellent|expert|advanced) (?:programming|coding|software)/], ["programming language proficiency", /(?:proficien\w*|fluen\w*|expert\w*|expertise) (?:in|with) (?:python|java|c\+\+|go|golang|rust|scala|typescript|javascript)\b/],
  ["deep-learning frameworks", /\b(?:pytorch|tensorflow|jax)\b/], ["GPU and CUDA", /\bcuda\b|\btriton\b|gpu kernels?/], ["infrastructure tooling", /\b(?:kubernetes|terraform|docker)\b/], ["CI/CD", /\bci\/cd\b/],
  ["code review", /\bcode reviews?\b|pull requests?/], ["backend or full-stack", /\bback[- ]?end\b|\bfull[- ]stack\b|\bmicroservices?\b/], ["distributed systems", /distributed systems/],
  ["years of coding", /\d+\+? years? (?:of )?(?:professional )?(?:software|programming|coding|engineering) experience/], ["coding interview", /coding (?:interview|challenge|exercise|assessment)|leetcode/],
  ["model training at scale", /(?:train|training|fine[- ]tun\w*) (?:large )?(?:models|llms) at scale|pre[- ]?training/], ["codebase ownership", /\bcodebase\b|\brepositor(?:y|ies)\b/],
];
function codingLoad(desc) {
  const low = String(desc || "").toLowerCase();
  const hits = CODING_SIGNALS.filter(([, re]) => re.test(low)).map(([label]) => label);
  return { n: hits.length, hits };
}
const RANK_RULES = "JOBSEARCH-FIT-1";   // part of prefs_hash: a new rule set retires pending matches the new rules no longer list, on the first run after deploy
const CODING_DROP_AT = 4;   // four or more distinct hands-on-code asks: the role is a coding role whatever its title says
/* JOBSEARCH-EXPLORE-1 (owner 2026-11-09: "My diverse experience doesn't fit neatly into keywords"). A posting whose title is in no role family used to be
   dropped before its text was read. Now, when the title is at least research- or systems-flavoured (EXPLORE_TITLE_RX is a wide net, not a verdict), the posting text is
   compared with the owner's own record (RECORD_TERMS: distinct words from the verified facts, skills, roles, summaries and publications, minus common business words).
   Enough shared terms keep the posting as an "explore" match, labelled as such, capped below a title-in-lane match. */
const EXPLORE_TITLE_RX = /\b(research\w*|scientist|analyst|modell?er|modell?ing|systems?|autonom\w*|agent\w*|safety|evaluat\w*|assurance|simulation|network\w*|operations research|architect\w*|strateg\w*|fellow|technical staff|principal|staff|lead|director|head of|advis[eo]r|consultant|engineer\w*|manager|specialist)\b/i;
const EXPLORE_MIN_TERMS = 8;
const RECORD_STOP = new Set("experience management business working through support ability development including skills knowledge responsibilities requirements opportunity".split(" ").concat("environment excellent strategy strategic organization organisation professional demonstrated communication stakeholders leadership collaborate collaboration candidate position company customers customer product products solutions services results across within providing provide ensure ensuring manage managing years project projects programs program practices process processes team teams related relevant preferred required degree role roles employees employee salary benefits equal employer".split(" ")));
let RECORD_TERMS = new Set();
function recordTerms(text) {
  const out = new Set();
  for (const w of String(text || "").toLowerCase().split(/[^a-z]+/)) if (w.length >= 7 && !RECORD_STOP.has(w)) out.add(w);
  return out;
}
function exploreOverlap(desc, terms = RECORD_TERMS) {
  const hit = new Set();
  for (const w of String(desc || "").toLowerCase().split(/[^a-z]+/)) if (w.length >= 7 && terms.has(w)) hit.add(w);
  return { n: hit.size, terms: [...hit].sort().slice(0, 6) };
}
function scoreJob(job, ctx = DEFAULT_CTX, mode = "rank") {
  const title = (job.title || "").toLowerCase(), desc = job.desc || "";
  const why = [], flags = [], drops = [];
  let pen = 0;
  const wide = mode === "wide";                           // wider net: preferences the owner stated become a penalty and a "stretch" label instead of a drop
  let stretch = false;
  const drop = (reason, soft) => { if (wide && soft) { stretch = true; pen += 25; flags.push("OUTSIDE YOUR PREFERENCES: " + reason); } else drops.push(reason); };
  const famOn = [...ctx.fam].filter((k) => has(title, FAMILIES[k]).length);
  const hits = ABSOLUTE_EXCLUDE.filter((x) => title.includes(x));
  const levelHit = hits.some((x) => LEVEL_EXCLUDE.has(x)), fieldHit = hits.length > 0 && !levelHit;
  // most postings are dropped by their title alone; those return before the expensive reading of the posting text (the run scores about ten thousand postings)
  let ov = { n: 0, terms: [] };
  const early = (reason) => ({ stretch: false, fit: 0, score: 0, tier: "C", clusters: [], unique: false, why: [], flags: [], drops: [reason], gate: "", locNote: "", families: [], ovN: ov.n });
  let cl = null;
  /* JOBSEARCH-CONTENT-FIRST-1 (owner 2026-11-09: "title keywords are a terrible way to represent my experience ... don't ever do that again"). The posting TEXT is read first and
     is the evidence: the distinctive terms it shares with the owner's record (lens 1) and the evidence clusters in it (lens 2); the semantic lens (embeddings, run step) and the
     model re-rank come after. A title never excludes a field or caps a score; it adds a small bonus when it happens to name a lane. Only a seniority word (intern, junior...) is a hard filter. */
  if (mode !== "analyze") {
    if (levelHit) return early("below your level");
    ov = exploreOverlap(desc, ctx.recordTerms || RECORD_TERMS);
    if (fieldHit && ov.n < CONTENT_MIN) { cl = clustersIn(desc, "")   /* evidence comes from the posting text, never from the title */; if (cl.size < 2) return early("no sign of your record in the posting text"); }
  } else if (levelHit) drops.push("below your level");
  const famOff = Object.keys(FAMILIES).filter((k) => !ctx.fam.has(k) && has(title, FAMILIES[k]).length);
  const medium = has(title, TITLE_MEDIUM);
  const soft = false;
  let explore = null;
  if (mode === "analyze") ov = exploreOverlap(desc, ctx.recordTerms || RECORD_TERMS);
  if (!famOn.length && !famOff.length && !medium.length) {
    if (mode !== "analyze" && ov.n < CONTENT_MIN) return early("no sign of your record in the posting text");
    if (ov.n >= CONTENT_MIN) explore = ov;
  }
  if (soft && !famOn.length) drop("role family excluded by title");
  if (!famOn.length && famOff.length) drop("family switched off in your preferences: " + famOff[0].replace("fam_", ""), true);
  if (!famOn.length && !medium.length && !explore) drop("title not in your role families");
  if (!cl) cl = clustersIn(desc, "")   /* evidence comes from the posting text, never from the title */;
  const [gate, locNote] = locationGate(job.location, desc.slice(0, 3000), ctx);
  if (gate === "fail") drop(locNote);   // JOBSEARCH-FIT-1: a place the owner said no to is never shown, not even as a stretch (US roles filled the list while loc_us was No)
  if (gate === "check" && locNote === "location missing" && mode !== "analyze") drop("no location in the posting; it cannot be placed against your preferences");
  else if (gate === "check") { flags.push("LOCATION: " + locNote); pen += /^(Elsewhere|Europe)/.test(locNote) ? 15 : 10; }
  // a title that names a lane still counts when the feed gives no text (some boards send none); once there is text, the text must show the record
  if (cl.size + Math.floor(ov.n / 3) < 2 && (!famOn.length || desc.length >= 200)) drop("thin evidence of your record in the posting");   // evidence = clusters in the text + one per three shared record terms
  if (famOn.length && !cl.size) pen += 15;
  const code = codingLoad(desc);
  if (ctx.a.fam_tech !== true) {
    if (code.n >= CODING_DROP_AT) drop("coding-heavy role: the posting asks for " + code.hits.slice(0, 3).join(", "));
    else if (code.n >= 2) { pen += 6 * code.n; flags.push("CODING: the posting asks for some hands-on code (" + code.hits.join(", ") + ")"); }
  }
  const tScore = famOn.length ? 25 : (medium.length >= 2 || medium.includes("research")) ? 12 : 6;   // the title is a small bonus, never the gate
  const cScore = ov.n >= 3 ? Math.min(30, 6 + 2 * ov.n) : 0;                                            // lens 1: distinctive terms shared with the record
  const eScore = Math.min(45, 9 * cl.size);
  const eOwned = ctx.owned ? Math.min(45, [...cl].reduce((sum, c) => sum + (ctx.owned.has(c) ? 9 : 4), 0)) : eScore;   // evidence the CV can back up counts in full, evidence it lacks counts less
  const uniqA = [...cl].some((c) => CORE.has(c)) && [...cl].some((c) => FRONTIER.has(c));
  const uniqB = [...cl].some((c) => CORE.has(c)) && [...cl].some((c) => DATA_SIDE.has(c));
  if (famOn.length) why.push("title in your lane: " + famOn.slice(0, 2).map((k) => k.replace("fam_", "")).join(", ")); else if (explore) why.push("matches your record beyond title keywords: " + explore.n + " shared terms (" + explore.terms.join(", ") + ")"); else why.push("generic title: " + medium.slice(0, 2).join(", "));
  if (ov.n >= 3 && !explore) why.push("shares " + ov.n + " distinctive terms with your record (" + ov.terms.slice(0, 4).join(", ") + ")");
  why.push(cl.size ? "evidence in the posting: " + [...cl].sort().join(", ") : "no matching evidence in the posting text");
  const lacking = ctx.owned ? [...cl].filter((c) => !ctx.owned.has(c)) : [];
  if (lacking.length) why.push("not in your CV yet: " + lacking.sort().join(", "));
  if (uniqA) why.push("uncommon intersection: research-program or policy-research management + AI or research-integrity systems");
  else if (uniqB) why.push("uncommon intersection: public-policy or planning expertise + data and analytics");
  let score = tScore + cScore + eOwned + (uniqA || uniqB ? 15 : 0);
  const outcomeDelta = Math.max(-12, Math.min(12, scoreFeatures(famOn, cl).reduce((sum, feature) => {
    const weight = Number(ctx.outcomeWeights && ctx.outcomeWeights[feature]);
    return sum + (Number.isFinite(weight) ? weight : 0);
  }, 0)));
  score += outcomeDelta;
  if (outcomeDelta > 0) why.push("past application outcomes favor these posting signals");
  else if (outcomeDelta < 0) why.push("past application outcomes weigh these posting signals less");
  const senior = SENIOR_RE.test(job.title || "");
  if (!senior) { if (ctx.a.lvl_mid === false) drop("below senior level (preference)", true); else if (ctx.a.lvl_mid !== true) { pen += 6; why.push("no seniority marker in the title"); } }
  if (ctx.a.lvl_manage === false && MANAGE_RE.test(job.title || "")) pen += 15;
  if (ctx.a.type_contract === false && /\b(contract|freelance|interim|temporary)\b/.test(title)) drop("contract work not selected", true);
  const tk = tokens(job.title);
  if (tk.some((t) => ctx.learned.boost.has(t))) { score += 10; why.push("looks like roles you liked: " + tk.filter((t) => ctx.learned.boost.has(t)).slice(0, 2).join(", ")); }
  const ck = coKey(job.company);
  if (ctx.learned.coDrop && ctx.learned.coDrop.has(ck)) drops.push("you rejected several roles at this employer");
  else if (ctx.learned.coPen && ctx.learned.coPen.has(ck)) { pen += 20; why.push("you rejected roles at this employer before"); }
  else if (ctx.learned.coBoost && ctx.learned.coBoost.has(ck)) { score += 8; why.push("you liked or applied to a role at this employer"); }
  if (tk.some((t) => ctx.learned.block.has(t))) { pen += 15; why.push("looks like roles you rejected: " + tk.filter((t) => ctx.learned.block.has(t)).slice(0, 2).join(", ")); }
  const low = desc.toLowerCase();
  if (/ph\.?d\.?[^.\n]{0,40}(required|must)|(required|must)[^.\n]{0,40}ph\.?d/.test(low)) { flags.push("DEGREE: PhD appears required; you hold an M.S."); score -= 20; }
  if (/security clearance|u\.?s\.? citizen/.test(low)) flags.push("AUTH: clearance/citizenship language present");
  if (/right to work|work authori[sz]ation|visa sponsorship|eligible to work/.test(low) && gate === "check" && !/^US/.test(locNote)) flags.push("AUTH: work-authorization language; you are authorized in NL and US only");
  const lang = [...low.matchAll(/(?:fluen\w*|proficien\w*|native)[^.\n]{0,30}\b(german|dutch|french|spanish|italian|japanese|korean|mandarin|portuguese|hindi)/g)].map((m) => m[1]);
  if (lang.length) flags.push("LANGUAGE: posting asks for " + [...new Set(lang)].sort().join(", ") + "; you list English only");
  const yrs = [...low.matchAll(/(\d{1,2})\+?\s*(?:or more )?years/g)].map((m) => +m[1]);
  if (yrs.length && Math.max(...yrs) > 22) flags.push(`YEARS: asks ${Math.max(...yrs)}+ years`);
  // JOBSEARCH-CONTENT-FIRST-1: the old cap that kept a title outside the role families at 49 is gone; the posting text decides
  const fit = score;
  score -= pen;
  const tier = stretch ? "C" : score >= 65 && cl.size ? "A" : score >= 35 ? "B" : "C";   // 70 before JOBSEARCH-CONTENT-FIRST-1; the title bonus fell by 15 and the content lens was added
  return { stretch, fit, score, tier, clusters: [...cl].sort(), unique: uniqA || uniqB, why, flags, drops, gate, locNote, families: famOn, explore: !!explore, ovN: ov.n };
}
function evaluate(job, ctx = DEFAULT_CTX, wide = false) {
  const r = scoreJob(job, ctx, wide ? "wide" : "rank");
  if (r.drops.length) return { status: "excluded", reason: r.drops[0], near: r.ovN || 0 };
  return { status: "ok", score: r.score, tier: r.tier, clusters: r.clusters, unique: r.unique, why: r.why, flags: r.flags, stretch: r.stretch };
}
// wide: tier C ("stretch": outside the stated preferences, or a thin fit) is kept when the score is at least 25, so the owner sees the whole range and decides
function rank(jobs, ctx = DEFAULT_CTX, wide = false) {
  const ok = [], excl = {}, near = [];
  for (const j of jobs) {
    const r = evaluate(j, ctx, wide);
    if (r.status === "ok" && (r.tier !== "C" || (wide && r.score >= 25))) ok.push({ ...j, match: r });
    else {
      const k = (r.reason || "score below threshold").replace(/:.*/, ""); excl[k] = (excl[k] || 0) + 1;
      if (r.near >= 3 && r.near < CONTENT_MIN && near.length < 25) near.push(j);   // JOBSEARCH-SEMANTIC-1: a near miss on the words gets a second look by meaning
    }
  }
  ok.sort((a, b) => b.match.score - a.match.score);
  return [ok, excl, near];
}

// ------------------------------------------------------------------ tailoring + verification (port of tailor.py)
// ------------------------------------------------------------------ CV bank (JOBSEARCH-CV-1)
// The claim ledger is the owner's CV bank: roles, achievements, publications, credentials. It lives in D1 (jobsearch_bank, edited on /cv),
// BANK_SEED is only the first value. Every resume sentence is still copied from the bank and re-verified line by line.
const BANK_SEED = {"version":2,"rev":0,"person":{"name":"Rowan Brad Quni-Gudzinas","also_published_as":"Brad Gudzinas","location":"Amsterdam, Netherlands","email":"rowan.quni@qnfo.org","sign_in_email":"rwnquni@outlook.com","links":{"site":"https://qnfo.org","papers":"https://papers.qnfo.org","linkedin":"https://www.linkedin.com/in/rowan-quni/","orcid":"https://orcid.org/0009-0002-4317-5604"},"career_start":2004},"summaries":[{"id":"S1","tags":[],"text":"Systems researcher studying autonomous AI systems: how they behave, fail and can be audited and governed. 20 years of systems work: transportation networks and GIS from 2004, technical components of the national Tour-Based Model System at the U.S. Federal Highway Administration, and the AARP Livability Index, a decision-support system built from 50+ data sources. Founder of QNFO, an autonomous research system in production with a published failure record. Open to autonomous and AI systems research, AI evaluation and assurance, and AI governance and oversight research."}],"roles":[{"id":"R01","title":"Founder","org":"QNFO (independent research)","location":"","start":"2024","end":"present","tags":["research_integrity","llm"]},{"id":"R02","title":"Executive Director and Founder","org":"Empowering Change (nonprofit)","location":"San Francisco, CA","start":"2023","end":"2024","tags":["nonprofit","leadership","llm"]},{"id":"R03","title":"Platform Data Product Manager","org":"iManage","location":"","start":"2022","end":"2023","tags":["product","data_eng"]},{"id":"R04","title":"Senior Product Manager","org":"Epsilon (Publicis Groupe)","location":"","start":"2021","end":"2022","tags":["product","data_eng"]},{"id":"R05","title":"Product Manager and Senior Methods Advisor","org":"AARP Public Policy Institute","location":"Washington, DC","start":"2016","end":"2021","tags":["product","policy","statistics"]},{"id":"R06","title":"Senior Data Scientist","org":"The Advisory Board Company","location":"","start":"2016","end":"2016","tags":["ml","statistics"]},{"id":"R07","title":"Senior Associate, Data Analytics","org":"Deloitte Consulting LLP","location":"Washington, DC","start":"2015","end":"2016","tags":["consulting","ml","policy"]},{"id":"R08","title":"Data Analyst and Research Manager","org":"U.S. Department of Transportation, Federal Highway Administration","location":"Washington, DC","start":"2011","end":"2015","tags":["research_mgmt","transport","statistics","contracting"]},{"id":"R09","title":"Consultant","org":"IBI Group","location":"","start":"2008","end":"2011","tags":["transport","consulting"]},{"id":"R10","title":"Systems Planner","org":"Delaware Valley Regional Planning Commission","location":"","start":"2005","end":"2008","tags":["transport","gis"]},{"id":"R11","title":"GIS Analyst","org":"Cross County Connection TMA","location":"","start":"2004","end":"2005","tags":["gis","transport"]}],"facts":[{"id":"F01","role":"R08","text":"Managed a $1.5M+ federal research portfolio as a certified Contracting Officer's Representative: technical oversight, budgets, milestones, and acceptance of contractor deliverables.","tags":["contracting","leadership","research_mgmt"],"source":"verified_cv","status":"verified","pitch":"At the Federal Highway Administration I managed a $1.5M+ federal research portfolio as a certified Contracting Officer's Representative."},{"id":"F02","role":"R08","text":"Led technical components of the national Tour-Based Model System for long-distance passenger travel forecasting.","tags":["contracting","data_eng","policy","product","statistics","transport"],"source":"verified_cv","status":"verified","pitch":"I led technical components of the national Tour-Based Model System for long-distance passenger travel forecasting."},{"id":"F03","role":"R05","text":"Led the AARP Livability Index: 50+ data sources across 7 domains, scoring U.S. neighborhoods nationwide, across multiple public releases.","tags":["data_eng","gis","policy","product","statistics","writing"],"source":"verified_cv","status":"verified","pitch":"At AARP I led the Livability Index: 50+ data sources across 7 domains, scoring U.S. neighborhoods nationwide."},{"id":"F04","role":"R05","text":"The Index and its method are cited in 20+ academic and policy studies.","tags":["policy","writing"],"source":"verified_cv","status":"verified","pitch":"The Livability Index and its method are cited in 20+ academic and policy studies."},{"id":"F05","role":"R05","text":"Co-authored the Livability Index 2018 report and AARP policy work on housing affordability, including the 2016 analysis of Low-Income Housing Tax Credits.","tags":["policy","writing"],"source":"verified_cv","status":"verified","pitch":"I co-authored the Livability Index 2018 report and AARP policy work on housing affordability."},{"id":"F06","role":"R01","text":"Built and run an autonomous research system on Cloudflare (44+ live workers) that drafts, referees, revises, versions, publishes, and corrects papers.","tags":["llm","research_integrity","research_mgmt","software"],"source":"verified_cv","status":"verified","pitch":"I built and run an autonomous research system on Cloudflare (44+ live workers) that drafts, referees, revises, versions, publishes, and corrects papers."},{"id":"F07","role":"R01","text":"Designed the audit method: The Universal Ignorance Audit and Epistemic Legibility in AI-Assisted Science.","tags":["llm","research_integrity","software"],"source":"verified_cv","status":"verified","pitch":"I designed a published audit method for AI-assisted research: The Universal Ignorance Audit and Epistemic Legibility in AI-Assisted Science."},{"id":"F08","role":"R01","text":"Proposed JPCUB, a whole-system energy benchmark for computing (joules per correct answer), with a measurement protocol, estimates for 17 quantum platforms, and an extension to LLM inference.","tags":["llm","numerics","quantum","software"],"source":"verified_cv","status":"verified","pitch":"I proposed JPCUB, a whole-system energy benchmark for computing (joules per correct answer), with estimates for 17 quantum platforms and an extension to LLM inference."},{"id":"F09","role":"R01","text":"Publish an open library of preprints with DOIs and a queryable knowledge graph.","tags":["research_integrity"],"source":"verified_cv","status":"verified","pitch":"I publish an open library of preprints with DOIs and a queryable knowledge graph."},{"id":"F10","role":"R02","text":"Built an LLM legal-navigation tool for self-represented litigants: document drafting, procedural guidance, and plain-language translation of legal terms.","tags":["llm","nonprofit","software"],"source":"verified_cv","status":"verified","pitch":"I built an LLM legal-navigation tool for self-represented litigants: document drafting, procedural guidance, and plain-language translation of legal terms."},{"id":"F11","role":"R02","text":"Took the nonprofit from incorporation to public launch.","tags":["leadership","nonprofit","research_mgmt"],"source":"verified_cv","status":"verified","pitch":"As Executive Director and Founder of Empowering Change I took the nonprofit from incorporation to public launch."},{"id":"F12","role":"R07","text":"Delivered analytics and machine-learning engagements for federal and public-sector clients.","tags":["consulting","contracting","ml","statistics"],"source":"verified_cv","status":"verified","pitch":"At Deloitte I delivered analytics and machine-learning engagements for federal and public-sector clients."},{"id":"F13","role":"R07","text":"Co-authored a 2016 Transportation Research Board paper on updating the National Household Travel Survey with American Community Survey data.","tags":["policy","statistics","transport","writing"],"source":"verified_cv","status":"verified","pitch":"I co-authored a 2016 Transportation Research Board paper on updating the National Household Travel Survey with American Community Survey data."},{"id":"F14","role":"R08","text":"Presented national long-distance travel data needs at the 2011 TRB National Household Travel Survey workshop.","tags":["policy","statistics","transport","writing"],"source":"verified_cv","status":"verified","pitch":"I presented national long-distance travel data needs at the 2011 TRB National Household Travel Survey workshop."}],"publications":[{"id":"P01","title":"The Joules-per-Solution Metric: Definition, Measurement Protocol, and Anti-Gaming Provisions","year":2026,"doi":"","tags":["quantum","numerics","research_integrity"]},{"id":"P02","title":"Error Correction Is a Landauer Machine: The Thermodynamic Floor of Quantum Error-Correction Overhead","year":2026,"doi":"","tags":["quantum","physics_theory"]},{"id":"P03","title":"The Universal Ignorance Audit","year":2026,"doi":"","tags":["research_integrity","llm"]},{"id":"P04","title":"Operating the Quniverse Fleet: Objectives, Successes, Failures, and Roadmap of an Autonomous Cloud Research System","year":2026,"doi":"","tags":["llm","software","research_integrity"]},{"id":"P05","title":"Epistemic Legibility in AI-Assisted Science","year":2026,"doi":"","tags":["research_integrity","llm"]},{"id":"P06","title":"AARP Livability Index 2018 report (co-author, as Brad Gudzinas)","year":2018,"doi":"","tags":["policy","statistics","gis"]},{"id":"P07","title":"Tour-Based National Model System, FHWA (as Brad Gudzinas)","year":2014,"doi":"","tags":["transport","statistics"]},{"id":"P08","title":"Updating the National Household Travel Survey with American Community Survey data (TRB, co-author)","year":2016,"doi":"","tags":["transport","statistics","policy"]}],"education":["M.S., City and Regional Studies, Rutgers University, Edward J. Bloustein School of Planning and Public Policy (2008)","B.A., Urban Studies and Community Planning, Rutgers University-Camden (2004)"],"certifications":["Project Management Professional (PMP), Project Management Institute (2016)","Contracting Officer's Representative (COR), Defense Acquisition University (2011)","American Institute of Certified Planners (AICP), American Planning Association (2009)"],"skills":[{"name":"Autonomous AI systems","tags":["llm","research_integrity"]},{"name":"Systems modeling","tags":["transport","statistics"]},{"name":"AI evaluation and oversight methods","tags":["research_integrity","llm"]},{"name":"Research program management","tags":["research_mgmt"]},{"name":"Federal contract oversight","tags":["contracting"]},{"name":"Product management","tags":["product"]},{"name":"Statistical modeling","tags":["statistics"]},{"name":"Travel-demand modeling","tags":["transport"]},{"name":"GIS","tags":["gis"]},{"name":"LLM agent systems","tags":["llm"]},{"name":"Cloudflare Workers, D1, R2, Vectorize","tags":["software","data_eng"]},{"name":"Machine learning","tags":["ml"]},{"name":"Data science","tags":["ml","statistics"]}],"review":[{"id":"V1","role":"R08","tags":["transport","statistics","research_mgmt"],"text":"Co-directed the $10M U.S. DOT National Household Travel Survey.","why":"Appears in your Oct 1 identity-kit draft but was removed from your verified CV. Confirm only if true; edit the wording to what you actually did."},{"id":"V2","role":"R04","tags":["ml","product"],"text":"Led predictive analytics deployments at Epsilon (Publicis Groupe).","why":"From the same draft; not in the verified CV. Confirm only if true."},{"id":"V3","role":"","tags":["physics_theory","quantum"],"text":"Inventor on U.S. patent(s) in quantum computing: [add patent numbers and titles].","why":"Your GitHub profile mentions patents; none found in a patent search. A patent claim without numbers will be checked, so add the numbers or reject."}],"answers":{}};
const QUESTIONS = [{"id":"phys_qft","section":"Physics & theory","ask":"Have you done quantum field theory or particle-physics calculations (any level: research, thesis, independent work)?","tags":["physics_theory"]},{"id":"phys_renorm","section":"Physics & theory","ask":"Have you used renormalization, dimensional regularization, or effective field theory methods?","tags":["physics_theory","high_dim_stats"]},{"id":"phys_statmech","section":"Physics & theory","ask":"Have you worked with statistical mechanics, lattice methods, or path-integral techniques?","tags":["physics_theory","numerics"]},{"id":"phys_quantum_info","section":"Physics & theory","ask":"Have you worked on quantum computing, quantum information, or quantum algorithms?","tags":["quantum"]},{"id":"phys_benchmark","section":"Physics & theory","ask":"Have you designed benchmarks, measurement protocols, or resource estimates for computing hardware or algorithms?","tags":["quantum","numerics","research_integrity"]},{"id":"phys_papers","section":"Physics & theory","ask":"Have you authored or co-authored physics/theory papers or preprints?","tags":["physics_theory","writing"]},{"id":"stat_highdim","section":"Statistics & ML","ask":"Have you handled high-dimensional data (more variables than observations, regularized regression, lasso/ridge, dimensionality reduction)?","tags":["high_dim_stats","statistics","ml"]},{"id":"stat_bayes","section":"Statistics & ML","ask":"Have you built Bayesian or hierarchical models?","tags":["statistics"]},{"id":"stat_causal","section":"Statistics & ML","ask":"Have you done causal inference, program evaluation, or experiment/A-B test design?","tags":["statistics","policy"]},{"id":"stat_survey","section":"Statistics & ML","ask":"Have you designed, weighted, fused, or analyzed survey data?","tags":["statistics","transport","policy"]},{"id":"stat_forecast","section":"Statistics & ML","ask":"Have you built forecasting, simulation, or demand models?","tags":["statistics","transport","numerics"]},{"id":"ml_train","section":"Statistics & ML","ask":"Have you trained or deployed machine-learning models?","tags":["ml"]},{"id":"ml_index","section":"Statistics & ML","ask":"Have you built a composite index or scoring system from many data sources?","tags":["statistics","data_eng","policy"]},{"id":"num_sim","section":"Statistics & ML","ask":"Have you written numerical simulation, Monte Carlo, or optimization code?","tags":["numerics","software"]},{"id":"llm_build","section":"AI systems","ask":"Have you built LLM-based applications or agents?","tags":["llm","software"]},{"id":"llm_rag","section":"AI systems","ask":"Have you built retrieval (RAG), vector search, or knowledge-graph systems?","tags":["llm","data_eng"]},{"id":"llm_eval","section":"AI systems","ask":"Have you built evaluations, red-team tests, or quality/verification gates for AI output?","tags":["llm","research_integrity"]},{"id":"llm_safety","section":"AI systems","ask":"Have you worked on AI safety, governance, auditing, or responsible-AI methods?","tags":["research_integrity","llm","policy"]},{"id":"llm_autonomy","section":"AI systems","ask":"Have you designed autonomous multi-step pipelines (scheduled, self-monitoring, self-correcting)?","tags":["llm","software","research_integrity"]},{"id":"sw_python","section":"Software & data","ask":"Do you write production or research Python?","tags":["software"]},{"id":"sw_js","section":"Software & data","ask":"Do you write JavaScript/TypeScript?","tags":["software"]},{"id":"sw_cloud","section":"Software & data","ask":"Have you built and operated cloud/serverless systems (Cloudflare, AWS, etc.)?","tags":["software","data_eng"]},{"id":"sw_sql","section":"Software & data","ask":"Have you designed databases or data pipelines (SQL, ETL)?","tags":["data_eng"]},{"id":"sw_oss","section":"Software & data","ask":"Have you published open-source code or datasets?","tags":["software","research_integrity"]},{"id":"sw_gis","section":"Software & data","ask":"Have you done GIS or geospatial analysis?","tags":["gis","transport"]},{"id":"mgmt_portfolio","section":"Management & leadership","ask":"Have you managed a research/program portfolio or budget?","tags":["research_mgmt","contracting"]},{"id":"mgmt_contract","section":"Management & leadership","ask":"Have you overseen contractors, grants, or procurements?","tags":["contracting","research_mgmt"]},{"id":"mgmt_team","section":"Management & leadership","ask":"Have you directly managed or mentored people?","tags":["leadership"]},{"id":"mgmt_found","section":"Management & leadership","ask":"Have you founded or launched an organization, product, or program from zero?","tags":["leadership","nonprofit","product"]},{"id":"mgmt_product","section":"Management & leadership","ask":"Have you owned a product roadmap or shipped a data product to users?","tags":["product"]},{"id":"mgmt_stake","section":"Management & leadership","ask":"Have you briefed executives, legislators, or external stakeholders?","tags":["policy","leadership","writing"]},{"id":"mgmt_funding","section":"Management & leadership","ask":"Have you written grant proposals or raised funding?","tags":["research_mgmt","nonprofit","writing"]},{"id":"pol_housing","section":"Policy & planning","ask":"Have you done housing, aging, or social-policy analysis?","tags":["policy"]},{"id":"pol_transport","section":"Policy & planning","ask":"Have you done transportation, land-use, or urban-planning work?","tags":["transport","policy"]},{"id":"pol_climate","section":"Policy & planning","ask":"Have you worked on climate, energy, or sustainability topics?","tags":["policy","quantum"]},{"id":"pol_intl","section":"Policy & planning","ask":"Have you worked with international/EU/Dutch institutions or in a non-US context?","tags":["policy","consulting"]},{"id":"pub_peer","section":"Writing & teaching","ask":"Have you published peer-reviewed papers, reports, or conference talks?","tags":["writing","research_integrity"]},{"id":"pub_review","section":"Writing & teaching","ask":"Have you reviewed papers or run a peer-review/referee process?","tags":["research_integrity","writing"]},{"id":"pub_teach","section":"Writing & teaching","ask":"Have you taught, tutored, or trained people (courses, workshops)?","tags":["teaching"]},{"id":"pub_cited","section":"Writing & teaching","ask":"Has your work been cited, adopted, or used by others (cite counts, downloads, users)?","tags":["writing","policy"]},{"id":"cons_client","section":"Consulting","ask":"Have you delivered client-facing consulting engagements?","tags":["consulting"]},{"id":"cons_analytics","section":"Consulting","ask":"Have you delivered analytics or ML for government/regulated clients?","tags":["consulting","ml","policy"]},{"id":"misc_other","section":"Anything else","ask":"Is there something you've done that none of the above covers but you'd want an employer to know?","tags":[]}];
// CV topic tag -> posting evidence clusters (CLUSTER_KW keys). The owner's tags drive what counts as evidence the owner can back up.
const TAG_TO_CLUSTERS = {
  statistics: ["survey_methods"], ml: ["data_science"], llm: ["ai_systems", "autonomous_systems"], quantum: ["quantum_energy"], research_mgmt: ["research_mgmt"],
  contracting: ["contracting", "federal"], product: ["product"], policy: ["policy_research", "social_policy"], transport: ["transport_modeling", "urban_planning", "systems_modeling"],
  gis: ["gis"], leadership: ["program_mgmt"], nonprofit: ["nonprofit"], research_integrity: ["research_integrity"], consulting: ["consulting"],
  data_eng: ["data_product"], software: ["software"], physics_theory: ["physics_theory"], high_dim_stats: ["high_dim_stats", "survey_methods"],
  numerics: ["numerics"], teaching: ["teaching"], writing: ["writing"],
  founder: ["platform_strategy", "autonomous_systems", "program_mgmt"],   // JOBSEARCH-ULTRASTABLE-1: founder and director of an autonomous development platform
};
const clustersOf = (tags) => [...new Set((tags || []).flatMap((t) => TAG_TO_CLUSTERS[t] || []))];
const REFERRAL_ASK = "Would you be open to a short chat about the team, or to passing my application to the hiring manager? I understand if not.";
const STATIC_BASE = [REFERRAL_ASK, "Hello,", "Best regards,", "## Experience highlights", "## Credentials", "## Experience", "## Earlier roles", "## Selected work", "## Education", "## Certifications", "## Skills", "**Other experience**"];
const endYr = (r) => (/present/i.test(r.end) ? 9999 : parseInt(r.end, 10) || 0);
const byRecency = (a, b) => endYr(b) - endYr(a) || (parseInt(b.start, 10) || 0) - (parseInt(a.start, 10) || 0);
const rolePeriod = (r) => (r.start === r.end ? r.start : `${r.start} to ${r.end}`);
const roleHead = (r) => `**${r.title}**, ${r.org}${r.location ? ", " + r.location : ""} | ${rolePeriod(r)}`;
const roleLite = (r) => `${r.title}, ${r.org} (${rolePeriod(r)})`;
const pubLine = (p) => `${p.title} (${p.year})` + (p.doi ? `, https://doi.org/${p.doi}` : p.url ? `, ${p.url}` : "");
let BANK = BANK_SEED, BANK_REV = 0, OWNED = null, FACTS = {}, P = LEDGER.person, STATIC = new Set(), LEDGER_LOW = "", LEDGER_SKILLS = "";
const HEADS = Object.fromEntries(LEDGER.headlines.map((h) => [h.id, h]));
function applyBank(b, rev) {
  BANK = b; BANK_REV = rev || 0;
  const roles = Object.fromEntries((b.roles || []).map((r) => [r.id, r]));
  const rec = (f) => (roles[f.role] ? endYr(roles[f.role]) : 0);
  LEDGER.facts = (b.facts || []).filter((f) => f.status !== "rejected").map((f) => {
    const r = roles[f.role];
    return { id: f.id, role: f.role || "", text: f.text, pitch: f.pitch || f.text, tags: f.tags || [], cluster: clustersOf(f.tags), employer: r ? r.org : "", period: r ? rolePeriod(r) : "" };
  }).sort((x, y) => rec(y) - rec(x));
  LEDGER.person = { ...b.person };
  LEDGER.skills = (b.skills || []).map((s) => s.name.toLowerCase());
  LEDGER.ledger_verified_on = b.verified_on || LEDGER.ledger_verified_on;
  LEDGER_VERIFIED_ON = LEDGER.ledger_verified_on;
  FACTS = Object.fromEntries(LEDGER.facts.map((f) => [f.id, f]));
  P = LEDGER.person;
  STATIC = new Set([...STATIC_BASE, LEDGER.closing, P.name]);
  LEDGER_LOW = JSON.stringify([LEDGER, b]).toLowerCase();
  LEDGER_SKILLS = LEDGER.skills.join(" | ") + " | agile pmp";
  const owned = new Set();
  for (const f of LEDGER.facts) f.cluster.forEach((c) => owned.add(c));
  for (const r of b.roles || []) clustersOf(r.tags).forEach((c) => owned.add(c));
  for (const p of b.publications || []) clustersOf(p.tags).forEach((c) => owned.add(c));
  for (const s of b.skills || []) clustersOf(s.tags).forEach((c) => owned.add(c));
  OWNED = owned;
  RECORD_TERMS = recordTerms(cvCorpus());   // JOBSEARCH-EXPLORE-1
}
const tag = (line, t) => `${line} <!--${t}-->`;
const FORBIDDEN = ["kubernetes", "tensorflow", "pytorch", "java", "rust", "golang", "aws", "azure", "gcp", "spark", "docker", "react", "tableau", "power bi", "snowflake", "databricks", "scrum master", "six sigma", "cissp", "phd", "ph.d", "mba", "cfa", "security clearance", "fluent"];

function pickFacts(clusters, k) {
  const cl = new Set(clusters), scored = [];
  LEDGER.facts.forEach((f, i) => {
    const s = f.cluster.filter((c) => cl.has(c)).length;
    if (s) scored.push([-s, i, f]);
  });
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const picked = scored.slice(0, k).map((x) => x[2]);
  for (const f of LEDGER.facts) { if (picked.length >= k) break; if (!picked.includes(f)) picked.push(f); }   // postings outside the clusters still get verified facts, newest roles first
  return picked;
}
function headline(clusters) {
  const cl = new Set(clusters);
  // JOBSEARCH-AUTONOMY-1 (2026-11-09): AI and autonomous-systems postings get the research headline (H2). Before, they got H3, the data and product headline, and quantum postings did too.
  if (cl.has("ai_systems") || cl.has("autonomous_systems")) {
    if (typeof jobsearch_meta === "object") jobsearch_meta.research_headline = "on";
    else globalThis.jobsearch_meta = { research_headline: "on" };
    return HEADS.H2;
  }
  const a = ["research_mgmt"].filter((c) => cl.has(c)).length + ["federal", "policy_research", "transport_modeling"].filter((c) => cl.has(c)).length;
  const b = HEADS.H2.cluster.filter((c) => cl.has(c)).length;
  const c3 = HEADS.H3.cluster.filter((c) => cl.has(c)).length;
  let chosen;
  if (c3 > a && c3 > b) chosen = HEADS.H3;
  else chosen = a > b ? HEADS.H1 : HEADS.H2;
  if (chosen === HEADS.H3) {
    if (typeof jobsearch_meta === "object") jobsearch_meta.research_headline = "on";
    else globalThis.jobsearch_meta = { research_headline: "on" };
  }
  return chosen;
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
// Resume: summary, every recent role with the achievements that fit the posting (at most 3 per role, 9 in all), older roles on one line each,
// the publications that fit, education, certifications, skills. Each line is tagged with the bank record it is copied from.
function buildResume(job, m) {   // m: { clusters, judge? }
  const cl = new Set(m.clusters), b = BANK, roles = [...(b.roles || [])].sort(byRecency);
  const jobTags = new Set(Object.entries(TAG_TO_CLUSTERS).filter(([, cs]) => cs.some((c) => cl.has(c))).map(([t]) => t));
  const per = {}, chosen = [];
  // ATS keyword echo (JOBSEARCH-APPLY-1): among the facts that fit the posting, those that use the posting's own terms come first
  // JOBSEARCH-TAILOR-1: every verified fact is ranked against this posting, not only those in its clusters: the model judge's matched facts first,
  // then the posting's own terms (weighted by how often the posting repeats them), then cluster fit, then recency. Nothing is written that the bank does not hold.
  const hot = postingTerms(job).filter((t) => t.kind !== "tool" || kwRe(t.term).test(cvCorpus())).map((t) => ({ re: kwRe(t.term), w: Math.min(3, t.count) }));
  const jm = new Set(((m.judge || {}).matched_fact_ids) || []);
  const score = (f, i) => { const low = f.text.toLowerCase(); return (jm.has(f.id) ? 100 : 0) + hot.reduce((a, t) => a + (t.re.test(low) ? t.w * 4 : 0), 0) + f.cluster.filter((c) => cl.has(c)).length * 3 - i * 0.01; };
  const ordered = LEDGER.facts.map((f, i) => [score(f, i), f]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
  const strong = {}; for (const f of ordered) if (jm.has(f.id) || hot.some((t) => t.re.test(f.text.toLowerCase()))) strong[f.role || "-"] = (strong[f.role || "-"] || 0) + 1;
  for (const f of ordered) { const k = f.role || "-"; per[k] = (per[k] || 0) + 1; if (per[k] > ((strong[k] || 0) >= 4 ? 4 : 3)) continue; chosen.push(f); if (chosen.length >= 12) break; }
  const byRole = {};
  for (const f of chosen) (byRole[f.role] = byRole[f.role] || []).push(f);
  const summaries = (b.summaries || []).map((s) => [(s.tags || []).filter((t) => jobTags.has(t)).length, s]).sort((x, y) => y[0] - x[0]);
  const L = [tag("# " + P.name, "P"), tag(`${P.location} | ${P.email} | ${P.links.site} | ${P.links.linkedin}`, "P"), tag(`Earlier work is published under ${P.also_published_as}.`, "P"), ""];
  if (summaries.length) L.push(tag(summaries[0][1].text, "SUM:" + summaries[0][1].id), "");
  L.push(tag("## Experience", "S"));
  const recent = roles.filter((r) => endYr(r) >= 2011 || byRole[r.id]), older = roles.filter((r) => !recent.includes(r));
  for (const r of recent) { L.push("", tag(roleHead(r), "R:" + r.id)); for (const f of byRole[r.id] || []) L.push(tag("- " + f.text, "F:" + f.id)); }
  if (byRole[""] && byRole[""].length) { L.push("", tag("**Other experience**", "S")); for (const f of byRole[""]) L.push(tag("- " + f.text, "F:" + f.id)); }
  if (older.length) { L.push("", tag("## Earlier roles", "S")); for (const r of older) L.push(tag("- " + roleLite(r), "RL:" + r.id)); }
  const pubs = (b.publications || []).map((p) => [(p.tags || []).filter((t) => jobTags.has(t)).length, p]).sort((x, y) => y[0] - x[0] || y[1].year - x[1].year);
  const topPubs = pubs.filter((x) => x[0] > 0).slice(0, 4).concat(pubs.filter((x) => x[0] === 0).slice(0, 2)).slice(0, 4).map((x) => x[1]).sort((x, y) => y.year - x.year);
  if (topPubs.length) { L.push("", tag("## Selected work", "S")); for (const p of topPubs) L.push(tag("- " + pubLine(p), "PUB:" + p.id)); }
  if ((b.education || []).length) { L.push("", tag("## Education", "S")); b.education.forEach((e, i) => L.push(tag("- " + e, "EDU:" + i))); }
  if ((b.certifications || []).length) { L.push("", tag("## Certifications", "S")); b.certifications.forEach((e, i) => L.push(tag("- " + e, "CERT:" + i))); }
  const low = (job.desc + " " + job.title).toLowerCase();
  const sk = (b.skills || []).map((s) => [(s.tags || []).filter((t) => jobTags.has(t)).length + (low.includes(s.name.toLowerCase()) ? 2 : 0), s]).sort((x, y) => y[0] - x[0]);
  const names = sk.filter((x) => x[0] > 0).concat(sk.filter((x) => x[0] === 0)).slice(0, Math.max(10, Math.min(16, sk.filter((x) => x[0] > 0).length))).map((x) => x[1].name);   // every CV skill the posting names goes on the skills line
  if (names.length) L.push("", tag("## Skills", "S"), tag(names.join(" · "), "K"));
  return L.join("\n") + "\n";
}
function buildNote(job, m) {
  const facts = pickFacts(m.clusters, 3), terms = jobTerms(job, m.clusters);
  const L = [tag("Hello,", "S"), "", tag(`I am applying for the ${job.title} role at ${job.company}.`, "J:title")];
  if (terms.length) L.push(tag("The posting mentions " + terms.map((t) => `"${t}"`).join(" and ") + ", which is the work I have done:", "J:terms:" + terms.join("|")));
  L.push("");
  for (const f of facts) L.push(tag(f.pitch !== f.text ? f.pitch : "- " + f.text, "F:" + f.id));
  L.push("", tag(LEDGER.closing, "S"), "", tag("Best regards,", "S"), tag(P.name, "S"));
  return L.join("\n") + "\n";
}
const nums = (s) => new Set(String(s).match(/\d[\d,.]*\+?/g) || []);
function verify(doc, job) {
  const bad = [];
  const allowed = new Set();
  const addAll = (set) => set.forEach((x) => allowed.add(x));
  addAll(nums(JSON.stringify(BANK))); addAll(nums(JSON.stringify(LEDGER.headlines)));
  addAll(nums(job.title)); addAll(nums(job.company));
  const allowedTrim = new Set([...allowed].map((x) => x.replace(/[.,]+$/, "")));
  const jd = (job.desc + " " + job.title).toLowerCase();
  const roleOf = (id) => (BANK.roles || []).find((r) => r.id === id);
  const unbullet = (s) => (s.startsWith("- ") ? s.slice(2) : s);
  doc.split("\n").forEach((raw, i) => {
    const n = i + 1;
    if (!raw.trim()) return;
    const m = raw.match(/^(.*?) <!--(.+)-->$/);
    if (!m) { bad.push(`L${n}: untagged line: ${raw.slice(0, 60)}`); return; }
    const text = m[1], t = m[2], kind = t.split(":")[0], arg = t.slice(kind.length + 1);
    if (kind === "F") {
      const f = FACTS[arg], body = unbullet(text);
      if (!f || (body !== f.text && body !== f.pitch)) bad.push(`L${n}: text does not equal ledger fact ${t}`);
    } else if (kind === "H") {
      const h = HEADS[arg];
      if (!h || text !== h.text) bad.push(`L${n}: headline differs from ledger ${t}`);
    } else if (kind === "SUM") {
      const s = (BANK.summaries || []).find((x) => x.id === arg);
      if (!s || text !== s.text) bad.push(`L${n}: summary differs from the CV ${t}`);
    } else if (kind === "R") {
      const r = roleOf(arg);
      if (!r || text !== roleHead(r)) bad.push(`L${n}: role line differs from the CV ${t}`);
    } else if (kind === "RL") {
      const r = roleOf(arg);
      if (!r || unbullet(text) !== roleLite(r)) bad.push(`L${n}: earlier-role line differs from the CV ${t}`);
    } else if (kind === "PUB") {
      const p = (BANK.publications || []).find((x) => x.id === arg);
      if (!p || unbullet(text) !== pubLine(p)) bad.push(`L${n}: publication differs from the CV ${t}`);
    } else if (kind === "EDU" || kind === "CERT") {
      const list = kind === "EDU" ? BANK.education : BANK.certifications;
      if (unbullet(text) !== (list || [])[+arg]) bad.push(`L${n}: ${kind === "EDU" ? "education" : "certification"} differs from the CV ${t}`);
    } else if (kind === "K") {
      const names = new Set((BANK.skills || []).map((s) => s.name));
      for (const s of text.split(" · ")) if (!names.has(s)) bad.push(`L${n}: skill not in the CV: ${s}`);
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
applyBank(BANK_SEED, 0);
const stripTags = (s) => s.replace(/ <!--.*?-->$/gm, "");

// ------------------------------------------------------------------ JOBSEARCH-RESEARCH-HEADLINE-1
const RESEARCH_HEADLINE_VERSION = "JOBSEARCH-RESEARCH-HEADLINE-1";
function cvJsonLd() {
  const b = BANK, person = b.person || {};
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: person.name,
    email: "mailto:" + person.email,
    url: (person.links && person.links.site) || undefined,
    sameAs: person.links && person.links.linkedin ? [person.links.linkedin] : [],
    hasOccupation: ((b.roles || [])[0] || {}).title || undefined,
    alumniOf: (b.education || []).map(String),
    knowsAbout: (b.skills || []).map((s) => s.name),
    author: (b.publications || []).map((p) => ({
      "@type": "ScholarlyArticle",
      name: p.title,
      datePublished: String(p.year),
      url: p.doi ? "https://doi.org/" + p.doi : p.url || undefined,
    })),
  };
}
async function cvRoute() {
  return new Response(JSON.stringify(cvJsonLd(), null, 2), { headers: { "content-type": "application/ld+json" } });
}
globalThis.CV = { version: RESEARCH_HEADLINE_VERSION, routes: { "GET /cv.jsonld": cvRoute } };

// ------------------------------------------------------------------ pipeline
async function pool(tasks, n) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; res[k] = await tasks[k](); } }));
  return res;
}
async function collectAndRank(ctx, onlyGroups) {
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
  // candidate boards (JOBSEARCH-FIT-1): fetched once each, never retried, and a failure is silent (see CANDIDATE_BOARDS)
  const candidatesLive = [];
  if (!onlyGroups || onlyGroups.includes("candidates")) {
    for (const [kind, slugs] of Object.entries(CANDIDATE_BOARDS)) for (const a of slugs) {
      const feed = `${kind}:${a}`;
      if (ACTIVE_FEEDS.has(feed)) continue;
      tasks.push(async () => { try { const jobs = await FETCHERS[kind](a); return jobs.length ? { feed, jobs, candidate: true } : { feed, candidate: true, quiet: true }; } catch (e) { return { feed, candidate: true, quiet: true }; } });
    }
  }
  const kept = [], errors = [], excl = {}, feedResults = [], nearAll = [];
  let fetched = 0;
  // each feed is ranked as soon as it is parsed so only passing jobs stay in memory
  await pool(tasks.map((t) => async () => {
    const r = await t();
    if (r.quiet) return;
    if (r.candidate) candidatesLive.push(r.feed);
    if (r.err) { errors.push(r.err); feedResults.push({ feed: r.feed, ok: false, error: r.err }); return; }
    for (const jb of r.jobs) jb.company = DISPLAY[jb.company] || jb.company;
    fetched += r.jobs.length;
    feedResults.push({ feed: r.feed, ok: true, count: r.jobs.length });
    const [ok, ex, nr] = rank(r.jobs, ctx, true);
    nearAll.push(...nr);
    for (const [k, v] of Object.entries(ex)) excl[k] = (excl[k] || 0) + v;
    kept.push(...ok);
  }), 6);
  kept.sort((a, b) => b.match.score - a.match.score);
  return { kept, errors, excl, fetched, feeds: feedsList.length, feedResults, near: nearAll.slice(0, 150), candidatesLive };
}
// JOBSEARCH-LLM-RERANK-1: reorder-only re-rank of the top passing postings.
// The model may only reorder and add one sentence of reason per posting; it never writes resume or note text
// (drafts are still assembled from the ledger afterwards and re-verified). A failed, malformed or empty answer
// leaves the deterministic order untouched. The call goes through the qnfo-ai service binding with caller
// qnfo-jobsearch, and is skipped when it would cost more than the cheapest Workers AI model (BUDGET-SOFT-ROUTE-1).
// Working path (the first version asked a service binding named AI for an infer route that qnfo-ai does not have, and this worker never declared that binding,
// so it returned the deterministic order on every run). The model is called through the QNFO_AI service binding (props caller qnfo-jobsearch,
// CLAUDE.md 1703: no key copy) on the router's chat route, pinned to one cheap Workers AI model (BUDGET-SOFT-ROUTE-1: the router downgrades at a cap, never refuses).
// Deterministic guards, none of which trusts the model: (1) the answer must order every one of the numbered postings exactly once, otherwise the
// order stands; (2) a reason is shown only when reasonOk accepts it: one plain sentence, no first or second person, no markup or link, and every number
// and proper noun in it already appears in the posting or in the deterministic signals (a model cannot add a claim about the owner or the employer);
// (3) only match.why gets an "LLM: " line: score, tier, flags, the posting and the drafts are never touched, and the resume and note are built afterwards
// from the ledger and re-verified, so no model word can reach them. The outcome of each run is written to jobsearch_meta rerank_status.
const RERANK_TOP = 25;
const RERANK_MODEL = "@cf/zai-org/glm-5.3-flash";   // the cheapest model the floor policy allows; the router sets reasoning_effort low for an answer of at most 2048 tokens (REASONING-BUDGET-1)
const RERANK_SYSTEM = "You order job postings for one job seeker. You may ONLY reorder the numbered postings and write one short plain sentence per posting saying why it ranks where it does, using only words and numbers that appear in the posting fields or signals you are given. Never write or suggest resume, cover letter or note text, never say anything about the job seeker's experience, years, degrees, employers or skills, and never add a fact. Write about the posting in the third person and never use the words you or your. Answer with JSON only: {\"order\":[posting numbers, best first, each number exactly once],\"reasons\":{\"<number>\":\"one sentence\"}}.";
const RERANK_SIGNAL_RE = /^(title in your lane|generic title|evidence in the posting|no matching evidence in the posting|uncommon intersection)/;
function rerankMessages(top) {
  const items = top.map((j, i) => ({ n: i + 1, title: j.title, company: j.company, location: j.location || "", score: j.match.score, signals: (j.match.why || []).filter((w) => RERANK_SIGNAL_RE.test(w)).map((w) => w.replace(/\byour\b/g, "the target")).slice(0, 4) }));   // "your" would be echoed into a reason and reasonOk rejects the second person (the first live run stored 13 rank lines and no reason)   // posting-fit signals only: what the owner liked, rejected or applied to never leaves the worker
  return [{ role: "system", content: RERANK_SYSTEM }, { role: "user", content: JSON.stringify(items) }];
}
// {order: [0-based indexes], reasons: {index: text}} or null when the answer is not a full permutation of 1..n
/* JOBSEARCH-SEMANTIC-1 (owner 2026-11-09: "go in several different directions to find what my experience is"). Lens 3: the meaning of the posting against the meaning of the owner's own
   verified facts, roles and summaries (Workers AI embeddings), independent of any shared word. It boosts a kept posting that is close to the record, and rescues a near miss on the
   words (3 to 5 shared terms) that is close in meaning. No AI binding or a failed call leaves the lexical ranking untouched. Thresholds are the first reading of bge-base cosine
   scores and are tuned from the owner's verdicts (jobsearch_calib). */
const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5", SEM_BOOST = 0.58, SEM_RESCUE = 0.64, SEM_BATCH = 40;
function cosine(a, b) {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return x && y ? d / Math.sqrt(x * y) : 0;
}
function bestSim(vec, recVecs) {
  let best = { sim: -1, i: -1 };
  for (let i = 0; i < recVecs.length; i++) { const c = cosine(vec, recVecs[i]); if (c > best.sim) best = { sim: c, i }; }
  return best;
}
function recordPassages() {
  const p = LEDGER.facts.map((f) => f.text), b = BANK;
  for (const r of b.roles || []) p.push(r.title + " at " + r.org);
  for (const sm of b.summaries || []) p.push(sm.text);
  for (const pub of b.publications || []) p.push(pub.title);
  return p.map((t) => String(t || "").slice(0, 400)).filter((t) => t.length > 20).slice(0, 90);
}
async function embedTexts(env, texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += SEM_BATCH) {
    const r = await env.AI.run(EMBED_MODEL, { text: texts.slice(i, i + SEM_BATCH) });
    if (!r || !Array.isArray(r.data) || r.data.length !== Math.min(SEM_BATCH, texts.length - i)) throw new Error("embedding answer has the wrong shape");
    out.push(...r.data);
  }
  return out;
}
let REC_EMB = { rev: -1, passages: [], vecs: [] };
const postingText = (j) => String(j.title || "") + ". " + String(j.company || "") + ". " + String(j.desc || "").slice(0, 700);
async function semanticLens(env, kept, near, ctx) {
  if (!env.AI || typeof env.AI.run !== "function") return kept;
  try {
    if (REC_EMB.rev !== BANK_REV || !REC_EMB.vecs.length) { const passages = recordPassages(); REC_EMB = { rev: BANK_REV, passages, vecs: await embedTexts(env, passages) }; }
    const cand = kept.slice(0, 120).concat(near.slice(0, 80));
    if (!cand.length) return kept;
    const vecs = await embedTexts(env, cand.map(postingText));
    let boosted = 0, rescued = 0;
    cand.forEach((j, i) => {
      const { sim, i: pi } = bestSim(vecs[i], REC_EMB.vecs);
      const line = REC_EMB.passages[pi] || "";
      if (j.match) {
        if (sim >= SEM_BOOST) { j.match.score += Math.min(12, Math.round((sim - SEM_BOOST) * 60)); j.match.why.push("close in meaning to your record (" + sim.toFixed(2) + "): " + line.slice(0, 80)); boosted++; }
        return;
      }
      if (sim < SEM_RESCUE) return;
      const [gate, locNote] = locationGate(j.location, String(j.desc || "").slice(0, 3000), ctx);
      if (gate === "fail") return;
      const flags = gate === "check" ? ["LOCATION: " + locNote] : [];
      j.match = { status: "ok", score: Math.min(64, 40 + Math.round((sim - SEM_RESCUE) * 120)), tier: "B", clusters: [], unique: false, stretch: false, flags,
        why: ["close in meaning to your record, not in words (" + sim.toFixed(2) + "): " + line.slice(0, 80)] };
      kept.push(j); rescued++;
    });
    kept.sort((a, b) => b.match.score - a.match.score);
    console.log(JSON.stringify({ worker: "qnfo-jobsearch", event: "semantic-lens", embedded: cand.length, boosted, rescued }));
  } catch (e) { logErr("semantic-lens", e); }
  return kept;
}
function parseRerank(text, n) {
  const s = String(text || ""), a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let o; try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  if (!o || !Array.isArray(o.order) || o.order.length !== n) return null;
  const seen = new Set(), order = [];
  for (const v of o.order) {
    const k = Number(v);
    if (!Number.isInteger(k) || k < 1 || k > n || seen.has(k)) return null;
    seen.add(k); order.push(k - 1);
  }
  const reasons = {};
  if (o.reasons && typeof o.reasons === "object") for (const [k, v] of Object.entries(o.reasons)) { const i = Number(k) - 1; if (Number.isInteger(i) && i >= 0 && i < n && typeof v === "string") reasons[i] = v; }
  return { order, reasons };
}
// a reason the model wrote is displayed only when it makes no claim the posting does not make
function reasonOk(reason, job) {
  const r = String(reason == null ? "" : reason).replace(/\s+/g, " ").trim();
  if (r.length < 8 || r.length > 240) return null;
  if (/[<>`{}\[\]\\]|https?:|www\./i.test(r)) return null;
  if (/\b(i|i'm|i've|me|my|we|our|you|your|you're|candidate|applicant|owner)\b/i.test(r)) return null;
  const corpus = [job.title, job.company, job.location, String(job.desc || "").slice(0, 4000), job.match && Number.isFinite(job.match.score) ? "score " + job.match.score : "", ...((job.match && job.match.why) || [])].join(" ").toLowerCase();   // the posting's own score is data the model was given, so a reason may repeat it (the first live reasons all said "score of 80" and were all dropped)
  for (const m of r.matchAll(/\d[\d.,%+]*/g)) if (!corpus.includes(m[0].replace(/[.,]+$/, "").toLowerCase())) return null;
  const words = r.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^[("']+|[)"'.,;:!?]+$/g, "");
    const acronym = /^[A-Z]{2,}$/.test(w), proper = i > 0 && /^[A-Z][a-z]{2,}$/.test(w) && !/[.!?:]$/.test(words[i - 1]);
    if ((acronym || proper) && !corpus.includes(w.toLowerCase())) return null;
  }
  return r;
}
// Two ways to ask, in this order. (1) The Workers AI binding: the same model the router would pick, one hop, about 11 s for 25 postings (measured 2026-11-05 with the REST API:
// 800 completion tokens, no reasoning tokens at effort low). (2) The qnfo-ai router through the QNFO_AI service binding, used only when the binding is missing or the call fails: its
// first live answer (2026-11-05 03:16Z) was HTTP 502 after about 38 s, which is why the AI binding comes first. The text of the answer is the same JSON either way.
function aiText(w) {
  return (w && (typeof w.response === "string" ? w.response : (w.choices && w.choices[0] && w.choices[0].message && w.choices[0].message.content))) || "";
}
async function rerankAskAi(env, messages) {
  let timer;
  const run = env.AI.run(RERANK_MODEL, { messages, max_tokens: 2000, temperature: 0, reasoning_effort: "low" });
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("ai timeout"), { code: "ai-timeout" })), 45000); });
  try { return aiText(await Promise.race([run, limit])); } finally { clearTimeout(timer); }
}
async function rerankAskRouter(env, messages) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 45000);
  try {
    const r = await env.QNFO_AI.fetch("https://qnfo-ai.internal/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json" }, signal: ac.signal,
      body: JSON.stringify({ model: RERANK_MODEL, messages, max_tokens: 2000, temperature: 0, stream: false }),
    });
    if (!r.ok) throw Object.assign(new Error("http " + r.status), { code: "http-" + r.status });
    return aiText(await r.json());
  } finally { clearTimeout(t); }
}
async function rerankAsk(env, messages) {
  let first = null;
  if (env.AI && typeof env.AI.run === "function") {
    try { const text = await rerankAskAi(env, messages); if (text) return { text, via: "ai" }; first = Object.assign(new Error("empty answer"), { code: "ai-empty" }); }
    catch (e) { logErr("llm-rerank-ai", e); first = e; }
  }
  if (env.QNFO_AI && typeof env.QNFO_AI.fetch === "function") return { text: await rerankAskRouter(env, messages), via: "router" };
  throw first || Object.assign(new Error("no binding"), { code: "no-binding" });
}
// returns {kept, status, via}; status is one of no-binding, empty, ok, reordered, bad-answer, ai-timeout, ai-empty, http-NNN, error
async function llmRerankRun(env, kept) {
  const hasAi = env.AI && typeof env.AI.run === "function", hasRouter = env.QNFO_AI && typeof env.QNFO_AI.fetch === "function";
  if (!hasAi && !hasRouter) return { kept, status: "no-binding" };
  if (kept.length < 2) return { kept, status: "empty" };
  const top = kept.slice(0, RERANK_TOP), rest = kept.slice(RERANK_TOP);
  let asked;
  try { asked = await rerankAsk(env, rerankMessages(top)); }
  catch (e) { logErr("llm-rerank", e); return { kept, status: (e && e.code) || "error" }; }
  const p = parseRerank(asked.text, top.length);
  if (!p) return { kept, status: "bad-answer", via: asked.via };
  const next = p.order.map((i) => top[i]);
  next.forEach((j, k) => { j.match.why = (j.match.why || []).concat(["LLM: rank " + (k + 1) + " of " + next.length]); });   // the owner sees what the AI changed
  for (const [i, reason] of Object.entries(p.reasons)) {
    const ok = reasonOk(reason, top[i]);
    if (ok) top[i].match.why = (top[i].match.why || []).concat(["LLM: " + ok]);
  }
  return { kept: next.concat(rest), status: p.order.every((v, i) => v === i) ? "ok" : "reordered", via: asked.via };
}
async function llmRerank(env, kept) {
  try {
    const r = await llmRerankRun(env, kept);
    try { await setMeta(env, "rerank_status", r.status); await setMeta(env, "rerank_via", r.via || "none"); await setMeta(env, "rerank_at", new Date().toISOString()); } catch (e) { logErr("llm-rerank-status", e); }
    return r.kept;
  } catch (e) { logErr("llm-rerank", e); return kept; }   // any failure: the deterministic order stands
}
// JOBSEARCH-TAILOR-2: the model judge reads the top postings of each run. Its matched facts tailor the stored resume, and a backed reading
// (two or more matched facts, fit 60+) lifts a posting the title rubric capped at 49, so a role in your lane under a generic title is not buried.
async function judgeTop(env, kept, n = 8) {
  const out = kept.slice();
  let done = 0, lifted = false;
  for (const j of out) {
    if (done >= n) break;
    if (!j.desc || j.match.tier === "C") continue;
    done++;
    let r = null; try { r = await judgeJob(env, j); } catch (e) { logErr("judge-run", e); }
    if (!r) continue;
    j.match.judge = r;
    j.match.why = (j.match.why || []).concat(["AI read: fit " + r.fit + " (" + r.matched_fact_ids.length + " of your facts match)"]);
    if (r.fit >= 60 && r.matched_fact_ids.length >= 2 && j.match.score < r.fit) { j.match.score = Math.min(r.fit, 69); lifted = true; if (j.match.tier === "C") j.match.tier = "B"; }
  }
  return lifted ? out.sort((a, b) => b.match.score - a.match.score) : out;   // the AI reorder stands unless a posting was lifted
}
function artifactsFor(j) {
  const res = buildResume(j, j.match), note = buildNote(j, j.match);
  const v = verify(res, j).concat(verify(note, j));
  return v.length ? { verified: 0, blocked: v.join("; "), resume: null, note: null } : { verified: 1, blocked: null, resume: stripTags(res), note: stripTags(note) };
}
// ------------------------------------------------------------------ preferences, feedback, "check a job" (JOBSEARCH-PROFILE-1)
async function loadCtx(env) {
  await ensure(env);
  await loadBank(env);
  let answers = {};
  const row = await env.JOBS_DB.prepare("SELECT v FROM jobsearch_prefs WHERE k='survey'").first();
  if (row) { try { answers = JSON.parse(row.v) || {}; } catch (e) { logErr("prefs-parse", e); } }
  const fb = (await env.JOBS_DB.prepare("SELECT title, company, verdict, reason FROM jobsearch_feedback ORDER BY id DESC LIMIT 800").all()).results;
  const applied = (await env.JOBS_DB.prepare(
    `SELECT m.tier, m.score, e.ts AS applied_at, e.note,
       EXISTS (SELECT 1 FROM jobsearch_events r WHERE r.match_id=e.match_id AND r.event IN ('replied','interview','offer') AND r.ts >= e.ts) AS replied
     FROM jobsearch_events e
     JOIN jobsearch_matches m ON m.id=e.match_id
     WHERE e.event='applied'
       AND e.id=(SELECT a.id FROM jobsearch_events a WHERE a.match_id=e.match_id AND a.event='applied' ORDER BY a.ts, a.id LIMIT 1)`
  ).all()).results;
  const outcomeRows = applied.flatMap((application) => {
    const snapshot = parseApplicationSnapshot(application.note);
    return snapshot ? [{ features: snapshot.features, applied_ms: Date.parse(application.applied_at), replied: !!application.replied }] : [];
  });
  return makeCtx(answers, fb, outcomeScoreWeights(outcomeRows), OWNED);
}
async function getMeta(env, k) { const r = await env.JOBS_DB.prepare("SELECT v FROM jobsearch_meta WHERE k=?").bind(k).first(); return r ? r.v : null; }
const REASONS = ["field", "coding", "level", "location", "company", "applied", "other"];   // JOBSEARCH-FIT-1: "coding" = too much hands-on code
async function addFeedback(env, title, company, verdict, source, reason = null) {
  await env.JOBS_DB.prepare("INSERT INTO jobsearch_feedback (ts, title, company, verdict, source, reason) VALUES (?1,?2,?3,?4,?5,?6)").bind(new Date().toISOString(), String(title || "").slice(0, 200), String(company || "").slice(0, 120), verdict, source, REASONS.includes(reason) ? reason : null).run();
}
const TECH_TERMS = ["python", "sql", "r ", "tableau", "power bi", "looker", "aws", "azure", "gcp", "kubernetes", "docker", "spark", "snowflake", "dbt", "airflow", "salesforce", "jira", "sap", "workday", "java", "javascript", "typescript", "react", "golang", "rust", "c++", "scala", "stata", "spss", "sas", "arcgis", "qgis", "postgis", "terraform", "excel", "agile", "scrum", "prince2", "six sigma", "lean", "safe"];
function gapsFor(desc) {
  const d = " " + (desc || "").toLowerCase() + " ";
  const mentioned = TECH_TERMS.filter((t) => new RegExp("[^a-z]" + escRe(t.trim()) + "[^a-z]").test(d));
  const notInLedger = mentioned.filter((t) => !LEDGER_SKILLS.includes(t.trim()));
  const out = [];
  if (notInLedger.length) out.push("named in the posting but not in your ledger (add to the ledger if you have it): " + notInLedger.slice(0, 8).join(", "));
  const yrs = [...d.matchAll(/(\d{1,2})\+?\s*(?:or more )?years/g)].map((m) => +m[1]);
  if (yrs.length) out.push(`mentions ${Math.max(...yrs)} years of experience; your record spans ${new Date().getUTCFullYear() - Number(LEDGER.person.career_start)} years (since ${LEDGER.person.career_start})`);
  if (/ph\.?d/.test(d)) out.push("mentions a PhD; you hold an M.S. and a B.A.");
  if (/\bmba\b/.test(d)) out.push("mentions an MBA; not in your ledger");
  return out;
}
function jsonLdPosting(html) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1]); } catch (e) { continue; }
    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const o = stack.shift();
      if (!o || typeof o !== "object") continue;
      if (o["@graph"]) stack.push(...(Array.isArray(o["@graph"]) ? o["@graph"] : [o["@graph"]]));
      const type = [].concat(o["@type"] || []).join(",");
      if (/JobPosting/i.test(type)) {
        const loc = [].concat(o.jobLocation || []).map((l) => (l && l.address ? [l.address.addressLocality, l.address.addressRegion, l.address.addressCountry && (l.address.addressCountry.name || l.address.addressCountry)].filter(Boolean).join(", ") : "")).filter(Boolean).join(" | ");
        const remote = /TELECOMMUTE/i.test(JSON.stringify(o.jobLocationType || "")) ? " (Remote)" : "";
        return { title: o.title || "", company: (o.hiringOrganization && (o.hiringOrganization.name || o.hiringOrganization)) || "", location: (loc + remote).trim(), desc: stripHtml(o.description || "") };
      }
    }
  }
  return null;
}
async function fetchPosting(rawUrl) {
  let u; try { u = new URL(rawUrl); } catch (e) { throw new Error("not a valid URL"); }
  if (u.protocol !== "https:") throw new Error("only https links are read");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) throw new Error("that host is not a public website");
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(u.toString(), { headers: { "user-agent": "Mozilla/5.0 (compatible; qnfo-jobsearch/1.3; +https://qnfo.org)", accept: "text/html,application/xhtml+xml,application/json" }, signal: ac.signal, redirect: "follow" });
    if (!r.ok) throw new Error("the page answered HTTP " + r.status + "; paste the posting text instead");
    const html = (await r.text()).slice(0, 2000000);
    const ld = jsonLdPosting(html);
    if (ld && ld.desc) return { ...ld, url: u.toString() };
    const title = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<title[^>]*>([^<]+)/i) || [])[1] || "";
    const company = (html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) || [])[1] || u.hostname.replace(/^www\./, "");
    const body = stripHtml(html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")).slice(0, 30000);
    if (body.length < 400) throw new Error("the page has no readable text (it is probably built in the browser); paste the posting text instead");
    return { title: decodeEntities(title).trim(), company, location: "", desc: body, url: u.toString() };
  } finally { clearTimeout(t); }
}
// JOBSEARCH-HEADLINE-1: the owner pasted postings he is qualified for and the keyword rubric called them weak. When the model reading is at least 25 points higher and
// names two or more record facts that back it, the headline follows the model reading and says so; the rubric verdict stays in the answer beside it.
const fitWord = (f) => (f >= 70 ? "strong fit" : f >= 45 ? "good fit" : f >= 35 ? "possible fit" : "weak fit");
function headlineVerdict(rubricFit, judge) {
  const backed = judge && Number.isFinite(+judge.fit) && Array.isArray(judge.matched_fact_ids) && judge.matched_fact_ids.length >= 2;
  if (backed && +judge.fit - rubricFit >= 25) return { verdict: fitWord(+judge.fit), source: "model reading (rubric said " + fitWord(rubricFit) + ")" };
  return { verdict: fitWord(rubricFit), source: "rubric" };
}
async function analyzeJob(env, body) {
  const ctx = await loadCtx(env);   // also loads the CV bank
  let p = { title: body.title || "", company: body.company || "", location: body.location || "", desc: "", url: "" };
  const input = String(body.input || body.text || body.url || "").trim();
  if (!input) throw Object.assign(new Error("paste a job link or the posting text"), { status: 400 });
  if (/^https?:\/\/\S+$/.test(input)) { p = { ...p, ...(await fetchPosting(input)) }; if (body.title) p.title = body.title; if (body.company) p.company = body.company; if (body.location) p.location = body.location; }
  else { p.desc = input.slice(0, 40000); if (!p.location) { const lm = input.match(/\b(?:location|locatie|werklocatie)\s*:\s*([^\n.;|]{2,90})/i); if (lm) p.location = lm[1].trim(); } if (!p.title) { const first = (input.split("\n").find((l) => l.trim()) || "").trim(); p.title = (first.length > 80 ? first.split(/[.:;|]\s/)[0] : first).slice(0, 140); } }
  if (!p.title) throw Object.assign(new Error("could not find the job title; add it in the title box"), { status: 400 });
  const job = { id: "check:" + (await sha256hex(p.title + p.company + p.desc.slice(0, 200))).slice(0, 12), source: "check", company: p.company || "the employer", title: p.title, location: p.location, url: p.url, desc: p.desc };
  const sc = scoreJob(job, ctx, "analyze");
  const verdict = sc.fit >= 70 ? "strong fit" : sc.fit >= 45 ? "good fit" : sc.fit >= 35 ? "possible fit" : "weak fit";
  const strengths = pickFacts(sc.clusters, 5).map((f) => ({ id: f.id, text: f.text }));
  let judge = null; try { judge = await judgeJob(env, job); } catch (e) { logErr("judge", e); }   // JOBSEARCH-JUDGE-1: fail-soft, the rubric answer stands without it
  const m = { clusters: sc.clusters, judge };
  const res = buildResume(job, m), note = buildNote(job, m), bad = verify(res, job).concat(verify(note, job));
  const cvGaps = sc.clusters.filter((c) => !OWNED.has(c)).map((c) => ({ cluster: c, questions: QUESTIONS.filter((q) => clustersOf(q.tags).includes(c)).slice(0, 4).map((q) => ({ id: q.id, ask: q.ask })) }));
  const draft = bad.length ? { blocked: bad.join("; ") } : { resume: stripTags(res), note: stripTags(note) };
  const kit = bad.length ? null : applyKit(job, stripTags(res), stripTags(note), sc.flags);
  const keywords = keywordReport(job, res);
  try { await saveHistory(env, { title: job.title, company: job.company, url: job.url, fit: sc.fit, verdict, resume: draft.resume, note: draft.note }); } catch (e) { logErr("history", e); }
  return {
    title: job.title, company: job.company, location: job.location || "(not found; judged on the text)", url: job.url, cv_gaps: cvGaps,
    verdict: headlineVerdict(sc.fit, judge).verdict, verdict_source: headlineVerdict(sc.fit, judge).source, rubric_verdict: verdict, fit_score: sc.fit, score_after_preferences: sc.score,
    would_appear_in_your_search: sc.drops.length ? false : sc.tier !== "C" || sc.score >= 25,
    why_not_in_search: sc.drops.length ? sc.drops : sc.tier === "C" ? ["score below the cut after location and level adjustments"] : [],
    why: sc.why, flags: sc.flags, strengths, gaps: gapsFor(job.desc),
    draft, keywords, apply: kit, judge,
    second_opinion: judge ? (Math.abs(judge.fit - sc.fit) >= 25 ? "the model reading and the rubric disagree by 25 points or more: tell /api/calibrate which one is right" : "the model reading and the rubric agree") : "model reading unavailable; rubric only",
  };
}
// ------------------------------------------------------------------ JOBSEARCH-JUDGE-1 / PDF-1 / ANSWERS-1 / PREP-1 (1.9.0)
// Owner brief 2026-11-06: matches the owner is qualified for scored "weak" (the keyword rubric knows title lists, not the record), no free-response
// help, no PDF, no interview preparation. Research basis: docs/JOBSEARCH-RESEARCH-2026-11.md. Every AI answer here is fail-soft: the rubric,
// the verified resume and the existing routes keep working when the model is unavailable.
const PROTECTED_Q = /(work authori[sz]ation|authori[sz]ed to work|right to work|sponsor|visa|salary|compensation|pay expectation|expected pay|desired pay|gender|race|ethnic|disabilit|veteran|pronoun|date of birth|criminal|conviction|background check|security clearance|citizenship|marital|religio)/i;
const bankDigest = () => {
  const b = BANK;
  const roles = (b.roles || []).map((r) => `${r.title}, ${r.org} (${rolePeriod(r)})`).join("; ");
  const facts = (LEDGER.facts || []).slice(0, 45).map((f) => `[${f.id}] ${f.text}`).join("\n");
  const pubs = (b.publications || []).slice(0, 10).map((p) => pubLine(p)).join("\n");
  const skills = (b.skills || []).map((s) => s.name).join(", ");
  return `NAME: ${P.name}\nLOCATION: ${P.location}\nSUMMARY: ${((b.summaries || [])[0] || {}).text || ""}\nROLES: ${roles}\nFACTS:\n${facts}\nWORK:\n${pubs}\nSKILLS: ${skills}\nEDUCATION: ${(b.education || []).join("; ")}`;
};
const jsonLoose = (t) => {
  const s = String(t || ""), a = s.indexOf("{"), z = s.lastIndexOf("}");
  if (a < 0 || z <= a) return null;
  try { return JSON.parse(s.slice(a, z + 1)); } catch (e) { logErr("json-loose", e); return null; }
};
async function postingFrom(env, body) {
  let p = { title: body.title || "", company: body.company || "", location: body.location || "", desc: "", url: "" };
  const input = String(body.input || body.text || body.url || "").trim();
  if (!input) throw Object.assign(new Error("paste a job link or the posting text"), { status: 400 });
  if (/^https?:\/\/\S+$/.test(input)) { p = { ...p, ...(await fetchPosting(input)) }; if (body.title) p.title = body.title; if (body.company) p.company = body.company; }
  else { p.desc = input.slice(0, 40000); if (!p.title) p.title = (input.split("\n").find((l) => l.trim()) || "").trim().slice(0, 120); }
  if (!p.desc && !p.title) throw Object.assign(new Error("could not read the posting"), { status: 422 });
  return p;
}
const askModel = async (env, system, user, tokens = 1800) => {
  const r = await rerankAsk(env, [{ role: "system", content: system }, { role: "user", content: user.slice(0, 16000) }]);
  return r.text;
};
// JOBSEARCH-JUDGE-1: an LLM reads the whole posting against the whole record; the rubric score stays beside it so disagreement is visible and measurable.
const JUDGE_SYSTEM = "You judge how well one candidate fits one job posting. Use ONLY the candidate record given; never assume a skill, employer, degree or number that is not in it. Weigh transferable evidence (a title absent from the record is not a gap when the work is there). Location: the candidate lives in Amsterdam and can take Netherlands, remote-in-Europe or remote-worldwide roles. Reply with one JSON object and nothing else: {\"fit\":0-100,\"verdict\":\"strong|good|possible|weak\",\"reasons\":[up to 4 short strings],\"gaps\":[up to 4 short strings],\"matched_fact_ids\":[ids from the record],\"location_ok\":true|false}.";
async function judgeJob(env, job) {
  const txt = await askModel(env, JUDGE_SYSTEM, `CANDIDATE RECORD\n${bankDigest()}\n\nPOSTING\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n${String(job.desc || "").slice(0, 7000)}`);
  const j = jsonLoose(txt);
  if (!j || !Number.isFinite(+j.fit)) return null;
  const known = new Set((LEDGER.facts || []).map((f) => f.id));
  return { fit: Math.max(0, Math.min(100, Math.round(+j.fit))), verdict: String(j.verdict || ""), reasons: (j.reasons || []).slice(0, 4).map(String), gaps: (j.gaps || []).slice(0, 4).map(String), matched_fact_ids: (j.matched_fact_ids || []).filter((x) => known.has(x)), location_ok: j.location_ok !== false };
}
// JOBSEARCH-ANSWERS-1: free-response drafts built from the record only; protected questions are left to the owner; every number and tool name is re-checked.
const ANSWER_SYSTEM = "You draft one answer to a job application question for the candidate, in first person, plain and specific. Rules: use ONLY facts in the candidate record; no invented numbers, employers, tools or dates; answer the question in the first sentence, then give one or two concrete pieces of evidence that match what the posting asks for; never write 'see resume'; no filler praise of the employer; respect any word or character limit in the question, otherwise 90 to 160 words. Reply with the answer text only.";
function checkAnswer(text, job) {
  const problems = [];
  const allowed = new Set([...nums(JSON.stringify(BANK)), ...nums(job.title), ...nums(job.company), ...nums(job.desc || "")]);
  const trim = new Set([...allowed].map((x) => x.replace(/[.,]+$/, "")));
  for (const n of nums(text)) if (!trim.has(n.replace(/[.,]+$/, "")) && !allowed.has(n)) problems.push("number not in your record: " + n);
  const low = String(text).toLowerCase(), rec = LEDGER_LOW + " " + String(job.desc || "").toLowerCase();
  for (const f of FORBIDDEN) if (kwRe(f).test(low) && !rec.includes(f)) problems.push("tool or claim not in your record: " + f);
  if (/see (my )?(resume|cv)/i.test(text)) problems.push("answer refers to the resume instead of answering");
  return problems;
}
async function draftAnswers(env, body) {
  await loadCtx(env);
  const job = await postingFrom(env, body), qs = (Array.isArray(body.questions) ? body.questions : [body.question]).map((q) => String(q || "").trim()).filter(Boolean).slice(0, 12);
  if (!qs.length) throw Object.assign(new Error("send questions: [\"...\"]"), { status: 400 });
  const out = [];
  for (const q of qs) {
    if (PROTECTED_Q.test(q)) { out.push({ question: q, status: "owner_only", answer: null, note: "work authorization, pay, demographic and legal questions are answered by you, never drafted" }); continue; }
    try {
      const text = (await askModel(env, ANSWER_SYSTEM, `CANDIDATE RECORD\n${bankDigest()}\n\nPOSTING\n${job.title} at ${job.company}\n${String(job.desc || "").slice(0, 5000)}\n\nQUESTION\n${q}`)).trim();
      if (!text) { out.push({ question: q, status: "model_empty", answer: null }); continue; }
      const problems = checkAnswer(text, job);
      out.push({ question: q, status: problems.length ? "needs_review" : "draft", answer: text, problems });
    } catch (e) { logErr("answers", e); out.push({ question: q, status: "model_unavailable", answer: null }); }
  }
  return { title: job.title, company: job.company, answers: out };
}
// JOBSEARCH-PREP-1: role brief, story picks and a question bank for one posting, then answer-by-answer feedback.
const PREP_SYSTEM = "You prepare one candidate for an interview. Use ONLY the candidate record given; never invent an achievement. Reply with one JSON object and nothing else: {\"role_summary\":\"two sentences\",\"what_they_need\":[up to 6 strings],\"what_you_offer\":[{\"point\":\"string\",\"fact_ids\":[record ids]}],\"gaps\":[{\"gap\":\"string\",\"honest_framing\":\"string\"}],\"stories\":[{\"theme\":\"string\",\"fact_ids\":[ids],\"outline\":\"situation, task, action, result as one short paragraph using only record facts\"}],\"likely_questions\":[{\"q\":\"string\",\"type\":\"behavioral|motivational|role|curveball\",\"angle\":\"string\"}],\"scorecard_attributes\":[up to 6 objects {\"attribute\":\"a trait or skill interviewers are likely to rate for this role, taken from the posting\",\"story_theme\":\"the theme of the story that proves it, or empty if none\"}],\"questions_to_ask\":[up to 4 strings]}. Give 5 to 6 stories and 10 to 12 likely questions.";
async function prepBrief(env, body) {
  await loadCtx(env);
  const job = await postingFrom(env, body);
  const j = jsonLoose(await askModel(env, PREP_SYSTEM, `CANDIDATE RECORD\n${bankDigest()}\n\nPOSTING\n${job.title} at ${job.company}\n${job.location || ""}\n${String(job.desc || "").slice(0, 7000)}`, 2600));
  if (!j) throw Object.assign(new Error("the model gave no usable brief; try again"), { status: 502 });
  const known = new Set((LEDGER.facts || []).map((f) => f.id)), keep = (a) => (a || []).filter((x) => known.has(x));
  return { title: job.title, company: job.company, role_summary: String(j.role_summary || ""), what_they_need: (j.what_they_need || []).slice(0, 6).map(String),
    what_you_offer: (j.what_you_offer || []).slice(0, 8).map((o) => ({ point: String(o.point || ""), fact_ids: keep(o.fact_ids) })),
    gaps: (j.gaps || []).slice(0, 6).map((g) => ({ gap: String(g.gap || ""), honest_framing: String(g.honest_framing || "") })),
    stories: (j.stories || []).slice(0, 6).map((s) => ({ theme: String(s.theme || ""), fact_ids: keep(s.fact_ids), outline: String(s.outline || "") })),
    likely_questions: (j.likely_questions || []).slice(0, 12).map((q) => ({ q: String(q.q || ""), type: String(q.type || ""), angle: String(q.angle || "") })),
    scorecard_attributes: (j.scorecard_attributes || []).slice(0, 6).map((x) => ({ attribute: String(x.attribute || ""), story_theme: String(x.story_theme || "") })),
    questions_to_ask: (j.questions_to_ask || []).slice(0, 4).map(String) };
}
const QUIZ_SYSTEM = "You are a strict, kind interview coach. Score the candidate's spoken answer to the question from 1 to 5 for relevance, evidence, structure and length (60 to 120 seconds spoken). Use the candidate record to point out stronger true evidence they left out, and flag any claim in the answer that the record does not support. Reply with one JSON object and nothing else: {\"score\":1-5,\"strengths\":[up to 3],\"fixes\":[up to 4],\"unsupported_claims\":[strings],\"stronger_outline\":\"2 to 4 sentences using only record facts\",\"follow_up\":\"the likely follow-up question\"}.";
async function quizFeedback(env, body) {
  await loadCtx(env);
  const q = String(body.question || "").trim(), a = String(body.answer || "").trim();
  if (!q || !a) throw Object.assign(new Error("send question and answer"), { status: 400 });
  const j = jsonLoose(await askModel(env, QUIZ_SYSTEM, `CANDIDATE RECORD\n${bankDigest()}\n\nROLE\n${String(body.role || "").slice(0, 300)}\n\nQUESTION\n${q}\n\nANSWER\n${a.slice(0, 4000)}`));
  if (!j || !Number.isFinite(+j.score)) throw Object.assign(new Error("the model gave no usable feedback; try again"), { status: 502 });
  return { score: Math.max(1, Math.min(5, Math.round(+j.score))), strengths: (j.strengths || []).slice(0, 3).map(String), fixes: (j.fixes || []).slice(0, 4).map(String), unsupported_claims: (j.unsupported_claims || []).map(String), stronger_outline: String(j.stronger_outline || ""), follow_up: String(j.follow_up || "") };
}
// JOBSEARCH-CALIBRATE-1: the owner's verdict on a posting (qualified / stretch / not_qualified) is stored beside the rubric score and the judge score, so agreement is measured, not argued.
async function calibrate(env, b) {
  const v = String(b.owner || ""); if (!["qualified", "stretch", "not_qualified"].includes(v)) throw Object.assign(new Error("owner must be qualified, stretch or not_qualified"), { status: 400 });
  await env.JOBS_DB.prepare("INSERT INTO jobsearch_calib (ts, title, company, rubric_fit, judge_fit, owner) VALUES (?1,?2,?3,?4,?5,?6)").bind(new Date().toISOString(), String(b.title || "").slice(0, 200), String(b.company || "").slice(0, 120), Number.isFinite(+b.rubric_fit) ? +b.rubric_fit : null, Number.isFinite(+b.judge_fit) ? +b.judge_fit : null, v).run();
  return { ok: true };
}
async function calibration(env) {
  const rows = (await env.JOBS_DB.prepare("SELECT title, company, rubric_fit, judge_fit, owner, ts FROM jobsearch_calib ORDER BY id DESC LIMIT 500").all()).results;
  const want = (r) => (r.owner === "qualified" ? 1 : r.owner === "stretch" ? 0.5 : 0), got = (f) => (f >= 60 ? 1 : f >= 40 ? 0.5 : 0);
  const rate = (k) => { const l = rows.filter((r) => r[k] !== null); return l.length ? Math.round((100 * l.filter((r) => got(r[k]) === want(r)).length) / l.length) : null; };
  return { n: rows.length, rubric_agreement_pct: rate("rubric_fit"), judge_agreement_pct: rate("judge_fit"), misses: rows.filter((r) => r.rubric_fit !== null && got(r.rubric_fit) < want(r)).slice(0, 20) };
}
// JOBSEARCH-PDF-1: a text PDF written directly (one column, real selectable text, standard Helvetica, no images, tables or text boxes), the layout ATS parsers read reliably.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
function pdfClean(s) {
  return String(s || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/•/g, "-").replace(/ /g, " ").replace(/…/g, "...")
    .replace(/[^\x00-\xff]/g, (c) => { const d = c.normalize("NFD").replace(/[̀-ͯ]/g, ""); return /^[\x20-\x7e]+$/.test(d) ? d : "?"; });
}
const pdfW = (s, size, bold) => { let w = 0; for (const ch of s) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126 ? HELV[c - 32] : 556); } return (w * size * (bold ? 1.06 : 1)) / 1000; };
function pdfWrap(text, size, bold, width) {
  const out = []; let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const t = line ? line + " " + word : word;
    if (line && pdfW(t, size, bold) > width) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}
function pdfOf(md, title) {
  const W = 595.28, H = 841.89, M = 54, TW = W - 2 * M, pages = [[]];
  let y = H - M;
  const esc = (s) => pdfClean(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const cur = () => pages[pages.length - 1];
  const need = (h) => { if (y - h < M) { pages.push([]); y = H - M; } };
  const text = (s, x, size, bold) => { cur().push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(s)}) Tj ET`); };
  for (const raw of plainOfKeepBold(md).split("\n")) {
    const l = pdfClean(raw.trimEnd()).replace(/\*\*/g, "");
    if (!l.trim()) { y -= 4; continue; }
    if (l.startsWith("# ")) { need(30); y -= 20; text(l.slice(2), M, 20, true); y -= 6; continue; }
    if (l.startsWith("## ")) { need(30); y -= 10; text(l.slice(3).toUpperCase(), M, 11, true); y -= 4; cur().push(`0.5 w ${M} ${(y).toFixed(2)} m ${(W - M).toFixed(2)} ${y.toFixed(2)} l S`); y -= 10; continue; }
    const bullet = l.startsWith("- "), body = bullet ? l.slice(2) : l, indent = bullet ? 14 : 0, size = 10, lead = 13;
    const strong = !bullet && /^\*\*/.test(raw.trim());   // a role line is set in bold
    const lines = pdfWrap(body, size, strong, TW - indent);
    need(lead * Math.min(lines.length, 2));
    lines.forEach((ln, i) => { need(lead); y -= lead; if (bullet && i === 0) text("-", M + 2, size, false); text(ln, M + indent, size, strong); });
  }
  const objs = [], add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(""), pagesObj = add(""), f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  for (const pg of pages) {
    const content = pg.join("\n"), c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${esc(title || "Resume")}) /Author (${esc(P.name)}) /Producer (qnfo-jobsearch) >>`);
  let out = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const u8 = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
  return u8;
}
// ------------------------------------------------------------------ one-click apply (JOBSEARCH-APPLY-1, 1.7.0)
// Research basis (docs/JOBS-APPLY.md): ATS parsers read single-column text with standard headings and read .docx or text PDF; the resume must echo the
// posting's own terms where the record backs them; fully unattended submission fails (employer-key APIs, captchas, attestations) and
// ranks as spam, so the page fills the form in the owner's own browser and the owner presses the final submit.
const ATS_RULES = [
  ["greenhouse", /^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/[^\/]+\/jobs\/\d+/i, (x) => x.replace(/[?#].*$/, "") + "#app", true],
  ["lever", /^https?:\/\/jobs(?:\.eu)?\.lever\.co\/[^\/]+\/[0-9a-f-]{20,}/i, (x) => x.replace(/[?#].*$/, "").replace(/\/(apply)?\/?$/, "") + "/apply", true],
  ["ashby", /^https?:\/\/jobs\.ashbyhq\.com\/[^\/]+\/[0-9a-f-]{20,}/i, (x) => x.replace(/[?#].*$/, "").replace(/\/application\/?$/, "") + "/application", true],
  ["workable", /^https?:\/\/apply\.workable\.com\/[^\/]+\/j\/[A-Z0-9]+/i, (x) => x.replace(/[?#].*$/, "").replace(/\/(apply)?\/?$/, "") + "/apply/", true],
  ["recruitee", /^https?:\/\/[^\/]+\.recruitee\.com\/o\/[^\/?#]+/i, (x) => x.replace(/[?#].*$/, "").replace(/\/c\/new\/?$/, "") + "/c/new", true],
  ["smartrecruiters", /^https?:\/\/jobs\.smartrecruiters\.com\//i, (x) => x, false],
  ["workday", /myworkdayjobs\.com\//i, (x) => x, false],
];

// Referral endpoint path
const REFERRAL_PATH = "/api/referrals";
export { REFERRAL_PATH, handleReferral };

/**
 * Handle referral requests: given a job posting, returns the apply URL (referral link).
 */
async function handleReferral(env, body) {
  const job = await postingFrom(env, body);
  const { apply_url } = atsOf(job.url);
  return { referral_url: apply_url };
}
function atsOf(rawUrl) {
  const u = String(rawUrl || "");
  for (const [ats, re, f, fill] of ATS_RULES) if (re.test(u)) return { ats, apply_url: f(u), fill };
  return { ats: "other", apply_url: u, fill: false };
}
// Terms an ATS keyword filter or a recruiter search is likely to use. A term the posting uses and the CV backs goes on the resume;
// a term the CV lacks is only reported (a gap), never written into a resume.
const TECH_VOCAB = ["python", "sql", "excel", "tableau", "power bi", "looker", "dbt", "airflow", "spark", "hadoop", "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "java", "javascript", "typescript", "react", "c++", "scala", "matlab", "sas", "stata", "spss", "arcgis", "qgis", "git", "jira", "salesforce", "snowflake", "databricks", "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "nlp", "llm", "machine learning", "deep learning", "statistics", "agile", "scrum", "okr", "kpi", "stakeholder management", "grant writing", "six sigma", "prince2", "pmp", "gdpr", "wcag", "roadmap", "forecasting", "a/b testing", "etl", "api"];
function cvCorpus() {
  const b = BANK;
  return [LEDGER.facts.map((f) => f.text), (b.skills || []).map((s) => s.name), (b.roles || []).map((r) => r.title + " " + r.org), (b.summaries || []).map((s) => s.text),
    (b.publications || []).map((p) => p.title), b.education || [], b.certifications || []].flat().join("\n").toLowerCase();
}
function vocabulary() {
  const vocab = new Map();
  for (const s of BANK.skills || []) vocab.set(s.name.toLowerCase(), "skill");
  for (const t of TECH_VOCAB) if (!vocab.has(t)) vocab.set(t, "tool");
  for (const kws of Object.values(CLUSTER_KW)) for (const k of kws) { const t = k.replace(/\*$/, "").trim(); if (t.length >= 5 && !vocab.has(t)) vocab.set(t, "topic"); }
  return vocab;
}
// the vocabulary terms the posting uses, by how often it uses them
function postingTerms(job) {
  const text = (job.title + "\n" + job.desc).toLowerCase(), out = [];
  for (const [term, kind] of vocabulary()) {
    const n = (text.match(new RegExp(kwRe(term).source, "g")) || []).length;
    if (n) out.push({ term, kind, count: n });
  }
  return out.sort((a, b) => b.count - a.count || (a.term < b.term ? -1 : 1));
}
// matched: on this resume. addable: the CV backs it, this resume left it out. missing: the CV does not have it (never inserted).
function keywordReport(job, resumeText) {
  const res = String(resumeText || "").replace(/ <!--.*?-->$/gm, "").toLowerCase(), cv = cvCorpus();
  const matched = [], addable = [], missing = [];
  for (const t of postingTerms(job)) {
    const re = kwRe(t.term), onResume = re.test(res), inCv = re.test(cv);
    (onResume ? matched : inCv ? addable : missing).push(t.term);
  }
  const total = matched.length + addable.length + missing.length;
  return { coverage: total ? Math.round((100 * matched.length) / total) : null, matched: matched.slice(0, 25), addable: addable.slice(0, 15), missing: missing.slice(0, 15), total };
}
// ---- export formats: plain text, printable HTML (save as PDF), and a minimal Word file (stored zip, no library)
const plainOf = (md) => String(md || "").replace(/ <!--.*?-->$/gm, "").replace(/\*\*/g, "").replace(/^#{1,3} /gm, "");
const mdInline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function resumeHtml(md, title) {
  const out = [];
  let inList = false;
  for (const raw of plainOfKeepBold(md).split("\n")) {
    const l = raw.trimEnd();
    if (/^- /.test(l)) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + mdInline(l.slice(2)) + "</li>"); continue; }
    if (inList) { out.push("</ul>"); inList = false; }
    if (!l.trim()) continue;
    if (l.startsWith("# ")) out.push("<h1>" + mdInline(l.slice(2)) + "</h1>");
    else if (l.startsWith("## ")) out.push("<h2>" + mdInline(l.slice(3)) + "</h2>");
    else out.push("<p>" + mdInline(l) + "</p>");
  }
  if (inList) out.push("</ul>");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@page{margin:18mm}body{font:11pt/1.4 Arial,Helvetica,sans-serif;color:#000;max-width:760px;margin:24px auto;padding:0 16px}h1{font-size:20pt;margin:0 0 4px}h2{font-size:11pt;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #000;margin:16px 0 6px;padding-bottom:2px}p{margin:3px 0}ul{margin:3px 0 8px;padding-left:18px}li{margin:2px 0}.np{margin-bottom:12px}@media print{.np{display:none}}</style></head><body><div class="np"><button onclick="print()">Save as PDF</button></div>${out.join("\n")}</body></html>`;
}
const plainOfKeepBold = (md) => String(md || "").replace(/ <!--.*?-->$/gm, "");
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStored(files) {
  const enc = new TextEncoder(), chunks = [], central = [];
  let off = 0;
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    chunks.push(new Uint8Array(lh.buffer), nm, data);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function docxOf(md) {
  const run = (text, bold, size) => `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>${bold ? "<w:b/>" : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
  const runs = (s, size, forceBold) => s.split(/(\*\*.+?\*\*)/).filter(Boolean).map((seg) => (/^\*\*.+\*\*$/.test(seg) ? run(seg.slice(2, -2), true, size) : run(seg, !!forceBold, size))).join("");
  const paras = [];
  for (const raw of plainOfKeepBold(md).split("\n")) {
    const l = raw.trimEnd();
    if (!l.trim()) continue;
    if (l.startsWith("# ")) paras.push(`<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>${runs(l.slice(2), 36, true)}</w:p>`);
    else if (l.startsWith("## ")) paras.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:before="200" w:after="80"/></w:pPr>${runs(l.slice(3).toUpperCase(), 22, true)}</w:p>`);
    else if (l.startsWith("- ")) paras.push(`<w:p><w:pPr><w:ind w:left="360" w:hanging="220"/><w:spacing w:after="40"/></w:pPr>${run("• ", false, 21)}${runs(l.slice(2), 21)}</w:p>`);
    else paras.push(`<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${runs(l, 21)}</w:p>`);
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipStored([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ["word/document.xml", doc],
  ]);
}
function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
const fileSlug = (s) => String(s || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
// The kit is what the owner's browser needs for one application: the apply link, the form fields the CV answers, the resume file, the note.
// Questions the form will ask that only the owner answers (work authorization, sponsorship, salary, demographics) are listed, never filled.
function applyKit(job, resumeMd, noteMd, flags) {
  const parts = String(P.name).trim().split(/\s+/), a = atsOf(job.url);
  const docx = docxOf(resumeMd);
  return {
    id: job.id || "", title: job.title, company: job.company, ats: a.ats, apply_url: a.apply_url, can_fill: a.fill,
    fields: { first_name: parts[0], last_name: parts[parts.length - 1], full_name: P.name, email: P.email, location: P.location, linkedin: (P.links || {}).linkedin || "", website: (P.links || {}).site || "" },
    resume_file: `${fileSlug(P.name)}_Resume_${fileSlug(job.company)}.docx`, resume_docx_b64: b64(docx), resume_pdf_file: `${fileSlug(P.name)}_Resume_${fileSlug(job.company)}.pdf`, resume_pdf_b64: b64(pdfOf(resumeMd, `${P.name}: resume for ${job.company}`)), note: plainOf(noteMd),
    left_for_you: ["work authorization and sponsorship", "salary expectations", "demographic and equal-opportunity questions", "any question about a skill your CV does not back"].concat((flags || []).filter((f) => /^(AUTH|LANGUAGE|DEGREE|YEARS)/.test(f))),
  };
}
// A match's kit is rebuilt from the posting as it reads now and the CV as it stands now (an edit to the CV since the run counts); when the page
// cannot be read the draft stored at match time is used.
async function matchKit(env, row) {
  const ctx = await loadCtx(env);   // also loads the CV bank
  let resume = row.resume_md, note = row.note_md, fresh = false, keywords = null, flags = [];
  const job = { id: row.id, company: row.company, title: row.title, location: row.location || "", url: row.url, desc: "" };
  try {
    const got = await fetchPosting(row.url);
    job.desc = got.desc || "";
    if (job.desc) {
      let judge = null; try { judge = await judgeJob(env, job); } catch (e) { logErr("judge", e); }
      const sc = scoreJob(job, ctx, "analyze"), res = buildResume(job, { clusters: sc.clusters, judge }), nt = buildNote(job, { clusters: sc.clusters });
      flags = sc.flags;
      keywords = keywordReport(job, res);
      if (!verify(res, job).concat(verify(nt, job)).length) { resume = stripTags(res); note = stripTags(nt); fresh = true; }
    }
  } catch (e) { logErr("kit-fetch", e); }
  if (!resume) throw Object.assign(new Error("no draft is kept for this match (rejected or old); use Check a job with its link"), { status: 404 });
  return { ...applyKit(job, resume, note, flags), fresh, keywords };
}
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
function fileResponse(kind, row) {
  const base = fileSlug(P.name) + "_Resume_" + fileSlug(row.company), cors = { "access-control-allow-origin": "*", "cache-control": "no-store" };
  if (kind === "resume.docx") return new Response(docxOf(row.resume_md), { headers: { ...cors, "content-type": DOCX_TYPE, "content-disposition": `attachment; filename="${base}.docx"` } });
  if (kind === "resume.pdf") return new Response(pdfOf(row.resume_md, `${P.name}: resume for ${row.company}`), { headers: { ...cors, "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"` } });
  if (kind === "resume.html") return new Response(resumeHtml(row.resume_md, `${P.name}: resume for ${row.company}`), { headers: { ...cors, "content-type": "text/html; charset=utf-8" } });
  if (kind === "resume.md") return new Response(row.resume_md, { headers: { ...cors, "content-type": "text/markdown; charset=utf-8" } });
  if (kind === "note.txt") return new Response(plainOf(row.note_md), { headers: { ...cors, "content-type": "text/plain; charset=utf-8" } });
  return new Response(plainOf(row.resume_md), { headers: { ...cors, "content-type": "text/plain; charset=utf-8" } });
}
// JOBSEARCH-FOLLOWUP-1: applications with no reply after 7 days (the status moves to no_reply on its own at 21), each with a short follow-up note.
// The note states only facts the owner supplied by pressing Mark applied: the role, the employer and the date.
// JOBSEARCH-REFERRAL-1: a referral is the strongest lever on whether an application is read. The fleet finds the people-search links and drafts a short message from
// verified facts; the owner picks a person who knows them and sends it from their own account (no scraping, no automated messages: LinkedIn terms).
const STAGES = ["recruiter_screen", "hiring_manager", "technical", "take_home", "panel", "final", "reference_check"];
function referralKit(row, ctx) {
  const job = { id: row.id, company: row.company, title: row.title, location: row.location || "", url: row.url, desc: "" };
  const sc = scoreJob(job, ctx, "analyze"), facts = pickFacts(sc.clusters, 2);
  const L = [tag("Hello,", "S"), "", tag(`I am applying for the ${job.title} role at ${job.company}.`, "J:title")];
  for (const f of facts) L.push(tag(f.pitch !== f.text ? f.pitch : "- " + f.text, "F:" + f.id));
  L.push("", tag(REFERRAL_ASK, "S"), "", tag("Best regards,", "S"), tag(P.name, "S"));
  const bad = verify(L.join("\n") + "\n", job);
  const q = encodeURIComponent(job.company);
  return {
    id: row.id, company: job.company, title: job.title,
    search_urls: [
      { label: "People who work at " + job.company, url: `https://www.linkedin.com/search/results/people/?keywords=${q}&network=%5B%22F%22%2C%22S%22%5D` },
      { label: "Recruiters at " + job.company, url: `https://www.linkedin.com/search/results/people/?keywords=${q}%20recruiter` },
    ],
    message: bad.length ? null : stripTags(L.join("\n") + "\n"), blocked: bad.length ? bad.join("; ") : null,
    left_for_you: ["choose a person who actually knows you or your field", "send it yourself from your own account"],
  };
}
async function referralList(env, ctx) {
  const rows = (await env.JOBS_DB.prepare("SELECT id, title, company, tier, score, status FROM jobsearch_matches WHERE verified=1 AND status IN ('pending_owner_approval','approved','applied') AND tier IN ('A','B') ORDER BY CASE tier WHEN 'A' THEN 0 ELSE 1 END, score DESC LIMIT 10").all()).results;
  return { count: rows.length, items: rows.map((r) => ({ id: r.id, title: r.title, company: r.company, tier: r.tier, status: r.status, referral: "/api/matches/" + encodeURIComponent(r.id) + "/referral" })) };
}
async function followups(env) {
  await ensure(env);
  const cut = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = (await env.JOBS_DB.prepare("SELECT m.id, m.title, m.company, m.url, MIN(e.ts) AS applied_at FROM jobsearch_matches m JOIN jobsearch_events e ON e.match_id=m.id AND e.event='applied' WHERE m.status='applied' GROUP BY m.id HAVING MIN(e.ts) <= ? ORDER BY MIN(e.ts) LIMIT 50").bind(cut).all()).results;
  await loadBank(env);
  const items = rows.map((r) => {
    const day = String(r.applied_at).slice(0, 10), days = Math.floor((Date.now() - Date.parse(r.applied_at)) / 86400000);
    return { id: r.id, title: r.title, company: r.company, url: r.url, applied_on: day, days_waiting: days,
      note: ["Hello,", "", `I applied for the ${r.title} role at ${r.company} on ${day} and wanted to confirm that my application reached you. I remain interested and can share anything further that would help.`, "", "Best regards,", P.name].join("\n") };
  });
  return { count: items.length, items };
}
async function run(env) {
  await ensure(env);
  const t0 = Date.now(), started = iso(t0);
  // self-heal: a run that never finished (isolate killed, D1 error) is closed by the next run instead of reading as "running" forever
  const rid = (await env.JOBS_DB.prepare("INSERT INTO jobsearch_runs (started_at) VALUES (?)").bind(started).run()).meta.last_row_id;
  await env.JOBS_DB.prepare("UPDATE jobsearch_runs SET finished_at=?1, errors_json=?2 WHERE finished_at IS NULL AND started_at < ?3 AND id<>?4")
    .bind(started, JSON.stringify(["run did not finish: closed by the next run"]), iso(t0 - 15 * 60 * 1000), rid).run().catch((e) => logErr("self-heal", e));
  try {
    await ensureAutonomyBrand(env).catch((e) => logErr("autonomy-brand", e));
    await ensureUltrastableBrand(env).catch((e) => logErr("ultrastable-brand", e));   // JOBSEARCH-ULTRASTABLE-1
    await ensureUltrastableSkills(env).catch((e) => logErr("ultrastable-skills", e));   // JOBSEARCH-SKILLS-1
    await syncSkillAsks(env).catch((e) => logErr("skill-asks", e));   // JOBSEARCH-SKILLS-1: taps on fleet.qnfo.org/focus reach the CV bank
    await ensureResearchPubs(env).catch((e) => logErr("research-pubs", e));   // before loadCtx so the context sees the merged bank
    const ctx = await loadCtx(env);
    const prefsHash = await sha256hex(JSON.stringify([RANK_RULES, ctx.a, [...ctx.learned.boost].sort(), [...ctx.learned.block].sort(), [...OWNED].sort(), [...ctx.learned.coPen].sort(), [...ctx.learned.coDrop].sort()]));
    const prefsChanged = (await getMeta(env, "prefs_hash")) !== prefsHash;
    let { kept, errors, excl, fetched, feeds, feedResults, near, candidatesLive } = await collectAndRank(ctx);
    await setMeta(env, "candidates_live", JSON.stringify((candidatesLive || []).sort())).catch((e) => logErr("candidates-live", e));
    // what the owner already decided (rejected, applied, approved, got a reply) never comes back, under any id, board or location; and a role already pending under another id is not listed twice
    const decided = await decidedKeys(env);
    const pendingRows = (await env.JOBS_DB.prepare("SELECT id, company, title FROM jobsearch_matches WHERE status='pending_owner_approval' AND last_seen >= ?").bind(iso(t0 - 72 * 3600 * 1000)).all()).results;
    const pendingByKey = new Map(pendingRows.map((r) => [normKey(r), r.id]));
    let suppressed = 0;
    kept = kept.filter((j) => {
      const nk = normKey(j);
      if (decided.has(nk)) { suppressed++; return false; }
      const other = pendingByKey.get(nk);
      if (other && other !== j.id) { suppressed++; return false; }
      return true;
    });
    if (suppressed) excl["already decided or already listed"] = suppressed;
    kept = await semanticLens(env, kept, near || [], ctx);   // JOBSEARCH-SEMANTIC-1: lens 3, meaning instead of words
    kept = await llmRerank(env, kept);   // reorder-only AI pass over the top 25, before the per-company cap
    kept = await judgeTop(env, kept);
    const per = {}, seen = new Set(), picked = [], pickedStretch = [];
    for (const j of kept) {
      const dk = dedupeKey(j);
      if (seen.has(dk)) continue;               // the same posting listed on two boards
      seen.add(dk);
      const stretch = j.match.tier === "C", cap = stretch ? 2 : 3, key = (stretch ? "~" : "") + j.company;
      if ((per[key] || 0) < cap) { per[key] = (per[key] || 0) + 1; (stretch ? pickedStretch : picked).push(j); }
    }
    const toStore = picked.slice(0, 80).concat(pickedStretch.slice(0, 40));
    let blocked = 0;
    const now = new Date().toISOString();
    const stmts = [];
    for (const j of toStore) {
      const a = artifactsFor(j);
      if (!a.verified) blocked++;
      stmts.push(env.JOBS_DB.prepare(
        `INSERT INTO jobsearch_matches (id, first_seen, last_seen, run_id, company, title, location, url, tier, score, why_json, flags_json, verified, blocked_reason, resume_md, note_md, status, gaps_json)
         VALUES (?1,?2,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,'pending_owner_approval',?16)
         ON CONFLICT(id) DO UPDATE SET last_seen=?2, run_id=?3, tier=?8, score=?9, why_json=?10, flags_json=?11, verified=?12, blocked_reason=?13, resume_md=?14, note_md=?15, title=?5, location=?6, url=?7, gaps_json=?16`
      ).bind(j.id, now, rid, j.company, j.title, j.location, j.url, j.match.tier, j.match.score, JSON.stringify(j.match.why || []), JSON.stringify(j.match.flags || []), a.verified, a.blocked, a.resume, a.note, JSON.stringify(recallGaps(j))));
    }
    // feed health: success resets the streak, failure extends it (detector fm-jobsearch-feed-down reads 3 in a row)
    for (const f of feedResults) {
      stmts.push(f.ok
        ? env.JOBS_DB.prepare("INSERT INTO jobsearch_feeds (feed, last_ok_at, last_count, consecutive_fail) VALUES (?1,?2,?3,0) ON CONFLICT(feed) DO UPDATE SET last_ok_at=?2, last_count=?3, consecutive_fail=0, last_error=NULL").bind(f.feed, now, f.count)
        : env.JOBS_DB.prepare("INSERT INTO jobsearch_feeds (feed, last_error, last_error_at, consecutive_fail) VALUES (?1,?2,?3,1) ON CONFLICT(feed) DO UPDATE SET last_error=?2, last_error_at=?3, consecutive_fail=consecutive_fail+1").bind(f.feed, f.error.slice(0, 300), now));
    }
    // lifecycle: a pending match whose feed answered this run but did not list it for 48 h is gone upstream or no longer matches
    const cutoff = iso(prefsChanged ? t0 : t0 - 48 * 3600 * 1000), prefixes = new Set();   // new preferences retire what no longer fits at once
    const okFeeds = new Set(feedResults.filter((f) => f.ok).map((f) => f.feed));
    for (const f of feedResults) {
      if (!f.ok) continue;
      const kind0 = f.feed.split(":")[0];
      if (["remotive", "muse", "jobicy", "himalayas"].includes(kind0) && !BOARDS[kind0].every((c) => okFeeds.has(kind0 + ":" + c))) continue;   // a grouped source expires nothing unless every part answered
      prefixes.add(feedPrefix(f.feed));
    }
    for (const pre of prefixes) stmts.push(env.JOBS_DB.prepare("UPDATE jobsearch_matches SET status='expired', decided_at=?3 WHERE status='pending_owner_approval' AND id LIKE ?1 AND last_seen < ?2").bind(pre + "%", cutoff, now));
    // retention
    stmts.push(env.JOBS_DB.prepare("DELETE FROM jobsearch_matches WHERE status='expired' AND last_seen < ?").bind(iso(t0 - 90 * 86400000)));
    // decided rows are kept for good (their key is what stops a role coming back); only the bulky drafts are dropped
    stmts.push(env.JOBS_DB.prepare("UPDATE jobsearch_matches SET resume_md=NULL, note_md=NULL WHERE status IN ('rejected','no_reply') AND last_seen < ? AND (resume_md IS NOT NULL OR note_md IS NOT NULL)").bind(iso(t0 - 90 * 86400000)));
    stmts.push(env.JOBS_DB.prepare("DELETE FROM jobsearch_codes WHERE created_ms < ?").bind(t0 - 86400000));
    stmts.push(env.JOBS_DB.prepare("DELETE FROM jobsearch_sessions WHERE expires_ms < ?").bind(t0 - 86400000));
    for (let i = 0; i < stmts.length; i += 50) await env.JOBS_DB.batch(stmts.slice(i, i + 50));
    await env.JOBS_DB.prepare("UPDATE jobsearch_runs SET finished_at=?, feeds=?, fetched=?, passed=?, stored=?, blocked=?, excluded_json=?, errors_json=? WHERE id=?")
      .bind(new Date().toISOString(), feeds, fetched, kept.length, toStore.length, blocked, JSON.stringify(excl), JSON.stringify(errors), rid).run();
    const nrCut = iso(t0 - NO_REPLY_DAYS * 86400000), nrWhere = "status='applied' AND id IN (SELECT match_id FROM jobsearch_events GROUP BY match_id HAVING MIN(CASE WHEN event='applied' THEN ts END) < ?1) AND id NOT IN (SELECT match_id FROM jobsearch_events WHERE event IN ('replied','interview','offer'))";
    await env.JOBS_DB.batch([
      env.JOBS_DB.prepare("INSERT INTO jobsearch_events (match_id, event, ts, note) SELECT id, 'no_reply', ?2, 'auto: no reply in 21 days' FROM jobsearch_matches WHERE " + nrWhere).bind(nrCut, new Date().toISOString()),
      env.JOBS_DB.prepare("UPDATE jobsearch_matches SET status='no_reply', decided_at=?2 WHERE " + nrWhere).bind(nrCut, new Date().toISOString()),
    ]);
    try { await writeOutcomeMetrics(env, await outcomes(env)); } catch (e) { logErr("outcome-metrics", e); }
    await setMeta(env, "prefs_hash", prefsHash);
    await setMeta(env, "ledger_verified_on", LEDGER_VERIFIED_ON);
    await setMeta(env, "bank_rev", BANK_REV);
    await setMeta(env, "ledger_open_questions", (LEDGER.unverified_needs_owner || []).length);
    await setMeta(env, "worker_version", VERSION);
    await setMeta(env, "email_binding", env.EMAIL ? "1" : "0");
    log("run-ok", { run_id: rid, fetched, passed: kept.length, blocked, feed_errors: errors.length, ms: Date.now() - t0 });
    return { run_id: rid, feeds, fetched, passed: kept.length, stored: toStore.length, blocked, errors };
  } catch (e) {
    logErr("run-failed", e);
    await env.JOBS_DB.prepare("UPDATE jobsearch_runs SET finished_at=?, errors_json=? WHERE id=?").bind(new Date().toISOString(), JSON.stringify(["run failed: " + String((e && e.message) || e).slice(0, 300)]), rid).run().catch((e2) => logErr("run-failed-record", e2));
    throw e;
  }
}

// ------------------------------------------------------------------ CV storage and API (JOBSEARCH-CV-1)
const bad400 = (msg) => Object.assign(new Error(msg), { status: 400 });
const clean = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
// One key per role at one employer, whatever the board, id, location or tag in brackets: what the owner decided about it stays decided.
const normKey = (j) => {
  const co = String(j.company || "").toLowerCase().replace(COMPANY_SUFFIX, " ").replace(/[^a-z0-9]+/g, "");
  const ti = String(j.title || "").toLowerCase().replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  return co + "|" + ti;
};
const DECIDED = ["rejected", "applied", "approved", "replied", "interview", "offer", "no_reply"];
async function decidedKeys(env) {
  const keys = new Set();
  const rows = (await env.JOBS_DB.prepare('SELECT company, title FROM jobsearch_matches WHERE status IN (' + DECIDED.map(() => '?').join(',') + ')').bind(...DECIDED).all()).results;
  for (const r of rows) keys.add(normKey(r));
  const fb = (await env.JOBS_DB.prepare("SELECT company, title FROM jobsearch_feedback WHERE source='status' OR (source='check' AND verdict='dislike')").all()).results;
  for (const r of fb) keys.add(normKey(r));
  return keys;
}
let bankAt = 0;
async function loadBank(env) {
  if (Date.now() - bankAt < 15000) return BANK;
  await ensure(env);
  const row = await env.JOBS_DB.prepare("SELECT v, rev FROM jobsearch_bank WHERE k='bank'").first();
  if (row) { try { applyBank(JSON.parse(row.v), row.rev); } catch (e) { logErr("bank-parse", e); applyBank(BANK_SEED, 0); } }
  else if (BANK_REV !== 0) applyBank(BANK_SEED, 0);
  bankAt = Date.now();
  return BANK;
}
// JOBSEARCH-RESEARCH-PORTFOLIO-1 (issue 1000707): the owner's QNFO papers that public search surfaces first and the bank lacked. Read from living-paper on 2026-11-05 (status published,
// release gate passed, the pages answer 200 on papers.qnfo.org). None has a DOI (0 of 723 published papers has one), so each carries its papers.qnfo.org address, which pubLine prints.
// They are added once to the owner's bank, additive and tagged so a resume lists them when the posting is in their field; after that the bank is the owner's: a deleted entry stays deleted.
// The fleet's edit does not count as a re-verification (verified_on is kept). The stronger claims in the issue (co-directing a travel survey, predictive analytics at Epsilon) stay out until the owner states them.
const RESEARCH_PUBS = [
  { id: "P09", title: "Quantum Laws of Form", year: 2026, doi: "", url: "https://papers.qnfo.org/papers/quantum-laws-of-form", tags: ["quantum", "physics_theory", "research_integrity"] },
  { id: "P10", title: "Dimensionless Physics", year: 2025, doi: "", url: "https://papers.qnfo.org/papers/dimensionless-physics", tags: ["physics_theory", "numerics"] },
  { id: "P11", title: "Proof-of-Concept for Auditable Attention using Ultrametric Tree Distances", year: 2026, doi: "", url: "https://papers.qnfo.org/papers/proof-of-concept-for-auditable-attention-using-ultrametric-tree-distances", tags: ["llm", "research_integrity", "physics_theory"] },
];
// JOBSEARCH-AUTONOMY-1 (owner direction 2026-11-09): the live bank takes the new positioning once. The summary is replaced only while it is still the old seed text (an owner edit is kept),
// programming languages leave the skills (the owner does not write software), three systems skills are added, and QNFO drops its quantum tag. Fact texts are not touched.
const AUTONOMY_OLD_S1 = "Data and AI leader who builds the systems behind the research. 15 years running national research programs and data products at the U.S. Federal Highway Administration and AARP. Founder of QNFO, an independent research imprint with an AI-assisted pipeline, a published audit method, and a public correction trail. Open to research management, applied AI, and research-integrity roles.";
const AUTONOMY_DROP_SKILLS = ["JavaScript", "Python", "SQL"];
const AUTONOMY_OWNER_FACTS = [
  ["R10", "Built and ran transportation network models.", ["transport", "statistics"]],
  ["R09", "Built and ran transportation network models.", ["transport", "consulting"]],
  ["R08", "Specified the national Tour-Based Model System and directed the contractor team that built it.", ["transport", "statistics", "research_mgmt", "contracting"]],
];
const AUTONOMY_CONFIRMED = [["V1", "Co-directed the $10M U.S. DOT National Household Travel Survey."], ["V2", "Managed data products built on predictive machine-learning models at Epsilon (Publicis Groupe)."]];
async function ensureAutonomyBrand(env) {
  if ((await getMeta(env, "autonomy_brand_v1")) === "done") return false;
  const seedS1 = BANK_SEED.summaries[0].text, seedR01 = BANK_SEED.roles[0].tags, add = BANK_SEED.skills.slice(0, 3);
  await mutateBank(env, (b) => {
    for (const x of b.summaries || []) if (x.text === AUTONOMY_OLD_S1) x.text = seedS1;
    b.skills = (b.skills || []).filter((k) => !AUTONOMY_DROP_SKILLS.includes(k.name));
    for (const k of [...add].reverse()) if (!b.skills.some((x) => x.name.toLowerCase() === k.name.toLowerCase())) b.skills.unshift({ ...k, tags: [...k.tags] });
    for (const r of b.roles || []) if (r.id === "R01" && (r.tags || []).includes("quantum")) r.tags = [...seedR01];
    // the owner confirmed two review items on 2026-11-09 (Personal Brand project; recorded in rwnq8/resume docs/BRAND.md section 6). V3 (patents) stays in the queue.
    for (const [id, text] of AUTONOMY_CONFIRMED) if ((b.review || []).some((x) => x.id === id)) cvReview(b, { id, action: "confirm", text });
    for (const [role, text, tags] of AUTONOMY_OWNER_FACTS)
      if ((b.roles || []).some((r) => r.id === role) && !(b.facts || []).some((f) => f.role === role && f.text === text)) b.facts.push({ id: nextFactId(b), role, text, tags: [...tags], source: "owner:2026-11-09", status: "verified" });
    return b;
  }, { keepVerified: true });
  await setMeta(env, "autonomy_brand_v1", "done");
  return true;
}
// JOBSEARCH-ULTRASTABLE-1 (owner, 2026-11-10, Personal Brand project: "I'm now launching this as its own platform or its own startup ... I'm not an engineer.
// I'm not a coder. I'm a thinker. I'm a systems person."; recorded in rwnq8/resume docs/BRAND.md section 9 and CV v5.1). Adds the Ultrastable role, its facts
// (numbers from the live claims at ultrastable.io on 2026-11-10) and the summary that names it, once, to the live bank.
const ULTRASTABLE_ROLE = { id: "R00", title: "Founder and Director", org: "Ultrastable (autonomous development platform)", location: "", start: "2026", end: "present", tags: ["founder", "llm", "research_integrity", "leadership", "product"] };
const ULTRASTABLE_FACTS = [
  ["Launching the system that runs QNFO as its own autonomous development platform, Ultrastable (ultrastable.io): it finds its own work in its metrics and failures, hands each change to coding agents from several vendors, proves every deploy with live probes and automatic rollback, and scores its decisions against the predictions it logged first.", ["founder", "llm", "research_integrity", "product"],
    "I founded and direct Ultrastable (ultrastable.io), an autonomous development platform that chooses its own work, proves each change live and scores its own predictions."],
  ["Set the platform's goals, standing directives and limits and evaluate how it behaves; coding agents write the code (systems design and direction, not hands-on coding).", ["founder", "leadership", "research_integrity"],
    "My role at Ultrastable is systems design and direction: I set its goals, standing directives and limits and evaluate how it behaves, while coding agents write the code."],
  ["Live, re-checked evidence: 3,880 merged changes since August 2026; 774 of 1,059 scored decisions matched their logged prediction; 0 silent drops across 6,000+ closed issues; one installation so far (QNFO).", ["founder", "llm", "research_integrity"],
    "Its claims are re-checked by the running system and published live: 774 of 1,059 scored decisions matched the prediction logged first, with 0 silent drops across 6,000+ closed issues."],
];
const ULTRASTABLE_S1 = "Systems researcher studying autonomous AI systems: how they behave, fail and can be audited and governed. Founder and director of Ultrastable (ultrastable.io), an autonomous development platform that chooses its own work, proves each change live and scores its own predictions; I direct it and coding agents write the code. 20 years of systems work behind it: transportation network models from 2004, the national Tour-Based Model System at the U.S. Federal Highway Administration, and the AARP Livability Index, a decision-support system built from 50+ data sources. Open to autonomous and AI systems research and strategy, AI evaluation and assurance, AI governance and oversight, research leadership for AI, and founder-in-residence or product strategy roles.";
async function ensureUltrastableBrand(env) {
  if ((await getMeta(env, "ultrastable_brand_v1")) === "done") return false;
  await mutateBank(env, (b) => ultrastableBank(b), { keepVerified: true });
  await setMeta(env, "ultrastable_brand_v1", "done");
  return true;
}
function ultrastableBank(b) {
  b.roles = b.roles || []; b.facts = b.facts || []; b.summaries = b.summaries || []; b.skills = b.skills || [];
  if (!b.roles.some((r) => r.id === ULTRASTABLE_ROLE.id)) b.roles.unshift({ ...ULTRASTABLE_ROLE, tags: [...ULTRASTABLE_ROLE.tags] });
  for (const [text, tags, pitch] of ULTRASTABLE_FACTS)
    if (!b.facts.some((f) => f.role === ULTRASTABLE_ROLE.id && f.text === text)) b.facts.push({ id: nextFactId(b), role: ULTRASTABLE_ROLE.id, text, tags: [...tags], source: "owner:2026-11-10", status: "verified", pitch });
  const s1 = b.summaries.find((x) => x.id === "S1");
  if (s1 && !/Ultrastable/.test(s1.text)) s1.text = ULTRASTABLE_S1; else if (!s1) b.summaries.unshift({ id: "S1", tags: [], text: ULTRASTABLE_S1 });
  if (!b.skills.some((k) => /autonomous development platform/i.test(k.name))) b.skills.unshift({ name: "Directing autonomous development platforms", tags: ["founder", "llm"] });
  return b;
}
/* JOBSEARCH-SKILLS-1 (owner, 2026-11-10: "the skills required to build this are the skills that should be on my resume"). What the record shows Rowan
   directed while building Ultrastable, each backed by owner directives recorded verbatim in the public QNFO/qnfo-workers repository (CLAUDE.md,
   docs/AUTONOMOUS-OPERATION-DOCTRINE.md, docs/PROMPTED-RECALL.md) and by owner_asks answers. Worded as systems design and direction, never as coding,
   and outcome-level only: no mechanism named in the unfiled patent (ultrastable docs/CONFIDENTIALITY.md). Skills the record cannot back are asked as
   prompted-recall cards instead (RECALL_SEED entries with ask: true), shown on fleet.qnfo.org/focus and jobs.q08.org. */
const ULTRASTABLE_SKILL_FACTS = [
  ["Wrote and revised the operating doctrine for an autonomous agent fleet: the standing rules for what agents decide on their own, what needs a person, how every item is accounted for, and the limits no agent may cross (five revisions in October 2026, published verbatim in the public QNFO/qnfo-workers repository).", ["founder", "research_integrity", "writing", "leadership"],
    "I wrote the operating doctrine that governs Ultrastable's agents: what they decide alone, what needs a person, and the limits none may cross."],
  ["Defined the human-oversight boundary: agents proceed on reversible work, and only irreversible, identity-bound steps (money, legal or signing acts, the owner's own accounts) come to a person.", ["founder", "llm", "research_integrity", "policy"],
    "I defined where a person must stay in the loop: agents proceed on reversible work, and only irreversible, identity-bound steps come to a human."],
  ["Set the verification and evaluation requirements: no change counts until a live check proves it, every problem found is fixed, deployed and verified, and output quality is judged by outcomes rather than proxy scores.", ["founder", "research_integrity", "llm"],
    "I set Ultrastable's verification rules: nothing counts until a live check proves it, and quality is judged by outcomes, not proxy scores."],
  ["Directed coding agents from several vendors (Claude Code, GitHub Copilot, OpenAI Codex) under one written operating agreement that routes each kind of work to the agent best suited to it.", ["founder", "llm", "leadership"],
    "I direct coding agents from several vendors under one written operating agreement that decides which agent takes which work."],
  ["Set the fleet's operating targets: service levels measured in minutes, an owner and an automatic trigger for every metric, and AI spend caps that steer model choice instead of stopping work.", ["founder", "leadership", "product"],
    "I set the platform's operating targets: service levels in minutes, a trigger behind every metric, and spend caps that steer model choice."],
  ["Reframed an internal research fleet as a product, Ultrastable, with QNFO as its first installation, and set the rule that every public product claim is backed by a live check.", ["founder", "product"],
    "I turned an internal research fleet into a product, Ultrastable, and required every public claim about it to be backed by a live check."],
  ["Set the interaction standards for every screen the platform shows people: one primary action, tap-to-answer questions instead of typing, and accessible contrast and tap sizes.", ["founder", "product"],
    "I set the platform's interaction standards: one primary action per screen and tap-to-answer questions instead of typing."],
];
const ULTRASTABLE_SKILLS = [
  ["Autonomous systems governance and doctrine design", ["founder", "research_integrity"]],
  ["Human oversight and approval-boundary design for AI agents", ["llm", "research_integrity"]],
  ["Verification and evaluation design for AI agents", ["llm", "research_integrity"]],
  ["Failure-mode and risk analysis for autonomous systems", ["research_integrity", "founder"]],
  ["Multi-vendor AI agent orchestration and oversight", ["llm", "founder"]],
  ["Operating metrics, service levels and AI cost governance", ["leadership", "founder"]],
  ["Product and platform strategy for autonomous systems", ["product", "founder"]],
  ["Writing machine-checkable specifications and requirements", ["writing", "research_integrity"]],
  ["Research program direction", ["research_mgmt", "leadership"]],
];
function ultrastableSkillsBank(b) {
  b.facts = b.facts || []; b.skills = b.skills || [];
  const role = (b.roles || []).some((r) => r.id === ULTRASTABLE_ROLE.id) ? ULTRASTABLE_ROLE.id : "R01";
  for (const [text, tags, pitch] of ULTRASTABLE_SKILL_FACTS)
    if (!b.facts.some((f) => f.text === text)) b.facts.push({ id: nextFactId(b), role, text, tags: [...tags], source: "record:qnfo-workers owner directives 2026-10", status: "verified", pitch });
  // appended: a tailored resume orders skills by the posting's tags, so these lead for autonomy roles and leave other roles' skill lines as they were
  for (const [name, tags] of ULTRASTABLE_SKILLS) if (!b.skills.some((k) => k.name.toLowerCase() === name.toLowerCase())) b.skills.push({ name, tags: [...tags] });
  return b;
}
async function ensureUltrastableSkills(env) {
  if ((await getMeta(env, "ultrastable_skills_v1")) === "done") return false;
  await mutateBank(env, (b) => ultrastableSkillsBank(b), { keepVerified: true });
  await setMeta(env, "ultrastable_skills_v1", "done");
  return true;
}
/* The cards for skills the record cannot back: each is one row in qnfo-audit.owner_asks (kind cv-skill, ref the seed id), so fleet.qnfo.org/focus and
   the companion ask it by tap. Each hourly run copies a tap from there into the CV bank through recallAnswer (a yes writes the seed's own sentence as a
   verified fact, a no or a change removes it), and copies a tap made on jobs.q08.org back to the row so the question is not asked twice. Not sure
   comes back after RECALL_UNSURE_DAYS. */
function skillAskOptions(s) {
  const yes = s.where ? s.where.map((w) => ({ key: w.role, label: w.label })) : [{ key: "yes", label: "Yes" }];
  return yes.concat([{ key: "no", label: "No" }, { key: "unsure", label: "Not sure" }]);
}
const SKILL_ASKS = () => RECALL_SEED.filter((s) => s.ask);
async function syncSkillAsks(env) {
  const asks = SKILL_ASKS(), out = { seeded: 0, applied: 0, mirrored: 0, reopened: 0 };
  for (const s of asks) {
    const r = await env.JOBS_DB.prepare("INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority) VALUES ('jobs','cv-skill',?1,?2,?3,?4,2)")
      .bind(s.id, s.ask, s.cue, JSON.stringify(skillAskOptions(s))).run();
    out.seeded += (r.meta && r.meta.changes) || 0;
  }
  const rows = (await env.JOBS_DB.prepare("SELECT id, ref, answer, answered_at FROM owner_asks WHERE kind='cv-skill'").all()).results || [];
  await loadBank(env);
  const recall = BANK.recall || {}, todo = [];
  for (const row of rows) {
    const s = asks.find((x) => x.id === row.ref);
    if (!s) continue;
    const key = "seed:" + s.id, rec = recall[key];
    if (row.answer && row.answered_at) {
      if (row.answer === "unsure" && Date.now() - Date.parse(row.answered_at) > RECALL_UNSURE_DAYS * 86400000) {
        await env.JOBS_DB.prepare("UPDATE owner_asks SET answer=NULL, answer_label=NULL, answered_at=NULL, answered_via=NULL WHERE id=?1").bind(row.id).run(); out.reopened++; continue;
      }
      if (rec && (rec.ask_at === row.answered_at || Date.parse(rec.at || 0) >= Date.parse(row.answered_at))) continue;   // the bank already holds this tap, or a newer one from jobs.q08.org
      const placed = s.where ? (s.where.find((w) => w.role === row.answer) || {}).role : null;
      const answer = placed || row.answer === "yes" ? "yes" : row.answer === "no" ? "no" : "unsure";
      todo.push({ key, answer, role: placed || (s.roles || [])[0], depth: "led", ask_at: row.answered_at });
    } else if (rec && rec.answer) {
      const label = rec.answer === "yes" ? "Yes" : rec.answer === "no" ? "No" : "Not sure";
      await env.JOBS_DB.prepare("UPDATE owner_asks SET answer=?1, answer_label=?2, answered_at=?3, answered_via='jobs.q08.org' WHERE id=?4 AND answered_at IS NULL")
        .bind(rec.answer === "yes" ? (rec.role && s.where ? rec.role : "yes") : rec.answer, label, rec.at || new Date().toISOString(), row.id).run();
      out.mirrored++;
    }
  }
  if (todo.length) { await mutateBank(env, (b) => { for (const d of todo) { recallAnswer(b, d); b.recall[d.key].ask_at = d.ask_at; b.recall[d.key].via = "fleet.qnfo.org/focus"; } return b; }); out.applied = todo.length; }
  return out;
}
// GET /api/cv-skills (open): the skills on the CV, the evidenced ones and those the owner confirmed by tap, for rwnq8/resume's sync workflow
async function cvSkills(env) {
  await loadBank(env);
  const b = BANK, recall = b.recall || {};
  const confirmed = SKILL_ASKS().map((s) => {
    const rec = recall["seed:" + s.id];
    if (!rec || rec.answer !== "yes") return null;
    const f = (b.facts || []).find((x) => x.id === rec.fact);
    return f ? { key: s.id, skill: s.skill, text: f.text, confirmed_at: String(rec.at || "").slice(0, 10) } : null;
  }).filter(Boolean);
  const open = SKILL_ASKS().filter((s) => !recall["seed:" + s.id]).map((s) => s.id);
  return { schema_version: "cv-skills/v1", skills: (b.skills || []).map((s) => s.name), evidenced: ULTRASTABLE_SKILL_FACTS.map(([t]) => t), confirmed, open_questions: open };
}
async function ensureResearchPubs(env) {
  if ((await getMeta(env, "research_pubs_v1")) === "done") return false;
  await mutateBank(env, (b) => {
    b.publications = b.publications || [];
    for (const p of RESEARCH_PUBS) if (!b.publications.some((x) => x.id === p.id || String(x.title).toLowerCase() === p.title.toLowerCase())) b.publications.push({ ...p, tags: [...p.tags] });
    return b;
  }, { keepVerified: true });
  await setMeta(env, "research_pubs_v1", "done");
  return true;
}
// Optimistic lock: the write only lands if the revision it read is still current, otherwise it re-reads and re-applies (two tabs cannot overwrite each other).
async function mutateBank(env, fn, opts = {}) {
  await ensure(env);
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await env.JOBS_DB.prepare("SELECT v, rev FROM jobsearch_bank WHERE k='bank'").first();
    const cur = row ? JSON.parse(row.v) : JSON.parse(JSON.stringify(BANK_SEED)), rev = row ? row.rev : 0;
    const next = fn(cur) || cur;
    if (!opts.keepVerified) next.verified_on = new Date().toISOString().slice(0, 10);   // a change the fleet makes is not a re-verification by the owner
    const v = JSON.stringify(next), now = iso(Date.now());
    const res = row
      ? await env.JOBS_DB.prepare("UPDATE jobsearch_bank SET v=?1, rev=rev+1, updated_at=?2 WHERE k='bank' AND rev=?3").bind(v, now, rev).run()
      : await env.JOBS_DB.prepare("INSERT OR IGNORE INTO jobsearch_bank (k, v, rev, updated_at) VALUES ('bank', ?1, 1, ?2)").bind(v, now).run();
    if (res.meta.changes) {
      if (row) await env.JOBS_DB.batch([
        env.JOBS_DB.prepare("INSERT INTO jobsearch_bank_history (ts, rev, v) VALUES (?1,?2,?3)").bind(now, rev, row.v),
        env.JOBS_DB.prepare("DELETE FROM jobsearch_bank_history WHERE id NOT IN (SELECT id FROM jobsearch_bank_history ORDER BY id DESC LIMIT 40)"),
      ]);
      applyBank(next, rev + 1); bankAt = Date.now();
      return next;
    }
  }
  throw Object.assign(new Error("the CV changed in another tab; reload and try again"), { status: 409 });
}
const nextFactId = (b) => "Q" + String(Math.max(0, ...b.facts.map((f) => parseInt(String(f.id).replace(/\D/g, ""), 10) || 0)) + 1).padStart(3, "0");
const roleOk = (b, id) => ((b.roles || []).some((r) => r.id === id) ? id : "");
const tagsOk = (tags) => (Array.isArray(tags) ? tags.filter((t) => TAG_TO_CLUSTERS[t]) : []);
function cvAnswer(b, d) {
  const q = QUESTIONS.find((x) => x.id === d.qid);
  if (!q) throw bad400("unknown question");
  if (d.answer !== "y" && d.answer !== "n") throw bad400("answer is y or n");
  b.answers = b.answers || {};
  const old = (b.answers[q.id] || {}).facts || [];
  b.facts = b.facts.filter((f) => !old.includes(f.id));
  const ids = [];
  if (d.answer === "y") for (const f of (d.facts || []).slice(0, 10)) {
    const text = clean(f.text, 600);
    if (!text) continue;
    const id = nextFactId(b);
    b.facts.push({ id, role: roleOk(b, f.role), text, tags: q.tags, source: "interview:" + q.id, status: "verified" });
    ids.push(id);
  }
  b.answers[q.id] = { answer: d.answer, facts: ids };
}
function cvFact(b, d) {
  const f = b.facts.find((x) => x.id === d.id);
  if (d.delete) { b.facts = b.facts.filter((x) => x.id !== d.id); for (const a of Object.values(b.answers || {})) a.facts = (a.facts || []).filter((i) => i !== d.id); return; }
  const text = clean(d.text, 600);
  if (!text) throw bad400("write what you did");
  if (f) { f.text = text; if ("role" in d) f.role = roleOk(b, d.role); if ("tags" in d) f.tags = tagsOk(d.tags); delete f.pitch; f.status = "verified"; }
  else b.facts.push({ id: nextFactId(b), role: roleOk(b, d.role), text, tags: tagsOk(d.tags), source: "manual", status: "verified" });
}
function cvReview(b, d) {
  const it = (b.review || []).find((x) => x.id === d.id);
  if (!it) throw bad400("unknown review item");
  if (d.action === "confirm") {
    const text = clean(d.text || it.text, 600);
    if (/\[[^\]]*\]/.test(text)) throw bad400("fill in the bracketed part first");
    b.facts.push({ id: nextFactId(b), role: roleOk(b, d.role || it.role), text, tags: tagsOk(it.tags), source: "review:" + it.id, status: "verified" });
  } else if (d.action !== "reject") throw bad400("action is confirm or reject");
  b.review = b.review.filter((x) => x.id !== d.id);
}
const strList = (a, n, len) => (Array.isArray(a) ? a.map((x) => clean(x, len)).filter(Boolean).slice(0, n) : null);
function cvSet(b, d) {
  if (typeof d.summary === "string") { const s = (b.summaries || [])[0]; if (s) s.text = clean(d.summary, 1200); else b.summaries = [{ id: "S1", tags: [], text: clean(d.summary, 1200) }]; }
  if (d.education) b.education = strList(d.education, 12, 300);
  if (d.certifications) b.certifications = strList(d.certifications, 20, 300);
  if (Array.isArray(d.skills)) b.skills = d.skills.slice(0, 60).map((s) => ({ name: clean(s.name, 80), tags: tagsOk(s.tags) })).filter((s) => s.name);
  if (Array.isArray(d.roles)) {
    const roles = d.roles.slice(0, 40).map((r, i) => ({ id: /^R\d+$/.test(r.id || "") ? r.id : "R" + String(100 + i), title: clean(r.title, 120), org: clean(r.org, 160), location: clean(r.location, 80), start: clean(r.start, 4), end: clean(r.end, 8), tags: tagsOk(r.tags) }));
    if (roles.some((r) => !r.title || !r.org || !/^\d{4}$/.test(r.start) || !/^(\d{4}|present)$/i.test(r.end))) throw bad400("every role needs a title, an employer, a start year (YYYY) and an end year or 'present'");
    if (new Set(roles.map((r) => r.id)).size !== roles.length) throw bad400("duplicate role ids");
    b.roles = roles;
    for (const f of b.facts) f.role = roleOk(b, f.role);
  }
  if (Array.isArray(d.publications)) b.publications = d.publications.slice(0, 80).map((p, i) => ({ id: /^P\d+$/.test(p.id || "") ? p.id : "P" + String(100 + i), title: clean(p.title, 300), year: parseInt(p.year, 10) || 0, doi: clean(p.doi, 80), tags: tagsOk(p.tags) })).filter((p) => p.title && p.year);
  if (d.person && typeof d.person === "object") {
    for (const k of ["location", "also_published_as"]) if (typeof d.person[k] === "string") b.person[k] = clean(d.person[k], 120);
    if (typeof d.person.email === "string" && /^[^\s@]+@[^\s@]+$/.test(d.person.email)) b.person.email = d.person.email.trim();
    for (const k of ["site", "linkedin", "orcid", "papers"]) if (d.person.links && typeof d.person.links[k] === "string" && /^https:\/\/\S+$/.test(d.person.links[k])) b.person.links[k] = d.person.links[k];
  }
}
function cvImport(b, d) {
  if (!d || d.version !== 2 || !Array.isArray(d.facts) || !Array.isArray(d.roles) || !d.person || !d.person.name) throw bad400("not a CV export (version 2 expected)");
  const keep = b.answers;
  for (const k of Object.keys(b)) delete b[k];
  Object.assign(b, d); b.answers = d.answers || keep || {}; b.review = d.review || [];
}
async function cvState(env) {
  await loadBank(env);
  const b = BANK, byId = Object.fromEntries(b.facts.map((f) => [f.id, f]));
  return {
    rev: BANK_REV, verified_on: b.verified_on || null, person: b.person, summary: ((b.summaries || [])[0] || {}).text || "", roles: b.roles, facts: b.facts, publications: b.publications,
    education: b.education, certifications: b.certifications, skills: b.skills, review: b.review || [], tags: Object.keys(TAG_TO_CLUSTERS),
    questions: QUESTIONS.map((q) => { const a = (b.answers || {})[q.id]; return { ...q, answer: a ? a.answer : null, facts: a ? a.facts.map((i) => byId[i]).filter(Boolean) : [] }; }),
  };
}
// ------------------------------------------------------------------ PROMPTED-RECALL-1 (owner directive 2026-11-09)
// Owner: "If you want to know if I've done something, ask me. And if I say I have, put it in my resume. Don't make me type." Prompted recall runs before
// every application: each requirement a posting names that the CV cannot back becomes a yes / no / not sure question with a concrete cue (the posting's
// own sentence), then two taps (where, how involved). A yes becomes a verified fact in the owner's own words-by-choice: the exact sentence is shown on the
// button before it is tapped, so nothing reaches a resume that the owner did not confirm. A no is never asked again; not sure comes back after 14 days.
// Answers live in the CV bank (b.recall), so they are versioned with it (jobsearch_bank_history) and every later resume uses them.
// The pattern every fleet surface reuses (question shape, storage, loop) is docs/PROMPTED-RECALL.md.
const RECALL_UNSURE_DAYS = 14;
const RECALL_SEED = [
  { id: "network_model", what: "transportation network models (roads or transit as nodes and links, with traffic or riders assigned to them)", cue: "Think of regional travel models, scenario runs for a long-range plan, or the national Tour-Based Model.", roles: ["R10", "R09", "R08"], tags: ["transport", "numerics"] },
  { id: "simulation", what: "simulating how a system behaves over time (traffic microsimulation, Monte Carlo runs or agent-based models)", cue: "Any run where you changed an input and watched how the whole system responded.", roles: ["R08", "R09", "R10"], tags: ["numerics", "statistics"] },
  { id: "forecasting", what: "forecasts that drove a public investment or policy decision", cue: "Travel forecasts for a project, demand forecasts for a plan, projections in a policy report.", roles: ["R08", "R09", "R05"], tags: ["statistics", "transport", "policy"] },
  { id: "optimization", what: "optimization or routing problems (shortest paths, scheduling or allocating limited resources)", cue: "Path building in a network model, choosing projects under a budget, scheduling work.", roles: ["R10", "R09", "R08"], tags: ["numerics"] },
  { id: "decision_data", what: "data products leaders used to make decisions (indices, dashboards or scorecards)", cue: "The Livability Index, product metrics at Epsilon or iManage, agency performance measures.", roles: ["R05", "R04", "R03"], tags: ["product", "data_eng", "policy"] },
  { id: "ml_models", what: "predictive or machine-learning models trained on real data", cue: "Risk or propensity scores, classification models, anything fitted and then used to predict.", roles: ["R06", "R07", "R04"], tags: ["ml", "statistics"] },
  { id: "model_validation", what: "checking model quality against observed data (validation, error metrics or back-testing)", cue: "Comparing modeled traffic counts with real counts, holdout tests, calibration reports.", roles: ["R08", "R06", "R10"], tags: ["statistics", "research_integrity"] },
  { id: "agent_fleet", what: "a fleet of autonomous AI agents that plan, act and check their own work with little human input", cue: "The QNFO agent fleet: loops that file issues, open pull requests and verify their own deploys.", roles: ["R01"], tags: ["llm", "research_integrity"] },
  { id: "agent_guardrails", what: "guardrails for autonomous AI systems (approval gates, audit trails and automatic rollback when a change fails)", cue: "The interrupt gate, the claim ledger, deploy probes that revert a bad release.", roles: ["R01"], tags: ["llm", "research_integrity"] },
  { id: "llm_evaluation", what: "evaluating large language model output (scoring answers, calibrating a model's judgment against a person's)", cue: "Model evals, judge-versus-owner calibration, checking generated text against a source.", roles: ["R01", "R02"], tags: ["llm", "research_integrity"] },
  { id: "human_in_loop", what: "human-in-the-loop workflows where people approve or correct what an automated system proposes", cue: "Owner approval cards, review queues, a person signing off before anything is sent.", roles: ["R01", "R05", "R03"], tags: ["llm", "product"] },
  { id: "feedback_loops", what: "systems with feedback loops, where measured results automatically change what the system does next", cue: "Metrics that re-rank work, self-tuning limits, a model re-run after new counts arrive.", roles: ["R01", "R08"], tags: ["llm", "numerics"] },
  // JOBSEARCH-SKILLS-1: skills the Ultrastable build suggests but the record cannot back; ask: true puts each on fleet.qnfo.org/focus (owner_asks kind cv-skill)
  { id: "ip_strategy", ask: "Did you direct the IP work for Ultrastable: the invention disclosure that names you as inventor and the draft provisional patent (November 2026)?", what: "intellectual-property strategy for an autonomous platform", cue: "Think of ultrastable/ip: the invention disclosure, the provisional specification and the 100-page limit you set for it.", roles: ["R00", "R01"], tags: ["founder"], skill: "IP strategy for an autonomous platform", yes: "Directed intellectual-property strategy for Ultrastable: the invention disclosure (named inventor) and preparation of a provisional patent application (not yet filed)." },
  { id: "venture_plan", ask: "Did you direct the Ultrastable venture plan: target customers, competitors, pitch and funding options (November 2026)?", what: "venture and go-to-market planning", cue: "Think of ultrastable/business/plan: the customer and competition notes, the pitch kit, the Google for Startups kit, the funding tracks.", roles: ["R00", "R01"], tags: ["founder", "product"], skill: "Venture and go-to-market planning", yes: "Directed the Ultrastable venture plan: target customers, a competitive map, pitch materials and funding options." },
  { id: "prompt_design", ask: "Did you write or tune the instructions and prompts the fleet's agents run on (the paper writer, the referee, the code loop, the CLAUDE.md rules), 2024 to 2026?", what: "designing instructions and prompts for AI agents", cue: "Rewording a rule after an agent misread it, a prompt you changed because papers came out wrong, the standing rules the agents load.", roles: ["R01", "R00"], tags: ["llm", "writing"], skill: "Prompt and agent-instruction design", yes: "Designed and tuned the instructions and prompts that steer an autonomous agent fleet (writers, referees and the code loop)." },
  { id: "red_team", ask: "Did you test AI agents adversarially yourself: trying to make them fail, or catching claims that did not match the real output (2024 to 2026)?", what: "red-teaming AI agents", cue: "Catching a 'done' that was never deployed, the self-audit rule you wrote, The Universal Ignorance Audit.", roles: ["R00", "R01"], tags: ["research_integrity", "llm"], skill: "Red-teaming and adversarial testing of AI agents", yes: "Red-teamed autonomous AI agents: tested their claims against real output and turned each failure found into a standing rule or check." },
  { id: "model_selection", ask: "Did you choose which AI models do which jobs by cost and quality (cheap models versus premium ones, reviewers from different model families), 2025 to 2026?", what: "choosing AI models by cost and quality", cue: "Moving work to cheaper Workers AI models, keeping reviewers from different model families, the spend caps that steer model choice.", roles: ["R00", "R01"], tags: ["llm"], skill: "AI model selection and cost-quality trade-offs", yes: "Chose AI models for each job by cost and quality, including reviewers from different model families so their errors do not line up." },
  { id: "nist_ai_rmf", ask: "Have you worked with the NIST AI Risk Management Framework (reading it to design limits, mapping controls to it, or advising on it)?", what: "the NIST AI Risk Management Framework", cue: "Govern, Map, Measure, Manage; the 2023 NIST AI 100-1 document; a client or Empowering Change risk review.", roles: ["R00", "R02"], tags: ["research_integrity", "policy"], skill: "NIST AI Risk Management Framework", yes: "Applied the NIST AI Risk Management Framework to the limits and oversight of an AI system." },
  { id: "eu_ai_act", ask: "Have you worked with the EU AI Act (risk tiers, obligations for general-purpose or high-risk AI) in a design, policy or advisory task?", what: "the EU AI Act", cue: "Risk tiers, transparency duties, a compliance read for a product, policy work in the Netherlands.", roles: ["R00", "R02"], tags: ["research_integrity", "policy"], skill: "EU AI Act", yes: "Worked with the EU AI Act's risk tiers and obligations in the design and governance of an AI product." },
  { id: "people_mgmt", ask: "Have you managed people who reported to you (hired, set goals and reviewed their work)? Where?", what: "managing people who reported to me", cue: "Analysts at AARP, a contractor team at FHWA, staff or volunteers at Empowering Change.", roles: ["R05", "R08", "R02"], tags: ["leadership"], skill: "People management", yes: "Managed people who reported to me: hired, set goals and reviewed their work.",
    where: [{ role: "R05", label: "Yes, at AARP" }, { role: "R08", label: "Yes, at FHWA" }, { role: "R02", label: "Yes, at Empowering Change" }] },
  { id: "ai_briefing", ask: "Have you presented on AI agents or autonomous systems to an outside audience (a talk, a client or investor briefing, a meetup) in 2025 or 2026?", what: "presenting on autonomous AI systems", cue: "A meetup talk, a demo for a possible partner, a briefing on the fleet for an investor or employer.", roles: ["R01", "R00"], tags: ["writing"], skill: "Briefing audiences on autonomous AI systems", yes: "Presented on autonomous AI systems and how they fail to outside audiences." },
  { id: "explain_models", what: "explaining technical models to non-technical decision makers (agency leaders, legislators or executives)", cue: "Briefings for FHWA leadership, AARP policy staff, client executives at Deloitte.", roles: ["R08", "R05", "R07"], tags: ["writing", "policy"] },
];
const RECALL_DEPTHS = [["led", "I led it", "Led work on "], ["hands", "I did it hands-on", "Hands-on work on "], ["team", "I was on the team", "Contributed to team work on "]];
const RECALL_CASE = { "power bi": "Power BI", dbt: "dbt", "scikit-learn": "scikit-learn", pytorch: "PyTorch", tensorflow: "TensorFlow", javascript: "JavaScript", typescript: "TypeScript", github: "GitHub", postgresql: "PostgreSQL", mysql: "MySQL", arcgis: "ArcGIS", qgis: "QGIS" };
const recallShow = (term, kind) => (kind !== "tool" ? term : RECALL_CASE[term] || (term.length <= 4 && !/\s/.test(term) ? term.toUpperCase() : term.replace(/\b[a-z]/g, (c) => c.toUpperCase())));
function recallTermTags(term, kind) {
  const cls = new Set();
  for (const [cl, kws] of Object.entries(CLUSTER_KW)) if (kws.some((k) => k.replace(/\*$/, "").trim() === term)) cls.add(cl);
  const tags = Object.keys(TAG_TO_CLUSTERS).filter((t) => TAG_TO_CLUSTERS[t].some((c) => cls.has(c)));
  return tags.length ? tags : kind === "tool" ? ["data_eng"] : [];
}
function recallCue(text, term) {
  const re = kwRe(term);
  const s = String(text || "").split(/(?<=[.!?])\s+|\n+/).find((x) => re.test(x.toLowerCase()));
  return s ? clean(s, 220) : "";
}
// what this posting asks for that the CV cannot back yet (stored per match at run time, re-checked against the CV at read time)
function recallGaps(job, n = 6) {
  const cv = cvCorpus(), out = [];
  for (const t of postingTerms(job)) {
    if (kwRe(t.term).test(cv)) continue;
    const cue = recallCue(job.desc, t.term);
    if (!cue) continue;   // a word only in the title is not a requirement to ask about
    out.push({ term: t.term, kind: t.kind, cue });
    if (out.length >= n) break;
  }
  return out;
}
function recallRoles(ids, tags) {
  const roles = BANK.roles || [], want = new Set(tags || []);
  const picked = (ids || []).map((id) => roles.find((r) => r.id === id)).filter(Boolean);
  if (!picked.length) picked.push(...roles.map((r) => [(r.tags || []).filter((t) => want.has(t)).length, r]).sort((a, b) => b[0] - a[0] || byRecency(a[1], b[1])).slice(0, 3).map((x) => x[1]));
  return picked.slice(0, 3).map((r) => ({ id: r.id, label: r.title + ", " + String(r.org).split(/[(,]/)[0].trim() }));
}
function recallQuestion(key, extra = {}) {
  let what, ask, cue = extra.cue || "", tags, roles, kind = "topic";
  const seed = key.startsWith("seed:") && RECALL_SEED.find((s) => "seed:" + s.id === key);
  if (seed) { what = seed.what; ask = seed.ask || "Have you worked on " + seed.what + "?"; cue = seed.cue; tags = seed.tags; roles = recallRoles(seed.roles, seed.tags); }
  else if (key.startsWith("term:")) {
    const term = clean(key.slice(5), 80).toLowerCase();
    if (!term || !vocabulary().has(term)) return null;
    kind = vocabulary().get(term); what = recallShow(term, kind); tags = recallTermTags(term, kind); roles = recallRoles(null, tags);
    ask = kind === "tool" ? "Have you ever used " + what + "?" : "Have you done work involving " + what + "?";
  } else return null;
  const drafts = Object.fromEntries(RECALL_DEPTHS.map(([d, , lead]) => [d, seed && seed.yes ? seed.yes : lead + what + "."]));   // JOBSEARCH-SKILLS-1: a skill card saves its own sentence
  return { key, ask, cue, what, kind, tags, roles, skill: (seed && seed.skill) || null, depths: RECALL_DEPTHS.map(([id, label]) => ({ id, label, draft: drafts[id] })), drafts, ...(extra.count ? { count: extra.count, example: extra.example } : {}) };
}
function recallOpen(key) {
  const a = (BANK.recall || {})[key];
  if (!a) return true;
  return a.answer === "unsure" && Date.now() - Date.parse(a.at || 0) > RECALL_UNSURE_DAYS * 86400000;
}
const parseGaps = (s) => { try { const g = JSON.parse(s || "[]"); return Array.isArray(g) ? g : []; } catch (e) { return []; } };
function openGaps(gaps, cv) { return gaps.filter((g) => g && g.term && recallOpen("term:" + g.term) && !kwRe(g.term).test(cv)); }
// GET /api/recall?match=<id>: the questions to answer before applying to this job. Without match: the queue across the open matches, most-asked first.
async function recallQueue(env, matchId, limit = 12) {
  await loadBank(env);
  const cv = cvCorpus();
  if (matchId) {
    const row = await env.JOBS_DB.prepare("SELECT id, title, company, gaps_json FROM jobsearch_matches WHERE id=?").bind(matchId).first();
    if (!row) throw Object.assign(new Error("unknown match"), { status: 404 });
    const qs = openGaps(parseGaps(row.gaps_json), cv).map((g) => recallQuestion("term:" + g.term, { cue: g.cue ? "The posting says: “" + g.cue + "”" : "" })).filter(Boolean);
    return { match: { id: row.id, title: row.title, company: row.company }, questions: qs.slice(0, limit) };
  }
  const rows = (await env.JOBS_DB.prepare("SELECT title, company, gaps_json FROM jobsearch_matches WHERE status='pending_owner_approval' ORDER BY tier ASC, score DESC LIMIT 200").all()).results;
  const agg = new Map();
  for (const r of rows) for (const g of openGaps(parseGaps(r.gaps_json), cv)) {
    const a = agg.get(g.term) || { n: 0, example: r.title + " at " + r.company };
    a.n++; agg.set(g.term, a);
  }
  const terms = [...agg.entries()].sort((a, b) => b[1].n - a[1].n).map(([t, a]) => recallQuestion("term:" + t, { count: a.n, example: a.example, cue: "Asked for by " + a.n + " of your open matches, for example " + a.example + "." })).filter(Boolean);
  const seeds = RECALL_SEED.map((s) => "seed:" + s.id).filter(recallOpen).map((k) => recallQuestion(k));
  const all = seeds.concat(terms);
  return { questions: all.slice(0, limit), total: all.length };
}
// POST /api/recall/answer {key, answer: yes|no|unsure, role, depth}: a yes adds the exact sentence the owner tapped as a verified fact (and a skill for a tool)
function recallAnswer(b, d) {
  const prev = BANK; BANK = b;   // recallQuestion reads roles and vocabulary from the bank being edited
  let q; try { q = recallQuestion(String(d.key || "")); } finally { BANK = prev; }
  if (!q) throw bad400("unknown question");
  if (!["yes", "no", "unsure"].includes(d.answer)) throw bad400("answer is yes, no or unsure");
  b.recall = b.recall || {};
  const old = b.recall[q.key];
  if (old && old.fact) b.facts = b.facts.filter((f) => f.id !== old.fact);
  if (old && old.skill) b.skills = (b.skills || []).filter((s) => s.name !== old.skill);
  const rec = { answer: d.answer, at: new Date().toISOString() };
  if (d.answer === "yes") {
    const depth = q.drafts[d.depth] ? d.depth : "hands";
    const role = roleOk(b, d.role);
    const roleTags = role ? ((b.roles.find((r) => r.id === role) || {}).tags || []) : [];
    const tags = tagsOk([...new Set([...q.tags, ...(q.tags.length ? [] : roleTags)])]);
    const id = nextFactId(b);
    b.facts.push({ id, role, text: q.drafts[depth], tags, source: "recall:" + q.key, status: "verified" });
    Object.assign(rec, { role, depth, fact: id });
    const sk = q.kind !== "topic" ? q.what : q.skill;
    if (sk && !(b.skills || []).some((s) => s.name.toLowerCase() === sk.toLowerCase())) { (b.skills = b.skills || []).push({ name: sk, tags }); rec.skill = sk; }
  }
  b.recall[q.key] = rec;
}
async function saveHistory(env, d) {
  await env.JOBS_DB.batch([
    env.JOBS_DB.prepare("INSERT INTO jobsearch_history (ts, title, company, url, fit, verdict, resume_md, note_md) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)").bind(iso(Date.now()), d.title, d.company, d.url || "", d.fit, d.verdict, d.resume || null, d.note || null),
    env.JOBS_DB.prepare("DELETE FROM jobsearch_history WHERE id NOT IN (SELECT id FROM jobsearch_history ORDER BY id DESC LIMIT 200)"),
  ]);
}

// ------------------------------------------------------------------ http
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" } });
/* JOBSEARCH-DIVERSE-1 (owner 2026-11-09: "Don't just show me jobs from Anthropic or OpenAI"). The list is ordered by score, so the few employers that score
   highest fill the top. Within the first `window` rows no employer appears more than `per` times; the rows pushed down keep their order right after the window.
   Nothing is removed. */
function diversifyRows(rows, per = 2, window = 20) {
  const seen = new Map(), head = [], rest = [];
  for (const r of rows) {
    const k = coKey(r.company);
    if (head.length < window && (seen.get(k) || 0) < per) { head.push(r); seen.set(k, (seen.get(k) || 0) + 1); }
    else rest.push(r);
  }
  return [...head, ...rest];
}
const parseRow = (r) => (r ? { ...r, why: JSON.parse(r.why_json || "[]"), flags: JSON.parse(r.flags_json || "[]"), why_json: undefined, flags_json: undefined } : r);
async function tokenOk(request, env) {
  const t = request.headers.get("x-loop-token") || "";
  if (!env.LOOP_TOKEN) return false;
  const [expected, actual] = await Promise.all([sha256hex(env.LOOP_TOKEN), sha256hex(t)]);
  return constEq(expected, actual);
}
// ------------------------------------------------------------------ outcomes (JOBSEARCH-OUTCOME-1): does the matching help?
// Every status change is an append-only event. The outcome measure is the reply rate of applications old enough to have had a reply
// (21 days): replies, interviews and offers per application. Under MIN_N mature applications it is unknown and nothing is written.
const OUTCOME_STATUSES = ["applied", "replied", "interview", "offer", "no_reply"];
const ALL_STATUSES = ["pending_owner_approval", "approved", "rejected", ...OUTCOME_STATUSES];
const REPLY_EVENTS = ["replied", "interview", "offer"], NO_REPLY_DAYS = 21, MIN_N = 10;
async function outcomes(env) {
  await ensure(env);
  const now = Date.now();
  const matches = (await env.JOBS_DB.prepare("SELECT id, tier, score, status, url FROM jobsearch_matches").all()).results;
  const events = (await env.JOBS_DB.prepare("SELECT match_id, event, ts, note FROM jobsearch_events ORDER BY ts").all()).results;
  const by = {};
  for (const e of events) { (by[e.match_id] = by[e.match_id] || []).push(e); }
  const rows = matches.map((m) => {
    const ev = by[m.id] || [], has = (k) => ev.some((e) => e.event === k);
    const applied = ev.find((e) => e.event === "applied"), snapshot = parseApplicationSnapshot(applied && applied.note);
    const sc = snapshot ? snapshot.score : m.score;
    return { channel: (m.url && atsOf(m.url).ats) || "unknown", band: !Number.isFinite(+sc) || sc === null ? "unscored" : sc >= 80 ? "strong_80_plus" : sc >= 60 ? "good_60_79" : "weak_under_60", tier: snapshot ? snapshot.tier : m.tier, score: sc, approved: has("approved") || has("applied"), applied: !!applied, applied_ms: applied ? Date.parse(applied.ts) : null,
      replied: REPLY_EVENTS.some(has), interview: has("interview") || has("offer"), offer: has("offer") };
  });
  const funnel = (list) => ({ matches: list.length, approved: list.filter((r) => r.approved).length, applied: list.filter((r) => r.applied).length, replied: list.filter((r) => r.replied).length, interview: list.filter((r) => r.interview).length, offer: list.filter((r) => r.offer).length });
  const mature = rows.filter((r) => r.applied && r.applied_ms <= now - NO_REPLY_DAYS * 86400000 && r.applied_ms >= now - 90 * 86400000);
  const rate = (list, k) => (list.length >= MIN_N ? +(list.filter((r) => r[k]).length / list.length).toFixed(4) : null);
  // JOBSEARCH-FUNNEL-1: where applications convert. Per board kind and per score band, the same stage counts, so effort moves to what produces interviews.
  const group = (key) => { const out = {}; for (const k of [...new Set(rows.map((r) => r[key]))].sort()) { const l = rows.filter((r) => r[key] === k), f = funnel(l); out[k] = { ...f, interview_per_applied: f.applied >= MIN_N ? +(f.interview / f.applied).toFixed(4) : null }; } return out; };
  const tiers = {};
  for (const t of ["A", "B"]) { const l = mature.filter((r) => r.tier === t); tiers[t] = { mature_applied: l.length, reply_rate: rate(l, "replied") }; }
  return {
    funnel: funnel(rows), by_stage: Object.fromEntries(STAGES.map((st) => [st, Object.values(by).filter((ev) => ev.some((e) => e.event === "stage:" + st)).length])), by_channel: group("channel"), by_score_band: group("band"), by_tier: { A: funnel(rows.filter((r) => r.tier === "A")), B: funnel(rows.filter((r) => r.tier === "B")) },
    mature_applied_90d: mature.length, min_mature_for_rate: MIN_N,
    reply_rate_90d: rate(mature, "replied"), interview_rate_90d: rate(mature, "interview"),
    applied_30d: rows.filter((r) => r.applied && r.applied_ms >= now - 30 * 86400000).length,
    reply_rate_by_tier: tiers,
    reading: mature.length < MIN_N ? `unknown: ${mature.length} application(s) old enough to have had a reply, ${MIN_N} needed` : "measured",
  };
}
async function writeOutcomeMetrics(env, o) {
  const put = async (metric, value) => { if (value === null || value === undefined) return; await env.JOBS_DB.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2, state = 'MEASURED' WHERE metric = ?3").bind(String(value), new Date().toISOString(), metric).run(); };
  await put("jobsearch_reply_rate_90d", o.reply_rate_90d);
  await put("jobsearch_interview_rate_90d", o.interview_rate_90d);
  await put("jobsearch_applied_30d", o.applied_30d);
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
// JOBSEARCH-OPS-CACHE-1: /api/ops ran about a dozen D1 queries per probe and answered 503 while D1 was overloaded (issue 2562). One report per 60 s per isolate; on a D1 error the last report is served stale (up to 15 min) instead of a 5xx.
let opsCache = null;
async function opsReportCached(env, fresh) {
  const now = Date.now();
  if (!fresh && opsCache && now - opsCache.at < 60000) return opsCache.rep;
  try { const rep = await opsReport(env); opsCache = { at: now, rep }; return rep; }
  catch (e) {
    if (opsCache && now - opsCache.at < 900000) return { ...opsCache.rep, stale: true, stale_age_s: Math.round((now - opsCache.at) / 1000) };
    throw e;
  }
}
async function opsReport(env) {
  await ensure(env);
  await loadBank(env);
  const db = env.JOBS_DB, now = Date.now();
  const last = await db.prepare("SELECT * FROM jobsearch_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").first();
  const recent = (await db.prepare("SELECT passed, fetched FROM jobsearch_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 3").all()).results;
  const unfinished = (await db.prepare("SELECT COUNT(*) AS n FROM jobsearch_runs WHERE finished_at IS NULL AND started_at < ?").bind(iso(now - 15 * 60000)).first()).n;
  const feeds = (await db.prepare("SELECT feed, last_ok_at, last_count, last_error, consecutive_fail FROM jobsearch_feeds ORDER BY feed").all()).results
    .map((feed) => ({ ...feed, active: ACTIVE_FEEDS.has(feed.feed) }));
  const counts = (await db.prepare("SELECT status, COUNT(*) AS n FROM jobsearch_matches GROUP BY status").all()).results;
  const blockedN = (await db.prepare("SELECT COUNT(*) AS n FROM jobsearch_matches WHERE verified=0 AND status='pending_owner_approval'").first()).n;
  const stalePending = (await db.prepare("SELECT COUNT(*) AS n FROM jobsearch_matches WHERE status='pending_owner_approval' AND last_seen < ?").bind(iso(now - 72 * 3600000)).first()).n;
  const rerank = Object.fromEntries(((await db.prepare("SELECT k, v FROM jobsearch_meta WHERE k IN ('rerank_status','rerank_at','rerank_via')").all()).results || []).map((r) => [r.k, r.v]));
  let candidatesLive = []; try { candidatesLive = JSON.parse((await db.prepare("SELECT v FROM jobsearch_meta WHERE k='candidates_live'").first() || {}).v || "[]"); } catch (e) { logErr("candidates-live-read", e); }   // JOBSEARCH-LLM-RERANK-1: what the last run's AI re-rank did
  const ageMin = last ? Math.round((now - Date.parse(last.finished_at)) / 60000) : null;
  const ledgerAge = Math.floor((now - Date.parse(LEDGER_VERIFIED_ON)) / 86400000);
  const checks = [
    { fm: "jobsearch-cron-stalled", ok: ageMin !== null && ageMin <= 120, detail: ageMin === null ? "no finished run yet" : `last run finished ${ageMin} min ago (limit 120)` },
    { fm: "jobsearch-run-unfinished", ok: Number(unfinished) === 0, detail: `${unfinished} run(s) open for over 15 min (the next run closes them)` },
    { fm: "jobsearch-feed-down", ok: !feeds.some((f) => f.active && f.consecutive_fail >= 3), detail: feeds.filter((f) => f.active && f.consecutive_fail >= 3).map((f) => f.feed + " x" + f.consecutive_fail).join(", ") || "no active feed failed 3 runs in a row" },
    { fm: "jobsearch-verifier-blocked", ok: Number(blockedN) === 0, detail: `${blockedN} pending match(es) whose drafts failed verification` },
    { fm: "jobsearch-stale-pending", ok: Number(stalePending) === 0, detail: `${stalePending} pending match(es) not seen for 72 h` },
    { fm: "jobsearch-ledger-stale", ok: ledgerAge <= 90, detail: `ledger verified ${LEDGER_VERIFIED_ON}, ${ledgerAge} days old (limit 90)` },
    { fm: "jobsearch-intake-collapse", ok: !(recent.length >= 3 && recent.every((r) => Number(r.fetched) < 1000 || Number(r.passed) === 0)), detail: recent.map((r) => `${r.fetched}/${r.passed}`).join(" ") + " (fetched/passed, last 3 runs)" },
    { fm: "jobsearch-auth-unavailable", ok: !!env.EMAIL || !!env.LOOP_TOKEN, detail: `email sign-in ${env.EMAIL ? "bound" : "missing"}, loop token ${env.LOOP_TOKEN ? "set" : "not set"}` },
  ];
  return { worker: WORKER, version: VERSION, candidates_live: candidatesLive, candidates_probed: Object.values(CANDIDATE_BOARDS).flat().length, status: checks.every((c) => c.ok) ? "ok" : "degraded", checked_at: iso(now), last_run: last ? { id: last.id, finished_at: last.finished_at, fetched: last.fetched, passed: last.passed, stored: last.stored, blocked: last.blocked } : null, rerank: { status: rerank.rerank_status || "never", via: rerank.rerank_via || null, at: rerank.rerank_at || null, binding: !!(env.AI || env.QNFO_AI) }, feeds, matches_by_status: Object.fromEntries(counts.map((c) => [c.status, c.n])), checks };
}
const INDEX = {
  worker: WORKER, version: VERSION,
  routes: {
    "GET /": "web UI", "GET /api/matches?tier=A|B&status=&q=&limit=": "ranked matches without artifacts; default lists only undecided ones, status=mine lists your applications, status=all everything", "GET /api/matches/:id": "one match with resume_md and note_md",
    "GET /api/cv-skills": "open: the CV skills, the evidenced Ultrastable facts and the skills the owner confirmed by tap, read by rwnq8/resume (JOBSEARCH-SKILLS-1)", "GET /api/linkedin": "what to search on LinkedIn: boolean searches for the owner's target roles with LinkedIn, Google and Indeed links (JOBSEARCH-LINKEDIN-1)", "GET /api/runs": "recent pipeline runs", "GET /api/funnel": "applications to replies, interviews and offers by board kind and score band", "GET /api/ledger": "the claim ledger every output sentence must come from", "GET /api/ops": "operational self-report: the fm-jobsearch-* checks, feed health, counts", "GET /api/prefs": "the yes/no search survey with your answers; POST {answers:{id:true|false|null}} saves and re-runs the search", "POST /api/analyze": "{input: link or pasted posting text, title?, company?} -> fit, strengths, gaps, whether it would appear in your search, verified draft", "POST /api/feedback": "{title, company, verdict: like|dislike} teaches the search", "GET /api/outcomes": "funnel (matches, approved, applied, replies, interviews, offers), reply rate of applications older than 21 days, by tier", "POST /api/auth/request": "e-mail a 6-digit sign-in code to the owner", "POST /api/auth/verify": "{code} -> owner session (cookie jobs_session, 12 h)", "GET /api/auth/me": "signed-in state", "POST /api/auth/logout": "revoke the session", "POST /api/run": "trigger a run (10-minute cooldown)",
    "GET /api/referrals": "the best open matches with a referral kit link each", "GET /api/matches/:id/referral": "people-search links and a verified-facts message to ask someone you know for a referral (owner session)", "POST /api/matches/:id/stage": "record an interview stage {stage: recruiter_screen|hiring_manager|technical|take_home|panel|final|reference_check, note} (owner session)",
    "POST /api/matches/:id/status": "owner decision or outcome {status: approved|rejected|applied|replied|interview|offer|no_reply|pending_owner_approval}, logged as an event; needs an owner session or x-loop-token", "POST /api/answers": "draft free-response application answers {input, questions[]} from the verified record; pay, authorization and demographic questions come back owner_only", "POST /api/prep": "interview brief for a posting {input}: role summary, offer, gaps, STAR story picks, likely questions", "POST /api/prep/quiz": "feedback on one spoken answer {question, answer, role}", "POST /api/calibrate": "record your verdict {owner: qualified|stretch|not_qualified, title, company, rubric_fit, judge_fit}", "GET /api/calibration": "how often the rubric and the model reading agree with you", "GET /api/matches/:id/resume.pdf": "text PDF of the tailored resume (one column, selectable text)", "GET /health": "version", "GET /prep": "phone page: check fit with calibration, draft answers, interview brief and quiz", "GET /cv": "the CV page: interview, review, edit, resume per job, history", "GET /api/cv": "the CV bank, questions with answers, review queue (owner session)", "POST /api/cv/answer|fact|review|set|import": "edit the CV bank (owner session); GET /api/cv/export is the backup", "GET /api/cv/history": "resumes built for jobs", "GET /api/recall?match=": "prompted recall: yes/no/not sure questions about what a posting asks for and the CV cannot back yet (owner session); without match, the queue across open matches", "POST /api/recall/answer": "{key, answer: yes|no|unsure, role, depth: led|hands|team} -> a yes adds the shown sentence to the CV as a verified fact (owner session)",
  },
  policy: "nothing is sent; approval is a status change only",
};

const handler = {
  async scheduled(event, env, ctx) {
    env = __aiAttrEnv(env, "qnfo-jobsearch", "AI", "JOBS_DB");
    ctx.waitUntil(run(env).catch((e) => console.log("[jobsearch] run failed " + e.message)));
  },
  async fetch(request, env, ctx) {
    env = __aiAttrEnv(env, "qnfo-jobsearch", "AI", "JOBS_DB");
    const url = new URL(request.url), p = url.pathname, m = request.method;
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-loop-token", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    if (p === "/health") return J({ ok: true, worker: WORKER, version: VERSION, ledger_verified_on: LEDGER_VERIFIED_ON });
    if (p === "/" && m === "GET") return new Response(UI, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (p === "/api" && m === "GET") return J(INDEX);
    if (p === "/api/ledger" && m === "GET") { await loadBank(env); return J({ person: { ...LEDGER.person, sign_in_email: undefined }, owner_stated: LEDGER.owner_stated, unverified_needs_owner: LEDGER.unverified_needs_owner, facts: LEDGER.facts.filter((f) => ((BANK.facts.find((x) => x.id === f.id) || {}).source === "verified_cv")).map((f) => ({ id: f.id, text: f.text, employer: f.employer, period: f.period })), headlines: LEDGER.headlines }); }   // public: only the verified CV record; what the owner adds in the interview stays private
    if (p === "/api/ops" && m === "GET") { const rep = await opsReportCached(env, url.searchParams.get("fresh") === "1"); return J(rep, rep.status === "ok" ? 200 : 503); }
    if ((p === "/api/outcomes" || p === "/api/funnel") && m === "GET") return J(await outcomes(env));
    if (p === "/api/followups" && m === "GET") return J(await followups(env));
    if (p === "/api/linkedin" && m === "GET") return J(linkedinSearches(await loadCtx(env)));   // JOBSEARCH-LINKEDIN-1
    if (p === "/api/prefs" && m === "GET") {
      const ctx = await loadCtx(env);
      const fb = (await env.JOBS_DB.prepare("SELECT verdict, title FROM jobsearch_feedback ORDER BY id DESC LIMIT 20").all()).results;
      return J({ survey: SURVEY.map(([id, group, q, def]) => ({ id, group, q, default: def, answer: ctx.a[id] })), learned: { boost_words: [...ctx.learned.boost].slice(0, 30), block_words: [...ctx.learned.block].slice(0, 30), recent: fb } });
    }
    if (p === "/api/prefs" && m === "POST") {
      if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      let b = {}; try { b = await request.json(); } catch (e) { logErr("bad-json-body", e); }
      await ensure(env);
      const ans = {};
      const saved = await env.JOBS_DB.prepare("SELECT v FROM jobsearch_prefs WHERE k='survey'").first();
      if (saved) {
        try {
          const previous = JSON.parse(saved.v);
          if (previous && typeof previous === "object" && !Array.isArray(previous))
            for (const [id, v] of Object.entries(previous))
              if (SURVEY_IDS.has(id) && (v === true || v === false || v === null)) ans[id] = v;
        } catch (e) { logErr("prefs-parse", e); }
      }
      for (const [id, v] of Object.entries(b.answers || {})) { if (!SURVEY_IDS.has(id)) return J({ error: "unknown question " + id }, 400); if (v !== true && v !== false && v !== null) return J({ error: "answers are true, false or null" }, 400); ans[id] = v; }
      await env.JOBS_DB.prepare("INSERT INTO jobsearch_prefs (k, v, updated_at) VALUES ('survey', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=?1, updated_at=?2").bind(JSON.stringify(ans), new Date().toISOString()).run();
      ctx.waitUntil(run(env).catch((e) => logErr("rerun-after-prefs", e)));   // the owner's own change bypasses the run cooldown
      return J({ ok: true, saved: Object.keys(ans).length, rerun: true });
    }
    if (p === "/api/feedback" && m === "POST") {
      if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      let b = {}; try { b = await request.json(); } catch (e) { logErr("bad-json-body", e); }
      if (!["like", "dislike"].includes(b.verdict) || !b.title) return J({ error: "send {title, company, verdict: like|dislike}" }, 400);
      await ensure(env); await addFeedback(env, b.title, b.company, b.verdict, "check");
      return J({ ok: true });
    }
    if (p === "/api/analyze" && m === "POST") {
      if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      let b = {}; try { b = await request.json(); } catch (e) { logErr("bad-json-body", e); }
      try { return J(await analyzeJob(env, b)); } catch (e) { return J({ error: e.message }, e.status || 422); }
    }
    if ((p === "/api/answers" || p === "/api/prep" || p === "/api/prep/quiz" || p === "/api/calibrate") && m === "POST") {
      if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      let b = {}; try { b = await request.json(); } catch (e) { logErr("bad-json-body", e); }
      try {
        await ensure(env);
        if (p === "/api/answers") return J(await draftAnswers(env, b));
        if (p === "/api/prep") return J(await prepBrief(env, b));
        if (p === "/api/prep/quiz") return J(await quizFeedback(env, b));
        return J(await calibrate(env, b));
      } catch (e) { return J({ error: e.message }, e.status || 422); }
    }
    if (p === "/api/calibration" && m === "GET") { if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401); await ensure(env); return J(await calibration(env)); }
    if (p === "/api/cv-skills" && m === "GET") { await ensure(env); return J(await cvSkills(env)); }   // JOBSEARCH-SKILLS-1, open read for rwnq8/resume
    if (p === "/api/recall" || p === "/api/recall/answer") {
      // RECALL-CARD-1: the fleet dashboard card calls these through a service binding with the loop token, after its own owner-session check; a visitor gets 401
      if (!(await ownerSession(request, env)) && !(await tokenOk(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      try {
        await ensure(env);
        if (p === "/api/recall" && m === "GET") return J(await recallQueue(env, url.searchParams.get("match"), Math.min(40, +url.searchParams.get("limit") || 12)));
        if (p === "/api/recall/answer" && m === "POST") {
          let b; try { b = await request.json(); } catch (e) { return J({ error: "send a JSON body" }, 400); }
          const bank = await mutateBank(env, (bk) => recallAnswer(bk, b));
          const rec = (bank.recall || {})[b.key] || {};
          const fact = rec.fact ? bank.facts.find((f) => f.id === rec.fact) : null;
          // the search follows the answers: a yes adds evidence for that field, so matches there rank higher on the next run (at most one run in 10 minutes)
          const last = await env.JOBS_DB.prepare("SELECT started_at FROM jobsearch_runs ORDER BY id DESC LIMIT 1").first();
          if (rec.answer === "yes" && (!last || Date.now() - Date.parse(last.started_at) > 10 * 60 * 1000)) ctx.waitUntil(run(env).catch((e) => logErr("rerun-after-recall", e)));
          return J({ ok: true, rev: BANK_REV, answer: rec.answer, added: fact ? fact.text : null, skill: rec.skill || null });
        }
      } catch (e) { return J({ error: e.message }, e.status || 500); }
      return J({ error: "not found", see: "/api" }, 404);
    }
    if (p === "/prep" && m === "GET") return new Response(PREP_UI, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (p === "/cv" && m === "GET") return new Response(CV_UI, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (p === "/api/cv" || p.startsWith("/api/cv/")) {
      if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      try {
        if (p === "/api/cv" && m === "GET") return J(await cvState(env));
        if (p === "/api/cv/export" && m === "GET") { await loadBank(env); return new Response(JSON.stringify(BANK, null, 1), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=cv-backup.json", "cache-control": "no-store" } }); }
        if (p === "/api/cv/history" && m === "GET") return J({ items: (await env.JOBS_DB.prepare("SELECT id, ts, title, company, fit, verdict FROM jobsearch_history ORDER BY id DESC LIMIT 200").all()).results });
        const hm = p.match(/^\/api\/cv\/history\/(\d+)$/);
        if (hm && m === "GET") { const row = await env.JOBS_DB.prepare("SELECT * FROM jobsearch_history WHERE id=?").bind(+hm[1]).first(); return row ? J(row) : J({ error: "not found" }, 404); }
        const ops = { "/api/cv/answer": cvAnswer, "/api/cv/fact": cvFact, "/api/cv/review": cvReview, "/api/cv/set": cvSet, "/api/cv/import": cvImport };
        if (m === "POST" && ops[p]) {
          let b; try { b = await request.json(); } catch (e) { return J({ error: "send a JSON body" }, 400); }
          await mutateBank(env, (bank) => ops[p](bank, b));
          const last = await env.JOBS_DB.prepare("SELECT started_at FROM jobsearch_runs ORDER BY id DESC LIMIT 1").first();
          if (!last || Date.now() - Date.parse(last.started_at) > 10 * 60 * 1000) ctx.waitUntil(run(env).catch((e) => logErr("rerun-after-cv", e)));   // the search follows the CV; at most one run in 10 minutes
          return J({ ok: true, rev: BANK_REV });
        }
      } catch (e) { return J({ error: e.message }, e.status || 500); }
      return J({ error: "not found", see: "/api" }, 404);
    }
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
      // PROMPTED-RECALL-1 / JOBSEARCH-NEW-ONLY-1 (owner 2026-11-09: "if I've already applied to something, why are you still showing it to me?"): the default list is
      // only what is still undecided; status=mine is the applications (approved, applied, replied, interview, offer); status=all is everything.
      const MINE = ["approved", "applied", "replied", "interview", "offer"];
      const lim = Math.min(200, +url.searchParams.get("limit") || 100);
      // filter in SQL before the window: rejected and expired rows used to fill the 500-row window and push live matches out of it
      const where = [], args = [];
      if (status === "mine") where.push("status IN (" + MINE.map((x) => "'" + x + "'").join(",") + ")");
      else if (status && status !== "all") { where.push("status = ?"); args.push(status); } else if (!status) where.push("status = 'pending_owner_approval'");
      if (tier) { where.push("tier = ?"); args.push(tier); }
      await ensure(env); await loadBank(env);
      const r = await env.JOBS_DB.prepare("SELECT id, first_seen, last_seen, company, title, location, url, tier, score, why_json, flags_json, verified, blocked_reason, status, decided_at, gaps_json FROM jobsearch_matches" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY tier ASC, score DESC, last_seen DESC LIMIT 500").bind(...args).all();   // A, then B, then the stretch matches, each by score
      const cv = cvCorpus();
      let rows = r.results.map((x) => { const o = parseRow(x); o.recall_open = openGaps(parseGaps(x.gaps_json), cv).length; delete o.gaps_json; return o; });
      if (q) rows = rows.filter((x) => (x.title + " " + x.company + " " + x.location).toLowerCase().includes(q));
      if (!q && url.searchParams.get("diverse") !== "0") rows = diversifyRows(rows);   // JOBSEARCH-DIVERSE-1
      return J({ count: rows.length, matches: rows.slice(0, lim) });
    }
    const ax = p.match(/^\/api\/matches\/(.+?)\/(resume\.docx|resume\.pdf|resume\.html|resume\.txt|resume\.md|note\.txt|kit)$/);
    if (ax && m === "GET") {
      const row = await env.JOBS_DB.prepare("SELECT * FROM jobsearch_matches WHERE id=?").bind(decodeURIComponent(ax[1])).first();
      if (!row) return J({ error: "not found" }, 404);
      if (!row.verified) return J({ error: "artifacts failed verification: " + row.blocked_reason }, 409);
      if (ax[2] === "kit") {
        if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
        try { return J(await matchKit(env, row)); } catch (e) { return J({ error: e.message }, e.status || 502); }
      }
      if (!row.resume_md) return J({ error: "no draft is kept for this match" }, 404);
      return fileResponse(ax[2], row);
    }
    if (p === "/api/referrals" && m === "GET") { const ctx = await loadCtx(env); return J(await referralList(env, ctx)); }
    const rf = p.match(/^\/api\/matches\/(.+?)\/referral$/);
    if (rf && m === "GET") {
      if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      const row = await env.JOBS_DB.prepare("SELECT * FROM jobsearch_matches WHERE id=?").bind(decodeURIComponent(rf[1])).first();
      if (!row) return J({ error: "not found" }, 404);
      return J(referralKit(row, await loadCtx(env)));
    }
    const sg = p.match(/^\/api\/matches\/(.+?)\/stage$/);
    if (sg && m === "POST") {
      if (!(await ownerSession(request, env))) return J({ error: "sign in first: POST /api/auth/request, then POST /api/auth/verify" }, 401);
      let body = {}; try { body = await request.json(); } catch (e) { logErr("bad-json-stage", e); }
      if (!STAGES.includes(body.stage)) return J({ error: "stage must be one of " + STAGES.join("|") }, 400);
      const id = decodeURIComponent(sg[1]);
      if (!(await env.JOBS_DB.prepare("SELECT 1 AS x FROM jobsearch_matches WHERE id=?").bind(id).first())) return J({ error: "not found" }, 404);
      await env.JOBS_DB.prepare("INSERT INTO jobsearch_events (match_id, event, ts, note) SELECT ?1,?2,?3,?4 WHERE NOT EXISTS (SELECT 1 FROM jobsearch_events WHERE match_id=?1 AND event=?2)").bind(id, "stage:" + body.stage, new Date().toISOString(), String(body.note || "").slice(0, 300)).run();   // JOBSEARCH-STAGE-ONCE-1: a double tap or a retry records a stage once
      return J({ ok: true, id, stage: body.stage });
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
      if (!ALL_STATUSES.includes(body.status)) return J({ error: "status must be one of " + ALL_STATUSES.join("|") }, 400);
      if (body.reason !== undefined && !REASONS.includes(body.reason)) return J({ error: "reason must be one of " + REASONS.join("|") }, 400);
      const id = decodeURIComponent(mm[1]);
      const cur = await env.JOBS_DB.prepare("SELECT verified FROM jobsearch_matches WHERE id=?").bind(id).first();
      if (!cur) return J({ error: "not found" }, 404);
      if (!cur.verified && body.status !== "rejected" && body.status !== "pending_owner_approval") return J({ error: "artifacts failed verification; only rejected is allowed" }, 409);
      const tsNow = new Date().toISOString();
      let applicationNote = "owner";
      if (body.status === "rejected" || body.status === "applied" || body.status === "approved") {
        const mt = await env.JOBS_DB.prepare("SELECT title, company, tier, score, why_json FROM jobsearch_matches WHERE id=?").bind(id).first();
        if (mt) await addFeedback(env, mt.title, mt.company, body.status === "rejected" ? "dislike" : "like", "status", body.status === "rejected" ? body.reason || null : null);
        if (body.status === "applied" && mt) applicationNote = applicationSnapshot(mt);
      }
      await env.JOBS_DB.batch([
        env.JOBS_DB.prepare("UPDATE jobsearch_matches SET status=?, decided_at=? WHERE id=?").bind(body.status, tsNow, id),
        env.JOBS_DB.prepare("INSERT INTO jobsearch_events (match_id, event, ts, note) VALUES (?1, ?2, ?3, ?4)").bind(id, body.status, tsNow, applicationNote),
      ]);
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
handler.__test = { linkedinSearches, LINKEDIN_SEARCHES, codingLoad, CANDIDATE_BOARDS, collectAndRank, cosine, bestSim, semanticLens, scoreJob, exploreOverlap, recordTerms, diversifyRows, recallGaps, recallQuestion, recallAnswer, recallQueue, RECALL_SEED, loadCtx, referralKit, referralList, STAGES, judgeTop, buildResume, verify, headlineVerdict, outcomes, pdfOf, pdfClean, checkAnswer, jsonLoose, PROTECTED_Q, draftAnswers, prepBrief, quizFeedback, judgeJob, calibrate, calibration, followups, atsOf, keywordReport, docxOf, resumeHtml, plainOf, applyKit, matchKit, stripTags, postingTerms, evaluate, rank, buildResume, buildNote, verify, stripHtml, locationGate, has, LEDGER, dedupeKey, feedPrefix, makeCtx, scoreJob, scoreFeatures, featuresFromWhy, applicationSnapshot, parseApplicationSnapshot, outcomeScoreWeights, loadCtx, SURVEY, BOARDS, normKey, applyBank, BANK_SEED, QUESTIONS, TAG_TO_CLUSTERS, clustersOf, cvAnswer, cvFact, cvReview, cvSet, cvImport, mutateBank, loadBank, decidedKeys, FETCHERS, getBank: () => BANK, llmRerank, llmRerankRun, ensureResearchPubs, ensureAutonomyBrand, ensureUltrastableBrand, ultrastableBank, ultrastableSkillsBank, ULTRASTABLE_SKILL_FACTS, ULTRASTABLE_SKILLS, syncSkillAsks, skillAskOptions, cvSkills, ULTRASTABLE_S1, RESEARCH_PUBS, FAMILIES, CLUSTER_KW, headline, pubLine, parseRerank, reasonOk, rerankMessages, artifactsFor, titleCandidate, sitemapUrls, slugTitle, PUBLIC_SECTOR, opsReport };
export default handler;

// ------------------------------------------------------------------ client script shared by both pages (JOBSEARCH-APPLY-1): kit handling and the Fill application bookmark
const APPLY_JS = String.raw`
function kitBytes(b64){var s=atob(b64),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
function saveFile(name,b64){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([kitBytes(b64)]));a.download=name;document.body.appendChild(a);a.click();a.remove()}
function kitPayload(k){return JSON.stringify({v:1,fields:k.fields,note:k.note,file:k.resume_file,b64:k.resume_docx_b64})}
function fireKit(k){try{navigator.clipboard.writeText(kitPayload(k)).catch(function(e){console.warn('clipboard: '+e.message)})}catch(e){console.warn('clipboard: '+e.message)}saveFile(k.resume_file,k.resume_docx_b64);window.open(k.apply_url,'_blank','noopener')}
function kwHtml(kw){if(!kw)return '<div class="mute">Keyword match unavailable: the posting page could not be read.</div>';
 return '<h4>Keyword match: '+(kw.coverage==null?'n/a':kw.coverage+'%')+'</h4><div class="mute">On this resume: '+esc(kw.matched.join(', ')||'none')+'</div>'
  +(kw.addable.length?'<div class="mute">In your CV, left off this resume: '+esc(kw.addable.join(', '))+'</div>':'')
  +(kw.missing.length?'<div class="'+(window.CVPAGE?'gap':'flag')+'">The posting uses these and your CV does not (add to your CV only if true): '+esc(kw.missing.join(', '))+'</div>':'')}
async function FILL(){
 var k;
 try{k=JSON.parse(await navigator.clipboard.readText());if(!k||k.v!==1)throw 0}catch(e){alert('Press Apply on jobs.q08.org first: it puts the application kit on your clipboard. Then click this bookmark on the application page.');return}
 var F=k.fields,n=0;
 function lab(el){var t=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('autocomplete')];if(el.labels)for(var i=0;i<el.labels.length;i++)t.push(el.labels[i].innerText);var by=el.getAttribute('aria-labelledby');if(by)by.split(' ').forEach(function(x){var e=document.getElementById(x);if(e)t.push(e.innerText)});var p=el.closest('label,.field,.application-field,[class*=question]');if(p)t.push(p.innerText.slice(0,120));return t.join(' ').toLowerCase()}
 function put(el,v){var proto=el.tagName=='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));n++}
 [].slice.call(document.querySelectorAll('input,textarea')).forEach(function(el){
  if(['hidden','file','checkbox','radio','submit','button','password'].indexOf(el.type)>-1||el.value||el.disabled)return;
  var t=lab(el),v='';
  if(/first.?name|given.?name/.test(t))v=F.first_name;
  else if(/last.?name|family.?name|surname/.test(t))v=F.last_name;
  else if(el.type=='email'||/e-?mail/.test(t))v=F.email;
  else if(/linkedin/.test(t))v=F.linkedin;
  else if(/website|portfolio|personal site|other url/.test(t))v=F.website;
  else if(/full.?name|your name|^name|_name/.test(t)&&!/company|employer|school|user|referr/.test(t))v=F.full_name;
  else if(el.tagName=='INPUT'&&/location|city/.test(t)&&!/relocat/.test(t))v=F.location;
  else if(el.tagName=='TEXTAREA'&&/cover|additional|message/.test(t))v=k.note;
  if(v)put(el,v)});
 var fi=[].slice.call(document.querySelectorAll('input[type=file]')).filter(function(e){return !e.files.length});
 var rf=fi.filter(function(e){return /resume|cv|curriculum/.test(lab(e))})[0]||fi[0];
 if(rf){var s=atob(k.b64),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);var dt=new DataTransfer();dt.items.add(new File([u],k.file,{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));rf.files=dt.files;rf.dispatchEvent(new Event('change',{bubbles:true}));n++}
 alert('Filled '+n+' items'+(rf?', resume attached':'; no file box found, attach the downloaded resume')+'. Now answer the questions only you can answer (work authorization, salary, demographics), check everything, then press Submit yourself.')
}
function bookmarkHref(){return 'javascript:'+encodeURIComponent('('+FILL.toString().split(String.fromCharCode(10)).join(' ')+')()')}
`;

// ------------------------------------------------------------------ web UI (light theme, plain JS, talks only to the API above)
const RECALL_UI_JS = String.raw`
// PROMPTED-RECALL-1 front end: simple cards (Apply, Not for me, Open posting, More) and yes / no / not sure questions before every application.
var LASTV=(function(){try{var v=localStorage.getItem('jobs_last_visit')||'';localStorage.setItem('jobs_last_visit',new Date().toISOString());return v}catch(e){return ''}})();
var MINE_STEPS=[['replied','Got a reply'],['interview','Interview'],['offer','Offer'],['no_reply','No reply']];
function cardHtml(x){
 var id=esc(x.id),mine=['approved','applied','replied','interview','offer'].indexOf(x.status)>=0,nq=x.recall_open||0;
 var h='<div class="card" id="c-'+id+'"><div class="row"><span class="badge '+x.tier+'">'+x.tier+' '+x.score+'</span>'+(LASTV&&x.first_seen>LASTV?'<span class="badge new">New</span>':'')+'<span class="t">'+esc(x.title)+'</span></div>'
  +'<div class="mute">'+esc(x.company)+' | '+esc(x.location||'n/a')+(via(x.id)?' | via '+esc(via(x.id)):'')+(mine||x.status!=='pending_owner_approval'?' | <span class="st '+esc(x.status)+'">'+esc(x.status.replace(/_/g,' '))+'</span>':'')+'</div>'
  +'<div class="mute">'+esc(x.why.join(' | '))+'</div>'+x.flags.map(function(f){return '<div class="flag">Check: '+esc(f)+'</div>'}).join('')
  +(x.verified?'':'<div class="flag">Draft blocked by the checker: '+esc(x.blocked_reason)+'</div>');
 h+='<div class="acts big">';
 if(mine){h+=MINE_STEPS.map(function(o){return '<button data-do="decide" data-s="'+o[0]+'">'+o[1]+'</button>'}).join('')}
 else{h+=(x.verified?'<button class="p ap" data-id="'+id+'" data-q="'+nq+'">'+(nq?'Apply ('+nq+' quick question'+(nq>1?'s':'')+' first)':'Apply')+'</button>':'')+'<button data-do="reject">Not for me</button>'}
 h+='<a href="'+esc(x.url)+'" target="_blank" rel="noopener"><button>Open posting</button></a><button data-do="more">More</button></div>';
 h+='<div class="acts more"><button data-do="show">Resume and note</button>'+(x.verified?'<a href="/api/matches/'+encodeURIComponent(x.id)+'/resume.pdf"><button>Resume .pdf</button></a><a href="/api/matches/'+encodeURIComponent(x.id)+'/resume.docx"><button>Resume .docx</button></a>':'')
  +(mine?'':'<button data-do="decide" data-s="approved">Save for later</button><button data-do="decide" data-s="applied">I already applied</button>')
  +'<button data-do="referral">Referral</button><select data-do="stage"><option value="">Interview stage</option>'+['recruiter_screen','hiring_manager','technical','take_home','panel','final','reference_check'].map(function(t){return '<option>'+t+'</option>'}).join('')+'</select></div><div class="art"></div></div>';
 return h}
function emptyHtml(){var s=$('#status').value;return '<div class="ds-empty">'+(s==='mine'?'<b>No applications yet</b>Jobs you apply to move here and leave the new list.':s?'<b>Nothing with this status</b>Pick another view above.':'<b>No new jobs right now</b>The search runs every hour. Jobs you applied to or turned down never come back.')+'</div>'}
$('#list').addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-do]');if(!b||b.tagName==='SELECT')return;var card=b.closest('.card'),id=card.id.slice(2),d=b.dataset.do;
 if(d==='more')card.querySelector('.more').classList.toggle('on');else if(d==='reject')reject(id);else if(d==='decide')decide(id,b.dataset.s);else if(d==='show')show(id);else if(d==='referral')referral(id)});
$('#list').addEventListener('change',function(e){var s=e.target.closest&&e.target.closest('select[data-do="stage"]');if(s)stage(s.closest('.card').id.slice(2),s)});
// one question at a time: Yes -> where -> how involved (each button shows the exact sentence it adds); No and Not sure move on
function runRecall(box,qs,done){var i=0,added=[];
 function post(q,body){return authed(function(){return api('/api/recall/answer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({key:q.key},body))})})}
 function next(){if(i>=qs.length){done(added);return}var q=qs[i];
  box.innerHTML='<div class="rq"><div class="ds-step">Question '+(i+1)+' of '+qs.length+'</div><div class="ds-progress" aria-hidden="true"><i style="width:'+Math.round((i+1)/qs.length*100)+'%"></i></div><div class="ds-q">'+esc(q.ask)+'</div>'+(q.cue?'<div class="mute cue">'+esc(q.cue)+'</div>':'')
   +'<div class="ds-choices" role="group" aria-label="Your answer"><button data-a="yes">Yes</button><button data-a="no">No</button><button data-a="unsure">Not sure</button></div><div class="rstep"></div><div class="rmsg mute" role="status"></div></div>';
  var step=box.querySelector('.rstep'),msg=box.querySelector('.rmsg');
  function save(body){msg.textContent='Saving...';post(q,body).then(function(r){if(r.added)added.push(r.added);msg.textContent=r.added?'Added to your CV: “'+r.added+'”':'Noted.';i++;setTimeout(next,r.added?1100:250)}).catch(function(err){msg.textContent=err.message})}
  box.querySelector('[data-a="no"]').onclick=function(){save({answer:'no'})};
  box.querySelector('[data-a="unsure"]').onclick=function(){save({answer:'unsure'})};
  box.querySelector('[data-a="yes"]').onclick=function(){box.querySelectorAll('[data-a]').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.a==='yes'?'true':'false')});
   step.innerHTML='<h4>Where?</h4><div class="ds-options">'+q.roles.map(function(r){return '<button data-r="'+esc(r.id)+'">'+esc(r.label)+'</button>'}).join('')+'<button data-r="">Somewhere else</button></div>';
   step.querySelectorAll('[data-r]').forEach(function(rb){rb.onclick=function(){var role=rb.dataset.r;
    step.innerHTML='<h4>How involved were you?</h4><div class="ds-options">'+q.depths.map(function(d){return '<button data-d="'+d.id+'"><b>'+esc(d.label)+'</b><br><span class="mute">Adds: “'+esc(d.draft)+'”</span></button>'}).join('')+'</div>';
    step.querySelectorAll('[data-d]').forEach(function(db){db.onclick=function(){save({answer:'yes',role:role,depth:db.dataset.d})}})}})}}
 next()}
// before every application: the questions for this job, then the kit is rebuilt with the new lines
async function recallGate(card,id,el){var d;el.innerHTML='<div class="mute">Checking what this job asks for that your CV does not show yet...</div>';
 try{d=await authed(function(){return api('/api/recall?match='+encodeURIComponent(id))})}catch(err){el.innerHTML='<div class="flag">'+esc(err.message)+'</div>';return false}
 if(!d.questions.length){card.dataset.recalled='1';el.innerHTML='';return true}
 el.innerHTML='<div class="note"><b>Before you apply:</b> this job asks for things your CV does not show yet. Tap an answer; a yes goes onto your CV and into this resume.</div><div class="rbox"></div>';
 runRecall(el.querySelector('.rbox'),d.questions,function(added){card.dataset.recalled='1';delete KITS[id];delete KREADY[id];
  var ap=card.querySelector('.ap');if(ap)ap.textContent='Apply';
  el.innerHTML='<div class="note">'+(added.length?'<b>Added '+added.length+' line'+(added.length>1?'s':'')+' to your CV.</b> This resume now includes '+(added.length>1?'them':'it')+'.':'<b>Done.</b> Nothing new to add for this job.')+'</div><div class="acts big"><button class="p ap" data-id="'+esc(id)+'">Build my application</button></div>'});
 return false}
// "Questions about you": the queue across all open jobs, most-asked first, plus questions about the work that leads to autonomous systems research
async function openRecall(){var p=$('#recallpanel');['#vnew','#vmine','#ready'].forEach(function(k){$(k).setAttribute('aria-pressed','false')});$('#recallbtn').setAttribute('aria-pressed','true');p.style.display='';p.innerHTML='<div class="mute">Loading questions...</div>';var d;
 try{d=await authed(function(){return api('/api/recall?limit=15')})}catch(err){p.innerHTML='<div class="flag">'+esc(err.message)+'</div>';return}
 if(!d.questions.length){p.innerHTML='<div class="note">No open questions. New ones appear when new jobs ask for something your CV does not show.</div>';return}
 p.innerHTML='<div class="note"><b>Questions about you</b> ('+d.total+' open). Yes / no / not sure; nothing to type. A yes adds the line shown on the button to your CV.</div><div class="rbox"></div>';
 runRecall(p.querySelector('.rbox'),d.questions,function(added){p.innerHTML='<div class="note"><b>Thanks.</b> '+added.length+' new line'+(added.length===1?'':'s')+' on your CV. <button id="rmore">More questions</button> <button id="rclose">Close</button></div>';$('#rmore').onclick=openRecall;$('#rclose').onclick=function(){p.style.display='none'};load()})}
$('#recallbtn').onclick=openRecall;
$('#vnew').onclick=function(){$('#status').value='';$('#tier').value='';load()};$('#vmine').onclick=function(){$('#status').value='mine';$('#tier').value='';load()};
function segSync(){var s=$('#status').value,t=$('#tier').value;[['#vnew',!s&&!t],['#vmine',s==='mine'],['#ready',!s&&t==='A']].forEach(function(x){$(x[0]).setAttribute('aria-pressed',x[1]?'true':'false')})}
`;
// DESIGN-SYSTEM-1:BEGIN (sourced from _shared/design-system.js; applied by _shared/inline-design-system.mjs; do not edit inside a worker)
// ---- DESIGN-SYSTEM-1 (owner directive 2026-11-09). One design system for every page a person opens on q08.org, qnfo.org or qwav.org.
//
// WHAT. Design tokens (colour, type, spacing, radius, tap size) for a light and a dark theme, the CSS built from them, and the component
// classes every fleet page uses: top bar, page, card, button (primary, secondary, quiet), segmented control, Yes / No / Not sure choices,
// stat tiles, notes, badges, fields, disclosure, tables that scroll instead of crushing, empty states. Plus dsContrast(), so the contrast of
// every text and control colour pair is proven by '_shared/design-system.test.mjs' (WCAG 2.2 AA), and dsLint(), the check that fails a
// page with text under 13 px, a field under 16 px (iOS zooms) or a button under the 44 px tap size.
//
// WHY. Owner, 2026-11-09: "bad UI makes me sad ... the job site and even the markets ... are great examples of bad design ... implement
// design standards ... Don't give me shitty design anywhere." Before this file each worker carried its own inline palette (jobs: 13 px
// muted text and 12 px badges; markets: an unstyled 15 px system page with 8 px buttons and tables that broke words letter by letter on a
// phone). The standard below is written once here and inlined into each page's worker.
//
// THE STANDARD (what every page follows; the test enforces the parts a machine can check).
//  1. One primary action per screen. Exactly one .btn-primary is visible in a view; everything else is secondary or quiet.
//  2. Hierarchy before decoration. A page title, one sentence of status, then the content. Status lines are stat tiles, not run-on text.
//  3. Tap, do not type. Choices are buttons (Yes / No / Not sure, segmented views), never free text or tiny radio buttons. 44 px minimum.
//  4. Progressive disclosure. Secondary tools, links and explanations sit behind a "More" disclosure, not in the top bar.
//  5. Calm. Neutral surfaces, one accent colour, colour carries meaning only for good / warning / bad, generous spacing (8 px scale).
//  6. Readable. 16 px body, 14 px minimum for secondary text, line length under 75 characters for prose, tabular numbers in figures.
//  7. Accessible. WCAG 2.2 AA contrast in both themes, visible focus ring, labels on every field, reduced motion respected.
//  8. Every state designed. Loading, empty and error states say what happens next in one sentence.
//
// HOW TO ADOPT. 1) 'node _shared/inline-design-system.mjs <worker> --anchor "<line prefix>"' once (later runs replace the block in place,
// '--check' reports a stale copy). 2) Put '<style>${DS_CSS}</style>' (or dsHead(title)) in the page head and give <body> class="ds".
// 3) Build with the classes below; page-specific CSS uses the var(--ds-*) tokens, never raw hex. 4) Add the worker to ADOPTERS in
// '_shared/design-system.test.mjs', which renders the page and runs dsLint on it.
//
// RULES FOR EDITING. ES5 style (var and function), no import or export, every name starts with DS_ or ds, no '*' followed by '/' inside a
// comment, no backtick anywhere (the block is inlined into workers that hold their pages in template literals). Version every change in DS_VERSION.
var DS_VERSION = "1.0.0";

var DS_TOKENS = {
  light: {
    bg: "#f5f6f8", surface: "#ffffff", surface2: "#eef1f5", ink: "#15181e", ink2: "#4b5363", line: "#d5dae1", lineStrong: "#7b8494",
    accent: "#1d4ed8", accentHover: "#1e40af", onAccent: "#ffffff", accentSoft: "#e3eaff", accentSoftInk: "#1e3a8a",
    good: "#166534", goodSoft: "#dcfce7", warn: "#854d0e", warnSoft: "#fef3c7", bad: "#b42318", badSoft: "#fee4e2", focus: "#2563eb"
  },
  dark: {
    bg: "#0e1116", surface: "#161a21", surface2: "#1d222b", ink: "#e8ebf0", ink2: "#a4adbb", line: "#2b313c", lineStrong: "#6b7385",
    accent: "#8cb4ff", accentHover: "#a9c6ff", onAccent: "#0a1530", accentSoft: "#1b2a4a", accentSoftInk: "#c7d8ff",
    good: "#6ee7a0", goodSoft: "#12301f", warn: "#f6c453", warnSoft: "#33270d", bad: "#ff9a8f", badSoft: "#3a1715", focus: "#8cb4ff"
  },
  font: "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
  mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  size: { small: 14, body: 16, lead: 18, h3: 17, h2: 20, h1: 26, stat: 26 },
  space: [0, 4, 8, 12, 16, 24, 32, 48],
  radius: { s: 8, m: 12, l: 16, pill: 999 },
  tap: 44,
  maxWidth: 960
};

// The pairs whose contrast the test proves in both themes: [foreground token, background token, minimum ratio].
var DS_CONTRAST_PAIRS = [
  ["ink", "bg", 4.5], ["ink", "surface", 4.5], ["ink", "surface2", 4.5], ["ink2", "bg", 4.5], ["ink2", "surface", 4.5], ["ink2", "surface2", 4.5],
  ["accent", "surface", 4.5], ["accent", "bg", 4.5], ["onAccent", "accent", 4.5], ["onAccent", "accentHover", 4.5], ["accentSoftInk", "accentSoft", 4.5],
  ["good", "surface", 4.5], ["good", "goodSoft", 4.5], ["warn", "surface", 4.5], ["warn", "warnSoft", 4.5], ["bad", "surface", 4.5], ["bad", "badSoft", 4.5],
  ["ink", "warnSoft", 4.5], ["ink", "goodSoft", 4.5], ["ink", "badSoft", 4.5], ["ink", "accentSoft", 4.5],
  ["lineStrong", "surface", 3], ["focus", "surface", 3], ["focus", "bg", 3]
];

function dsLum(hex) {
  var h = String(hex).replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var c = [0, 2, 4].map(function (i) { var v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function dsContrast(a, b) { var x = dsLum(a), y = dsLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

function dsVars(t) {
  var map = { bg: "bg", surface: "surface", surface2: "surface-2", ink: "ink", ink2: "ink-2", line: "line", lineStrong: "line-strong", accent: "accent",
    accentHover: "accent-hover", onAccent: "on-accent", accentSoft: "accent-soft", accentSoftInk: "accent-soft-ink", good: "good", goodSoft: "good-soft",
    warn: "warn", warnSoft: "warn-soft", bad: "bad", badSoft: "bad-soft", focus: "focus" };
  return Object.keys(map).map(function (k) { return "--ds-" + map[k] + ":" + t[k]; }).join(";");
}

var DS_CSS = [
  "/* DESIGN-SYSTEM-1 v" + DS_VERSION + " (_shared/design-system.js) */",
  ":root{color-scheme:light dark;" + dsVars(DS_TOKENS.light) + ";--ds-font:" + DS_TOKENS.font + ";--ds-mono:" + DS_TOKENS.mono + ";--ds-tap:" + DS_TOKENS.tap + "px;--ds-r-s:8px;--ds-r-m:12px;--ds-r-l:16px;--ds-shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08)}",
  "@media (prefers-color-scheme:dark){:root{" + dsVars(DS_TOKENS.dark) + ";--ds-shadow:none}}",
  "*,*::before,*::after{box-sizing:border-box}",
  "body.ds{margin:0;background:var(--ds-bg);color:var(--ds-ink);font:16px/1.55 var(--ds-font);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}",
  ".ds a{color:var(--ds-accent);text-underline-offset:2px}.ds a:hover{color:var(--ds-accent-hover)}",
  ".ds h1,.ds h2,.ds h3{line-height:1.25;margin:0 0 8px;letter-spacing:-.01em}.ds h1{font-size:26px;font-weight:700}.ds h2{font-size:20px;font-weight:650;margin-top:32px}.ds h3{font-size:17px;font-weight:650}",
  ".ds p{margin:0 0 12px}.ds small,.ds-muted{color:var(--ds-ink-2);font-size:14px}",
  ".ds :focus-visible{outline:3px solid var(--ds-focus);outline-offset:2px;border-radius:6px}",
  ".ds-skip{position:absolute;left:-9999px}.ds-skip:focus{left:16px;top:8px;z-index:20;background:var(--ds-surface);padding:8px 12px}",
  ".ds-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  // top bar and page
  ".ds-top{position:sticky;top:0;z-index:10;background:var(--ds-surface);border-bottom:1px solid var(--ds-line)}",
  ".ds-top-in{max-width:960px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;min-height:60px}",
  ".ds-brand{font-weight:700;font-size:17px;color:var(--ds-ink);text-decoration:none;margin-right:auto;display:flex;align-items:center;gap:8px}",
  ".ds-brand small{font-weight:500}",
  ".ds-main{max-width:960px;margin:0 auto;padding:20px 16px 64px}",
  ".ds-head{margin:4px 0 20px}.ds-head p{color:var(--ds-ink-2);margin:4px 0 0}",
  // buttons
  ".ds .btn,.ds button.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;min-width:44px;padding:10px 16px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:600 15px/1.2 var(--ds-font);cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s}",
  ".ds .btn:hover{background:var(--ds-surface-2)}.ds .btn:disabled,.ds .btn[aria-disabled=true]{opacity:.55;cursor:not-allowed}",
  ".ds .btn.btn-primary{background:var(--ds-accent);border-color:var(--ds-accent);color:var(--ds-on-accent)}.ds .btn.btn-primary:hover{background:var(--ds-accent-hover);border-color:var(--ds-accent-hover);color:var(--ds-on-accent)}",
  ".ds .btn.btn-quiet{background:transparent;border-color:transparent;color:var(--ds-accent)}.ds .btn.btn-quiet:hover{background:var(--ds-accent-soft)}",
  ".ds .btn.btn-block{width:100%}.ds .btn.btn-lg{min-height:52px;font-size:16px;padding:12px 20px}",
  ".ds-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}",
  // segmented control (views)
  ".ds-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;padding:4px;background:var(--ds-surface-2);border-radius:var(--ds-r-m)}",
  "@media (max-width:560px){.ds-seg{grid-auto-flow:row;grid-template-columns:1fr 1fr}}",
  ".ds-seg button{min-height:44px;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--ds-ink-2);font:600 15px var(--ds-font);cursor:pointer;line-height:1.2}",
  ".ds-seg button[aria-pressed=true],.ds-seg button[aria-selected=true]{background:var(--ds-surface);color:var(--ds-ink);box-shadow:var(--ds-shadow)}",
  // Yes / No / Not sure
  ".ds-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}",
  ".ds-choices button{min-height:56px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:600 16px var(--ds-font);cursor:pointer}",
  ".ds-choices button:hover{border-color:var(--ds-accent);background:var(--ds-accent-soft)}",
  ".ds-choices button[aria-pressed=true]{background:var(--ds-accent);border-color:var(--ds-accent);color:var(--ds-on-accent)}",
  ".ds-options{display:grid;gap:8px;margin-top:12px}.ds-options button{text-align:left;min-height:56px;padding:12px 16px;border-radius:var(--ds-r-m);border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:16px/1.4 var(--ds-font);cursor:pointer}",
  ".ds-options button:hover{border-color:var(--ds-accent);background:var(--ds-accent-soft)}.ds-options button b{display:block;font-weight:650}",
  ".ds-q{font-size:18px;font-weight:650;line-height:1.35;margin:6px 0}.ds-step{font-size:14px;color:var(--ds-ink-2);font-weight:600;letter-spacing:.02em}",
  ".ds-progress{height:6px;border-radius:99px;background:var(--ds-surface-2);overflow:hidden;margin:8px 0 4px}.ds-progress>i{display:block;height:100%;background:var(--ds-accent);border-radius:99px}",
  // cards, notes, badges
  ".ds-card{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-l);padding:16px;margin:0 0 12px;box-shadow:var(--ds-shadow)}",
  ".ds-card-title{font-size:17px;font-weight:650;line-height:1.35;margin:0}",
  ".ds-meta{color:var(--ds-ink-2);font-size:14px;margin-top:4px}",
  ".ds-note{border-radius:var(--ds-r-m);padding:12px 14px;margin:0 0 12px;background:var(--ds-accent-soft);color:var(--ds-ink);font-size:15px}",
  ".ds-note-warn{background:var(--ds-warn-soft)}.ds-note-good{background:var(--ds-good-soft)}.ds-note-bad{background:var(--ds-bad-soft)}",
  ".ds-badge{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;line-height:1;padding:5px 9px;border-radius:99px;background:var(--ds-surface-2);color:var(--ds-ink);white-space:nowrap}",
  ".ds-badge-accent{background:var(--ds-accent-soft);color:var(--ds-accent-soft-ink)}.ds-badge-good{background:var(--ds-good-soft);color:var(--ds-good)}.ds-badge-warn{background:var(--ds-warn-soft);color:var(--ds-warn)}.ds-badge-bad{background:var(--ds-bad-soft);color:var(--ds-bad)}",
  ".ds-good{color:var(--ds-good)}.ds-warn{color:var(--ds-warn)}.ds-bad{color:var(--ds-bad)}",
  // stats
  ".ds-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 16px}",
  ".ds-stat{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-m);padding:12px 14px}",
  ".ds-stat .k{font-size:14px;color:var(--ds-ink-2)}.ds-stat .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2;margin-top:2px}",
  // fields
  ".ds input:not([type=radio]):not([type=checkbox]),.ds select,.ds textarea{font:16px/1.4 var(--ds-font);color:var(--ds-ink);background:var(--ds-surface);border:1px solid var(--ds-line-strong);border-radius:var(--ds-r-s);padding:10px 12px;min-height:44px;max-width:100%}",
  ".ds textarea{width:100%}.ds label{font-size:15px}",
  ".ds-field{display:grid;gap:4px;margin:0 0 12px}.ds-field>span{font-size:14px;font-weight:600;color:var(--ds-ink-2)}",
  // disclosure
  ".ds details.ds-more{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-l);margin:0 0 12px}",
  ".ds details.ds-more>summary{list-style:none;cursor:pointer;min-height:52px;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;font-weight:650}",
  ".ds details.ds-more>summary::-webkit-details-marker{display:none}.ds details.ds-more>summary::after{content:'+';font-size:22px;color:var(--ds-ink-2);font-weight:400}",
  ".ds details.ds-more[open]>summary::after{content:'\\2212'}.ds details.ds-more>.ds-more-body{padding:0 16px 16px}",
  // tables: scroll, never crush
  ".ds-table-wrap{overflow-x:auto;border:1px solid var(--ds-line);border-radius:var(--ds-r-m);background:var(--ds-surface)}",
  ".ds-table{width:100%;border-collapse:collapse;font-size:15px}.ds-table th{font-size:13px;font-weight:650;color:var(--ds-ink-2);text-transform:uppercase;letter-spacing:.04em;text-align:left;background:var(--ds-surface-2)}",
  ".ds-table th,.ds-table td{padding:10px 12px;border-bottom:1px solid var(--ds-line);vertical-align:top}.ds-table tr:last-child td{border-bottom:0}",
  ".ds-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ds-table td.title{min-width:200px}",
  // lists of items as cards on phones
  ".ds-rows{display:grid;gap:8px}.ds-row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:var(--ds-r-m);padding:12px 14px}",
  ".ds-row .main{min-width:0;flex:1}.ds-row .side{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
  // empty and loading
  ".ds-empty{text-align:center;padding:32px 16px;color:var(--ds-ink-2);border:1px dashed var(--ds-line-strong);border-radius:var(--ds-r-l)}",
  ".ds-empty b{display:block;color:var(--ds-ink);font-size:17px;margin-bottom:4px}",
  ".ds pre{white-space:pre-wrap;background:var(--ds-surface-2);border-radius:var(--ds-r-s);padding:12px;font:14px/1.5 var(--ds-mono);overflow-x:auto}",
  ".ds hr{border:0;border-top:1px solid var(--ds-line);margin:24px 0}",
  "@media (max-width:640px){.ds-hide-sm{display:none!important}.ds h1{font-size:23px}.ds-top-in{padding:8px 12px}}",
  "@media (prefers-reduced-motion:reduce){.ds *{transition:none!important;animation:none!important}}"
].join("\n");

function dsEsc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// The head of a page: charset, viewport, title, description, theme colours and the design system CSS. extraCss uses var(--ds-*) only.
function dsHead(title, description, extraCss) {
  return "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><title>" + dsEsc(title) + "</title>"
    + (description ? "<meta name=\"description\" content=\"" + dsEsc(description) + "\">" : "")
    + "<meta name=\"theme-color\" content=\"" + DS_TOKENS.light.surface + "\" media=\"(prefers-color-scheme: light)\"><meta name=\"theme-color\" content=\"" + DS_TOKENS.dark.surface + "\" media=\"(prefers-color-scheme: dark)\">"
    + "<style>" + DS_CSS + (extraCss ? "\n" + extraCss : "") + "</style>";
}

// Machine-checkable parts of the standard, run on a rendered page. Returns a list of problems (empty when the page passes).
function dsLint(html) {
  var out = [], m, re;
  if (String(html).indexOf("DESIGN-SYSTEM-1 v") < 0) out.push("page does not include DS_CSS");
  if (!/<body[^>]*class="[^"]*\bds\b/.test(html)) out.push("body is missing class=\"ds\"");
  if (!/name="?viewport"?/.test(html)) out.push("no viewport meta");
  re = /font(?:-size)?\s*:\s*(?:[0-9]+\s+)?([0-9.]+)px/g;
  while ((m = re.exec(html))) { if (+m[1] < 13) out.push("text under 13px: " + m[0]); }
  re = /min-height\s*:\s*([0-9.]+)px/g;
  var css = String(html).split("<style>").slice(1).map(function (s) { return s.split("</style>")[0]; }).join("\n");
  re = /(button|\.btn)[^{}]*\{[^}]*min-height\s*:\s*([0-9.]+)px/g;
  while ((m = re.exec(css))) { if (+m[2] < 40) out.push("button under the tap size: " + m[0].slice(0, 80)); }
  if (/style="[^"]*#[0-9a-fA-F]{3,6}/.test(html)) out.push("inline style with a raw hex colour (use var(--ds-*))");
  var prim = (html.match(/class="[^"]*\bbtn-primary\b/g) || []).length;
  if (prim > 1) out.push("more than one primary button in the static page (" + prim + ")");
  return out;
}
// DESIGN-SYSTEM-1:END
// JOBS-DESIGN-1 (DESIGN-SYSTEM-1, owner 2026-11-09): the matches page on the shared design system. The list comes first; one row of views
// (New jobs, My applications, Ready to apply, Questions about you); search; then the tools behind closed disclosures. The page CSS below maps
// the classes the page script already emits (card, badge, acts, note, rq ...) onto the design tokens, so the script keeps working unchanged.
const JOBS_PAGE_CSS = ".js-search{margin:12px 0 16px}.js-search input{width:100%}"
 + ":where(.ds main button:not(.ds-seg button,.ds-choices button,.ds-options button)){display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:10px 16px;border-radius:12px;border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:600 15px/1.2 var(--ds-font);cursor:pointer}"
 + ":where(.ds main button:not(.ds-seg button,.ds-choices button,.ds-options button)):hover{background:var(--ds-surface-2)}.ds main button:disabled{opacity:.55;cursor:not-allowed}"
 + ".ds main button.p,.ds main button.btn-primary{background:var(--ds-accent);border-color:var(--ds-accent);color:var(--ds-on-accent)}.ds main button.p:hover{background:var(--ds-accent-hover)}"
 + ".card{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:16px;padding:16px;margin:0 0 12px;box-shadow:var(--ds-shadow)}"
 + ".row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.t{font-weight:650;font-size:17px;line-height:1.35}.card .row .t{flex-basis:100%;order:2;margin-top:6px}"
 + ".badge{display:inline-flex;font-size:13px;font-weight:700;line-height:1;padding:5px 9px;border-radius:99px;background:var(--ds-surface-2);color:var(--ds-ink)}"
 + ".badge.A{background:var(--ds-good-soft);color:var(--ds-good)}.badge.B{background:var(--ds-warn-soft);color:var(--ds-warn)}.badge.C{background:var(--ds-surface-2);color:var(--ds-ink-2)}.badge.new{background:var(--ds-accent-soft);color:var(--ds-accent-soft-ink)}"
 + ".mute{color:var(--ds-ink-2);font-size:14px;margin-top:4px}.flag{color:var(--ds-bad);font-size:14px;margin-top:6px}.flag::before{content:'! ';font-weight:700}"
 + ".st{font-size:13px;font-weight:600;border:1px solid var(--ds-line-strong);border-radius:99px;padding:2px 8px}.st.approved,.st.applied{border-color:var(--ds-good);color:var(--ds-good)}.st.rejected{border-color:var(--ds-bad);color:var(--ds-bad)}"
 + ".acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.acts a{text-decoration:none}.acts.col{flex-direction:column;align-items:stretch}.more{display:none}.more.on{display:flex}"
 + ".card .acts.big .ap{flex:1 1 100%}.card .acts.big>:not(.ap){flex:1 1 0}.card .acts.big>a>button{width:100%}.card .acts.big button{padding-left:10px;padding-right:10px}"
 + ".note{background:var(--ds-accent-soft);color:var(--ds-ink);border-radius:12px;padding:12px 14px;font-size:15px;margin:0 0 12px}"
 + ".rq{border:1px solid var(--ds-line);border-radius:16px;padding:16px;margin-top:12px;background:var(--ds-surface)}.rq .t{font-size:18px;margin:6px 0}.cue{font-style:normal}.rmsg{margin-top:8px}#recallpanel .rq{border:0;padding:0;margin-top:8px}"
 + ".bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}"
 + ".q{padding:12px 0;border-top:1px solid var(--ds-line)}.q>span{display:block;font-weight:600;margin-bottom:8px}.q .ds-choices{margin-top:0}"
 + "h4{font-size:15px;margin:16px 0 6px}pre{white-space:pre-wrap;background:var(--ds-surface-2);border-radius:8px;padding:12px;font:14px/1.5 var(--ds-mono)}"
 + "ul{padding-left:20px;margin:6px 0}#signbox{margin-bottom:12px}#signbox input{width:10ch}"
 + ".lis{border-top:1px solid var(--ds-line);padding:12px 0}.lis:first-of-type{border-top:0}"   // JOBSEARCH-LINKEDIN-1
 + ".js-tools h2{margin-top:32px}.js-links{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:12px;font-size:15px}";
const UI = `<!doctype html><html lang="en"><head>${dsHead("Job matches", "Job matches for an autonomous AI systems researcher, each resume line checked against the claim ledger.", JOBS_PAGE_CSS)}</head><body class="ds">
<a class="ds-skip" href="#list">Skip to the job list</a>
<header class="ds-top"><div class="ds-top-in"><a class="ds-brand" href="/">Jobs</a><a class="btn btn-quiet" href="/cv">My CV</a><span id="who" class="ds-muted ds-hide-sm"></span><button class="btn" id="signin" onclick="signIn()">Sign in</button><button class="btn btn-quiet" id="signout" style="display:none" onclick="api(\'/api/auth/logout\',{method:\'POST\'}).then(who)">Sign out</button></div></header>
<main class="ds-main"><div class="ds-head"><h1>Your job matches</h1><p id="meta">Loading your matches…</p></div>
<div class="ds-seg" role="group" aria-label="Which jobs to show"><button id="vnew" aria-pressed="true">New jobs</button><button id="vmine" aria-pressed="false">My applications</button><button id="ready" aria-pressed="false">Ready to apply</button><button id="recallbtn" aria-pressed="false">Questions about you</button></div>
<div class="js-search"><label class="ds-sr" for="q">Search</label><input id="q" type="search" placeholder="Search title, company or place" autocomplete="off"></div>
<div id="recallpanel" class="card" style="display:none"></div><div id="follow"></div><div id="list" aria-live="polite"></div>
<section class="js-tools" aria-labelledby="tools-h"><h2 id="tools-h">Tools</h2>
<details class="ds-more" id="lisearch"><summary>What to search on LinkedIn</summary><div class="ds-more-body"><div id="lilist" class="mute">Loading the searches…</div></div></details>
<details class="ds-more" id="check"><summary>Check a job I found</summary><div class="ds-more-body"><label class="ds-sr" for="jin">Job link or posting text</label><textarea id="jin" rows="4" placeholder="Paste a job link, or the whole posting text"></textarea><div class="bar"><input id="jtitle" placeholder="Title (optional)" aria-label="Title (optional)"><input id="jco" placeholder="Employer (optional)" aria-label="Employer (optional)"><button class="p" id="jgo">How good a match am I?</button></div><div id="jres"></div></div></details>
<details class="ds-more" id="prefs"><summary>Search preferences: yes or no questions</summary><div class="ds-more-body"><div id="survey" class="mute">Loading…</div><div class="bar"><button id="psave">Save and re-run the search</button><span id="prefmsg" class="mute" role="status"></span></div></div></details>
<details class="ds-more" id="fillsetup"><summary>One-click apply: set up once</summary><div class="ds-more-body"><p>1. Drag this button to your bookmarks bar: <a id="bm" href="#" class="btn btn-primary">Fill application</a></p><p class="mute">2. On any match press <b>Apply</b>: your tailored resume downloads, the form kit is copied and the application opens. 3. On the application page click the <b>Fill application</b> bookmark: it fills your details, adds the cover note and attaches the resume. 4. Answer the questions only you can answer, check the page, press Submit. Works on Greenhouse, Lever, Ashby, Workable and Recruitee; other sites open with the resume and note ready to paste. Nothing is submitted for you: employer systems reject unattended submissions, and an unreviewed application costs more than it saves.</p></div></details>
<details class="ds-more"><summary>Filters and search runs</summary><div class="ds-more-body"><div class="bar"><label class="ds-field"><span>Tier</span><select id="tier"><option value="">All tiers</option><option value="A">A: strong fit</option><option value="B">B: good fit</option><option value="C">C: stretch</option></select></label><label class="ds-field"><span>Status</span><select id="status"><option value="">New jobs only</option><option value="mine">My applications</option><option value="all">Everything, including turned down</option><option value="pending_owner_approval">Pending</option><option>approved</option><option>rejected</option><option>applied</option><option>replied</option><option>interview</option><option>offer</option><option>no_reply</option><option>expired</option></select></label></div><div class="bar"><button id="run">Run the search now</button></div><p class="mute">Every sentence in a resume or note is copied from the claim ledger and re-checked line by line; a failed check blocks the draft. Nothing is sent for you.</p><div class="js-links"><a href="/prep">Apply and prepare</a><a href="/api/ledger">Claim ledger</a><a href="/api/ops">Operations</a><a href="/api">API</a></div></div></details>
</section></main>
<script>
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function api(path,opt){const r=await fetch(path,opt);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||r.status);return j}
async function load(){
  const q=new URLSearchParams();for(const k of['tier','status','q']){const v=$('#'+k).value;if(v)q.set(k,v)}
  const [m,r,oc]=await Promise.all([api('/api/matches?'+q),api('/api/runs'),api('/api/outcomes')]);
  const last=r.runs[0];$('#meta').textContent=(m.matches.length+' shown')+(last?(' · '+last.passed+' of '+last.fetched+' postings passed the checks · last search '+String(last.started_at).slice(0,16)+(last.errors.length?' · '+last.errors.length+' feed errors':'')):' · no search run yet')+' · applied '+oc.funnel.applied+', replies '+oc.funnel.replied+', interviews '+oc.funnel.interview;segSync();
  $('#list').innerHTML=m.matches.map(cardHtml).join('')||emptyHtml();
}
async function show(id){const el=document.getElementById('c-'+id).querySelector('.art');if(el.innerHTML){el.innerHTML='';return}
  const d=await api('/api/matches/'+encodeURIComponent(id));if(!d.verified){el.innerHTML='<pre>Blocked: '+esc(d.blocked_reason)+'</pre>';return}
  el.innerHTML='<h4>Resume</h4><pre>'+esc(d.resume_md)+'</pre><h4>Note</h4><pre>'+esc(d.note_md)+'</pre><button onclick="navigator.clipboard.writeText(this.dataset.t)" data-t="'+esc(d.note_md)+'">Copy note</button> <button onclick="navigator.clipboard.writeText(this.dataset.t)" data-t="'+esc(d.resume_md)+'">Copy resume</button>'}
async function referral(id){var el=document.getElementById('c-'+id).querySelector('.art');
  var d=await authed(function(){return api('/api/matches/'+encodeURIComponent(id)+'/referral')});
  el.innerHTML='<h4>Ask for a referral</h4><div class="note">'+d.left_for_you.map(esc).join('; ')+'.</div>'+d.search_urls.map(function(u){return '<a href="'+esc(u.url)+'" target="_blank" rel="noopener"><button>'+esc(u.label)+'</button></a>'}).join(' ')+(d.message?'<pre>'+esc(d.message)+'</pre><button onclick="navigator.clipboard.writeText(this.dataset.t)" data-t="'+esc(d.message)+'">Copy message</button>':'<pre>Blocked: '+esc(d.blocked)+'</pre>')}
async function stage(id,sel){if(!sel.value)return;var v=sel.value;await authed(function(){return api('/api/matches/'+encodeURIComponent(id)+'/stage',{method:'POST',body:JSON.stringify({stage:v})})});sel.blur();var o=sel.options[0];o.textContent='Stage: '+v;sel.selectedIndex=0}
function signIn(){return new Promise(async(res)=>{let r;try{r=await api('/api/auth/request',{method:'POST'})}catch(e){if(!/limit/.test(e.message)){alert(e.message);return res(false)}r={sent:false,note:e.message}}
  let box=$('#signbox');if(!box){box=document.createElement('div');box.id='signbox';box.className='note';$('main').prepend(box)}
  box.innerHTML='<b>Sign in</b><div>'+esc(r.sent===false?r.note+' A code sent earlier still works.':'A 6-digit code was e-mailed to '+r.to+'.')+'</div><div class="bar"><input id="scode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" size="10"><button class="p" id="sgo">Sign in</button><button id="scancel">Cancel</button><span id="smsg" class="mute"></span></div>';
  const done=v=>{box.remove();res(v)};$('#scancel').onclick=()=>done(false);
  const go=async()=>{try{await api('/api/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:$('#scode').value.trim()})});who();done(true)}catch(e){$('#smsg').textContent=e.message}};
  $('#sgo').onclick=go;$('#scode').onkeydown=e=>{if(e.key==='Enter')go()};$('#scode').focus()})}
async function who(){try{const m=await api('/api/auth/me');$('#who').textContent=m.signed_in?'Signed in':'Not signed in';$('#signin').style.display=m.signed_in?'none':'';$('#signout').style.display=m.signed_in?'':'none'}catch(e){$('#who').textContent='Sign-in status unavailable: '+e.message}}
async function decide(id,status){
  const call=()=>api('/api/matches/'+encodeURIComponent(id)+'/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status})});
  try{await call()}catch(e){if(/sign in/.test(e.message)){try{if(await signIn())await call();else return}catch(e2){alert(e2.message);return}}else{alert(e.message);return}}load()}
$('#run').onclick=async()=>{$('#run').disabled=true;try{await authed(()=>api('/api/run',{method:'POST'}));$('#meta').textContent='Run started. Refreshing in 40 s…';setTimeout(()=>{load();$('#run').disabled=false},40000)}catch(e){alert(e.message);$('#run').disabled=false}};
for(const k of['tier','status'])$('#'+k).onchange=load;$('#q').oninput=()=>{clearTimeout(window._t);window._t=setTimeout(load,300)};async function authed(fn){try{return await fn()}catch(e){if(/sign in/.test(e.message)){if(await signIn())return await fn()}throw e}}
async function loadPrefs(){const d=await api('/api/prefs');const g={};d.survey.forEach(q=>{(g[q.group]=g[q.group]||[]).push(q)});$('#survey').innerHTML=Object.keys(g).map(k=>'<h4>'+esc(k)+'</h4>'+g[k].map(q=>'<div class="q" data-pref="'+esc(q.id)+'"><span>'+esc(q.q)+'</span><div class="ds-choices" role="group" aria-label="'+esc(q.q)+'">'+[['true','Yes'],['false','No'],['null','Not sure']].map(o=>'<button type="button" data-v="'+o[0]+'" aria-pressed="'+(String(q.answer)===o[0]?'true':'false')+'">'+o[1]+'</button>').join('')+'</div></div>').join('')).join('')}
$('#survey').addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-v]');if(!b)return;b.parentNode.querySelectorAll('[data-v]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')})});
$('#psave').onclick=async()=>{const a={};document.querySelectorAll('#survey [data-pref]').forEach(q=>{var b=q.querySelector('[aria-pressed="true"]');if(b)a[q.dataset.pref]=b.dataset.v==='true'?true:b.dataset.v==='false'?false:null});$('#prefmsg').textContent='Saving...';try{await authed(()=>api('/api/prefs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({answers:a})}));$('#prefmsg').textContent='Saved. The search is re-running (about a minute); matches that no longer fit are hidden.';setTimeout(load,60000)}catch(e){$('#prefmsg').textContent=e.message}};
function reject(id){var el=document.getElementById('c-'+id).querySelector('.art');var R=[['coding','Too much coding'],['field','Wrong field'],['level','Wrong level'],['location','Wrong place'],['company','Not this employer'],['applied','Already handled it'],['other','Other']];el.innerHTML='<div class="note">Why? The search learns from it. '+R.map(function(r){return '<button onclick="rejectWhy(\\''+esc(id)+'\\',\\''+r[0]+'\\')">'+r[1]+'</button>'}).join(' ')+'</div>'}
async function rejectWhy(id,reason){const call=()=>api('/api/matches/'+encodeURIComponent(id)+'/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:'rejected',reason})});try{await authed(call)}catch(e){alert(e.message);return}load()}
const VIA={rok:'RemoteOK',him:'Himalayas',hn:'Hacker News: Who is hiring',rm:'Remotive',jb:'Jobicy',mu:'The Muse',an:'Arbeitnow',gh:'company board',lv:'company board',ab:'company board',rc:'company board',ps:'public-sector board'};
function via(id){return VIA[String(id).split(':')[0]]||''}
async function loadLi(){try{const d=await api('/api/linkedin');$('#lilist').innerHTML='<p class="mute">'+esc(d.how)+'</p>'+d.searches.map(function(x,i){return '<div class="lis"><div class="t">'+esc(x.label)+'</div><div class="mute">Why it fits: '+esc(x.why)+'</div><div class="acts big">'+x.links.map(function(l){return '<a class="btn" href="'+esc(l.linkedin)+'" target="_blank" rel="noopener">LinkedIn: '+esc(l.place)+'</a>'}).join('')+'</div><div class="acts">'+(x.links[0]?'<a href="'+esc(x.links[0].google)+'" target="_blank" rel="noopener">Same search on Google</a><a href="'+esc(x.links[0].indeed)+'" target="_blank" rel="noopener">On Indeed</a>':'')+'<button class="cpy" data-i="'+i+'">Copy search words</button></div></div>'}).join('');$('#lilist').querySelectorAll('.cpy').forEach(function(b){b.onclick=function(){var q=d.searches[+b.dataset.i].q;(navigator.clipboard?navigator.clipboard.writeText(q):Promise.reject()).then(function(){b.textContent='Copied'},function(){prompt('Copy this',q)})}})}catch(e){$('#lilist').textContent='Could not load the searches: '+e.message}}
loadLi();
function li(a){return a&&a.length?'<ul>'+a.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p class="mute">none</p>'}
$('#jgo').onclick=async()=>{const r=$('#jres');r.textContent='Reading the posting...';try{const d=await authed(()=>api('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:$('#jin').value,title:$('#jtitle').value,company:$('#jco').value})}));window._last=d;
 r.innerHTML='<div class="card"><div class="t">'+esc(d.verdict)+' ('+d.fit_score+')  '+esc(d.title)+'</div><div class="mute">'+esc(d.company)+' | '+esc(d.location)+'</div><div>'+(d.would_appear_in_your_search?'Would appear in your search.':'Would NOT appear in your search: '+esc(d.why_not_in_search.join('; ')))+'</div><h4>Why</h4>'+li(d.why)+'<h4>Your record that fits</h4>'+li(d.strengths.map(x=>x.text))+'<h4>Gaps and checks</h4>'+li(d.gaps.concat(d.flags))+'<div class="acts"><button class="fb" data-v="like">More like this</button><button class="fb" data-v="dislike">Not for me</button></div><span id="fbmsg" class="mute"></span>'+kwHtml(d.keywords)+(d.apply?'<div class="acts"><button class="p" id="japply">Apply: download resume and copy kit</button></div>':'')+(d.draft.resume?'<details><summary>Verified resume and note for this job</summary><pre>'+esc(d.draft.resume)+'</pre><pre>'+esc(d.draft.note)+'</pre></details>':'<p class="flag">Draft blocked: '+esc(d.draft.blocked)+'</p>')+'</div>';
 var ja=r.querySelector('#japply');if(ja)ja.onclick=function(){fireKit(d.apply)};
 r.querySelectorAll('.fb').forEach(b=>b.onclick=async()=>{try{await authed(()=>api('/api/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:d.title,company:d.company,verdict:b.dataset.v})}));$('#fbmsg').textContent='Noted. The next search run uses it.'}catch(e){$('#fbmsg').textContent=e.message}})}catch(e){r.textContent=e.message}};
${APPLY_JS}
var KITS={},KREADY={};
function warm(id){if(!KITS[id]){KITS[id]=api('/api/matches/'+encodeURIComponent(id)+'/kit').then(function(k){KREADY[id]=k;return k}).catch(function(e){delete KITS[id];throw e});KITS[id].catch(function(e){console.warn('kit: '+e.message)})}return KITS[id]}
function kitPanel(el,id,k){
 el.innerHTML='<div class="note"><b>Application kit for '+esc(k.company)+'</b> ('+esc(k.ats)+(k.fresh?', rebuilt from the posting as it reads now':', draft from match time')+'). Press <b>Open application and copy kit</b>: the resume downloads, the kit is copied and the application opens. There click your <b>Fill application</b> bookmark, check everything and submit.</div>'
  +kwHtml(k.keywords)+'<h4>Left for you</h4>'+li(k.left_for_you)
  +'<div class="acts"><button class="p" data-act="open">Open application and copy kit</button><button data-act="copy">Copy kit again</button><button data-act="dl">Download resume .docx</button><a href="/api/matches/'+encodeURIComponent(id)+'/resume.html" target="_blank" rel="noopener"><button>Resume as PDF (print)</button></a><button data-act="done">I submitted it</button></div>'}
$('#list').addEventListener('mouseover',function(e){var b=e.target.closest&&e.target.closest('.ap');if(b&&(b.dataset.q==='0'||b.closest('.card').dataset.recalled))warm(b.dataset.id)});
$('#list').addEventListener('click',async function(e){
 var b=e.target.closest&&e.target.closest('.ap,[data-act]');if(!b)return;
 var card=b.closest('.card'),id=card.id.slice(2),el=card.querySelector('.art'),k=KREADY[id];
 if(b.classList.contains('ap')){
  if(!card.dataset.recalled&&!(await recallGate(card,id,el)))return;
  k=KREADY[id];
  if(k){fireKit(k);kitPanel(el,id,k);return}
  el.innerHTML='<div class="mute">Building the kit from the posting and your CV...</div>';
  try{k=await authed(function(){return warm(id)});kitPanel(el,id,k)}catch(err){el.innerHTML='<div class="flag">'+esc(err.message)+'</div>'}
  return}
 var a=b.dataset.act;if(!k)return;
 if(a==='open')fireKit(k);else if(a==='copy')navigator.clipboard.writeText(kitPayload(k));else if(a==='dl')saveFile(k.resume_file,k.resume_docx_b64);else if(a==='done')decide(id,'applied')});
$('#bm').setAttribute('href',bookmarkHref());$('#bm').onclick=function(e){e.preventDefault();alert('Drag this button to your bookmarks bar. Do not click it here.')};
api('/api/followups').then(function(f){if(!f.count)return;window.FU=f.items;$('#follow').innerHTML='<div class="note"><b>'+f.count+' application(s) with no reply after 7 days.</b> '+f.items.map(function(x,i){return esc(x.title)+' at '+esc(x.company)+' ('+x.days_waiting+' days) <button data-fu="'+i+'">Copy follow-up</button>'}).join(' | ')+'</div>'}).catch(function(e){console.warn('followups: '+e.message)});
$('#follow').addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-fu]');if(b)navigator.clipboard.writeText(window.FU[+b.dataset.fu].note)});
$('#ready').onclick=function(){$('#tier').value='A';$('#status').value='';load()};
${RECALL_UI_JS}
load();who();loadPrefs();
</script></body></html>`;

// ------------------------------------------------------------------ CV page (JOBSEARCH-CV-1): interview, review, edit, resume per job, history. Plain JS, talks only to /api/cv* and /api/analyze.
// JOBSEARCH-PREP-UI-1: three tabs on one phone page (check fit, answers, interview prep) over the 1.9.0 routes.
// JOBS-DESIGN-2 (DESIGN-SYSTEM-2, #9926): /cv and /prep on the shared design system. The CSS maps the classes the two page scripts already
// emit (card, b, pri, link, row, fact, hint, gap, good, tag, bar, toast) onto the design tokens, so the scripts keep their element ids and logic.
const JOBS_FORM_CSS = ".ds-seg{margin:0 0 16px}@media (max-width:560px){.ds-seg.ds-seg-row{grid-auto-flow:column;grid-template-columns:none}.ds-seg.ds-seg-scroll{grid-auto-flow:column;grid-template-columns:none;grid-auto-columns:max-content;overflow-x:auto;scrollbar-width:none}.ds-seg.ds-seg-scroll button{padding:8px 14px}}.ds-seg button.on{background:var(--ds-surface);color:var(--ds-ink);box-shadow:var(--ds-shadow)}"
 + ".card{background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:16px;padding:16px;margin:0 0 12px;box-shadow:var(--ds-shadow)}@media (min-width:720px){.card{padding:24px}}"
 + ".card h2{margin:0 0 6px;font-size:20px}.card h3{margin:16px 0 6px;font-size:17px}.card>h2:first-child,.card>h3:first-child{margin-top:0}"
 + ".ds button.b{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:10px 16px;margin:4px 8px 4px 0;border-radius:12px;border:1px solid var(--ds-line-strong);background:var(--ds-surface);color:var(--ds-ink);font:600 15px/1.2 var(--ds-font);cursor:pointer}"
 + ".ds button.b:hover{background:var(--ds-surface-2)}.ds button.b.pri{background:var(--ds-accent);border-color:var(--ds-accent);color:var(--ds-on-accent)}.ds button.b.pri:hover{background:var(--ds-accent-hover)}"
 + ".ds button.b.yes{background:var(--ds-good-soft);border-color:var(--ds-good);color:var(--ds-good)}.ds button.b.bad,.ds button.link.bad{color:var(--ds-bad)}"
 + ".ds button.link{display:inline-flex;align-items:center;min-height:44px;background:none;border:0;color:var(--ds-accent);cursor:pointer;font:600 15px var(--ds-font);padding:10px 14px 10px 0}"
 + ".mut{color:var(--ds-ink-2)}.ok{color:var(--ds-good)}.warn{color:var(--ds-warn)}.bad{color:var(--ds-bad)}.hide{display:none!important}"
 + ".ds textarea{min-height:96px;resize:vertical}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}.row>div{flex:1;min-width:140px}"
 + ".row input,.fact input:not([type=checkbox]),.fact select,.card select{width:100%}"
 + ".ds label{display:block;font-weight:600;margin:12px 0 4px;font-size:14px;color:var(--ds-ink-2)}"
 + ".bar{height:6px;background:var(--ds-surface-2);border-radius:99px;overflow:hidden;margin-bottom:16px}.bar i{display:block;height:100%;background:var(--ds-accent);border-radius:99px}"
 + ".sec{color:var(--ds-ink-2);font-weight:600;font-size:14px;letter-spacing:.02em}.q{font-size:20px;font-weight:650;margin:8px 0 4px;line-height:1.35}"
 + ".hint{background:var(--ds-accent-soft);border-radius:12px;padding:12px 14px;font-size:15px;color:var(--ds-ink);margin:12px 0}"
 + ".fact{border:1px solid var(--ds-line);border-radius:12px;padding:12px 14px;margin:10px 0;background:var(--ds-surface)}"
 + ".tag{display:inline-block;background:var(--ds-surface-2);border-radius:99px;padding:2px 10px;font-size:13px;margin:4px 4px 0 0;color:var(--ds-ink-2)}"
 + ".gap{border-left:4px solid var(--ds-warn);background:var(--ds-warn-soft);padding:12px 14px;border-radius:0 12px 12px 0;margin:8px 0}"
 + ".good{border-left:4px solid var(--ds-good);background:var(--ds-good-soft);padding:12px 14px;border-radius:0 12px 12px 0;margin:8px 0}"
 + ".signbox{background:var(--ds-warn-soft);border:1px solid var(--ds-line);border-radius:12px;padding:16px;margin-bottom:16px}"
 + ".toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ds-ink);color:var(--ds-surface);padding:12px 20px;border-radius:12px;z-index:30;font-weight:600}"
 + ".resume{background:var(--ds-surface);color:var(--ds-ink);border:1px solid var(--ds-line);padding:24px;border-radius:12px;font-family:Georgia,serif;font-size:16px;line-height:1.5;overflow-x:auto}@media (min-width:720px){.resume{padding:36px 44px}}"
 + ".resume h1{font-size:25px;margin:0 0 2px}.resume h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--ds-line-strong);padding-bottom:3px;margin:18px 0 8px}"
 + ".resume ul{margin:4px 0 8px;padding-left:20px}.resume p{margin:3px 0}.note{white-space:pre-wrap;background:var(--ds-surface);border:1px solid var(--ds-line);border-radius:12px;padding:20px;font-family:Georgia,serif}"
 + ".big{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums}.card ul{margin:4px 0 8px 20px;padding:0}"
 + "@media print{.ds-top,.ds-seg,.ds-head,.noprint{display:none!important}body.ds{background:#fff;color:#000}.ds-main{margin:0;max-width:none;padding:0}.resume{border:0;padding:0;background:#fff;color:#000}}";
const PREP_UI = String.raw`<!doctype html><html lang="en"><head>${dsHead("Apply and prepare", "Check a job's fit, draft the application answers and prepare for the interview, from your own record.", JOBS_FORM_CSS)}</head><body class="ds">
<a class="ds-skip" href="#main">Skip to content</a>
<header class="ds-top"><div class="ds-top-in"><a class="ds-brand" href="/">Jobs</a><a class="btn btn-quiet" href="/">Matches</a><a class="btn btn-quiet" href="/cv">Your CV</a></div></header>
<main class="ds-main" id="main"><div class="ds-head"><h1>Apply and prepare</h1><p>Paste one job, then check the fit, draft your answers or practise the interview.</p></div>
<nav id="nav" class="ds-seg ds-seg-row" aria-label="What to do with this job"><button data-t="check" class="on">Check fit</button><button data-t="answers">Answers</button><button data-t="prep">Interview prep</button></nav>
<div id="signbox" class="hide"></div>
<div class="card"><h2>The job</h2><p class="mut">Paste the job link, or the posting text.</p><textarea id="job" placeholder="https://... or paste the posting"></textarea></div>
<section id="t-check"><div class="card"><button class="b pri" id="go-check">Check fit</button><div id="out-check" class="mut">Nothing checked yet.</div></div></section>
<section id="t-answers" class="hide"><div class="card"><h2>Application questions</h2><p class="mut">One question per line. Pay, work authorization and demographic questions are always left to you.</p><textarea id="qs" placeholder="Why do you want this role?"></textarea><button class="b pri" id="go-answers">Draft answers</button><div id="out-answers" class="mut"></div></div></section>
<section id="t-prep" class="hide"><div class="card"><button class="b pri" id="go-prep">Build interview brief</button><div id="out-prep" class="mut">No brief yet.</div></div>
<div class="card hide" id="quiz"><h2>Quiz me</h2><div id="qtext" class="big" style="font-size:18px"></div><textarea id="qans" placeholder="Answer out loud first, then type or dictate it here"></textarea><button class="b pri" id="go-fb">Get feedback</button><button class="b" id="go-next">Next question</button><div id="out-fb"></div></div></section>
</main>
<script>
var $=function(s){return document.querySelector(s)};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
async function api(p,b){var r=await fetch(p,b===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});var j=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(j.error||r.status);return j}
function signIn(){return new Promise(async function(res){var r;try{r=await api('/api/auth/request',{})}catch(e){if(!/limit/.test(e.message)){alert(e.message);return res(false)}r={sent:false,note:e.message}}
 var box=$('#signbox');box.className='card';
 box.innerHTML='<b>Sign in</b><div>'+esc(r.sent===false?r.note+' A code sent earlier still works.':'A 6-digit code was e-mailed to '+r.to+'.')+'</div><div style="margin-top:8px"><input id="scode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" aria-label="6-digit code"> <button class="b pri" id="sgo">Sign in</button><button class="b" id="scancel">Cancel</button></div><div id="smsg" class="mut"></div>';
 function done(v){box.className='hide';box.innerHTML='';res(v)}
 $('#scancel').onclick=function(){done(false)};
 async function go(){try{await api('/api/auth/verify',{code:$('#scode').value.trim()});done(true)}catch(e){$('#smsg').textContent=e.message}}
 $('#sgo').onclick=go;$('#scode').onkeydown=function(e){if(e.key==='Enter')go()};$('#scode').focus()})}
async function authed(fn){try{return await fn()}catch(e){if(/sign in/.test(e.message)){if(await signIn())return await fn()}throw e}}
function job(){var v=$('#job').value.trim();if(!v)throw new Error('Paste the job link or the posting text first.');return v}
function busy(el,t){el.className='mut';el.textContent=t}
function fail(el,e){el.className='bad';el.textContent=e.message}
function list(a){return a&&a.length?'<ul>'+a.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>':'<span class="mut"> none</span>'}
document.querySelectorAll('#nav button').forEach(function(b){b.onclick=function(){document.querySelectorAll('#nav button').forEach(function(x){x.className=x===b?'on':''});['check','answers','prep'].forEach(function(t){$('#t-'+t).className=t===b.dataset.t?'':'hide'})}});
var last=null;
$('#go-check').onclick=async function(){var o=$('#out-check');try{var v=job();busy(o,'Reading the posting and your record...');var d=await authed(function(){return api('/api/analyze',{input:v})});last=d;
 var j=d.judge,h='<h2>'+esc(d.title)+' <span class="mut">'+esc(d.company)+'</span></h2><div class="big">'+esc(d.verdict)+' <span class="mut" style="font-size:16px">rubric '+esc(d.fit_score)+(j?' | model '+esc(j.fit):'')+'</span></div><p class="mut">'+esc(d.second_opinion)+'</p>';
 if(j){h+='<h3>Why the model reads it this way</h3>'+list(j.reasons)+'<h3>Gaps</h3>'+list(j.gaps)}
 h+='<h3>Your strengths for this role</h3>'+list((d.strengths||[]).map(function(s){return s.text}));
 if(d.flags&&d.flags.length)h+='<h3>Check before applying</h3>'+list(d.flags);
 h+='<h3>Which is right?</h3><div class="ds-choices" role="group" aria-label="Your own read of the fit"><button data-v="qualified" aria-pressed="false">Qualified</button><button data-v="stretch" aria-pressed="false">A stretch</button><button data-v="not_qualified" aria-pressed="false">Not qualified</button></div><div id="cal" class="mut"></div>';
 if(d.apply&&d.apply.resume_pdf_b64)h+='<h3>Resume</h3><button class="b pri" id="dl-pdf">Download resume PDF</button>';
 o.className='';o.innerHTML=h;
 o.querySelectorAll('button[data-v]').forEach(function(b){b.onclick=async function(){o.querySelectorAll('button[data-v]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});try{await authed(function(){return api('/api/calibrate',{owner:b.dataset.v,title:d.title,company:d.company,rubric_fit:d.fit_score,judge_fit:j?j.fit:null})});$('#cal').textContent='Saved. Thank you: this is how the scoring learns.'}catch(e){$('#cal').textContent=e.message}}});
 var dl=$('#dl-pdf');if(dl)dl.onclick=function(){var bin=atob(d.apply.resume_pdf_b64),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([u],{type:'application/pdf'}));a.download=d.apply.resume_pdf_file||'resume.pdf';a.click()}
}catch(e){fail(o,e)}};
$('#go-answers').onclick=async function(){var o=$('#out-answers');try{var v=job(),qs=$('#qs').value.split('\n').map(function(x){return x.trim()}).filter(Boolean);if(!qs.length)throw new Error('Add at least one question.');busy(o,'Drafting from your record...');
 var d=await authed(function(){return api('/api/answers',{input:v,questions:qs})});o.className='';
 o.innerHTML=d.answers.map(function(a,i){var st=a.status==='draft'?'<span class="ok">Draft</span>':a.status==='owner_only'?'<span class="warn">Yours to answer</span>':a.status==='needs_review'?'<span class="warn">Needs your review</span>':'<span class="bad">Unavailable, try again</span>';
  return '<div class="card"><b>'+esc(a.question)+'</b><div>'+st+'</div>'+(a.answer?'<p id="a'+i+'">'+esc(a.answer)+'</p><button class="b" data-c="'+i+'">Copy answer</button>':'<p class="mut">'+esc(a.note||'')+'</p>')+(a.problems&&a.problems.length?'<div class="warn">'+list(a.problems)+'</div>':'')+'</div>'}).join('');
 o.querySelectorAll('button[data-c]').forEach(function(b){b.onclick=function(){navigator.clipboard.writeText($('#a'+b.dataset.c).textContent);b.textContent='Copied'}})
}catch(e){fail(o,e)}};
var brief=null,qi=0;
function showQ(){var q=brief.likely_questions[qi%brief.likely_questions.length];$('#qtext').textContent=q.q;$('#qans').value='';$('#out-fb').innerHTML='<p class="mut">'+esc(q.type)+': '+esc(q.angle)+'</p>'}
$('#go-prep').onclick=async function(){var o=$('#out-prep');try{var v=job();busy(o,'Building your brief...');brief=await authed(function(){return api('/api/prep',{input:v})});o.className='';
 o.innerHTML='<h2>'+esc(brief.title)+' <span class="mut">'+esc(brief.company)+'</span></h2><p>'+esc(brief.role_summary)+'</p><h3>What they need</h3>'+list(brief.what_they_need)+'<h3>What you offer</h3>'+list(brief.what_you_offer.map(function(x){return x.point}))+'<h3>Gaps and how to frame them</h3>'+list(brief.gaps.map(function(g){return g.gap+': '+g.honest_framing}))+'<h3>Your stories</h3>'+list(brief.stories.map(function(s){return s.theme+': '+s.outline}))+'<h3>What interviewers will likely rate</h3>'+list((brief.scorecard_attributes||[]).map(function(x){return x.attribute+(x.story_theme?' \u2192 your story: '+x.story_theme:' \u2192 no story yet')}))+'<h3>Questions to ask them</h3>'+list(brief.questions_to_ask);
 if(brief.likely_questions.length){qi=0;$('#quiz').className='card';showQ()}
}catch(e){fail(o,e)}};
$('#go-next').onclick=function(){if(brief){qi++;showQ()}};
$('#go-fb').onclick=async function(){var o=$('#out-fb');try{var a=$('#qans').value.trim();if(!a)throw new Error('Type or dictate your answer first.');busy(o,'Reading your answer...');var q=brief.likely_questions[qi%brief.likely_questions.length];
 var f=await authed(function(){return api('/api/prep/quiz',{question:q.q,answer:a,role:brief.title+' at '+brief.company})});o.className='';
 o.innerHTML='<div class="big">'+esc(f.score)+' / 5</div><h3>Worked</h3>'+list(f.strengths)+'<h3>Fix</h3>'+list(f.fixes)+(f.unsupported_claims.length?'<h3 class="warn">Not backed by your record</h3>'+list(f.unsupported_claims):'')+'<h3>Stronger version</h3><p>'+esc(f.stronger_outline)+'</p><h3>Likely follow-up</h3><p>'+esc(f.follow_up)+'</p>'
}catch(e){fail(o,e)}};
</script></body></html>`;
const CV_UI = String.raw`<!doctype html><html lang="en"><head>${dsHead("Your CV", "Your verified CV: answer short questions, review claims, edit your record and build a resume for one job.", JOBS_FORM_CSS)}</head><body class="ds">
<a class="ds-skip" href="#main">Skip to content</a>
<header class="ds-top noprint"><div class="ds-top-in"><a class="ds-brand" href="/">Jobs</a><a class="btn btn-quiet" href="/">Matches</a><a class="btn btn-quiet" href="/prep">Apply and prepare</a></div></header>
<main class="ds-main" id="main"><div class="ds-head"><h1>Your CV</h1><p>Every resume is built only from what you confirm here.</p></div>
<nav id="nav" class="ds-seg ds-seg-scroll" aria-label="CV sections"><button data-t="story" class="on">Questions</button><button data-t="review">Review</button><button data-t="cv">Edit CV</button><button data-t="resume">Resume for a job</button><button data-t="hist">History</button></nav>
<div id="signbox" class="hide"></div><section id="story"></section><section id="review" class="hide"></section><section id="cv" class="hide"></section><section id="resume" class="hide"></section><section id="hist" class="hide"></section></main>
<div id="toast" class="toast hide"></div>
<script>
var S=null,qi=0,draft=[{}],last=null,cur='story';
function $(s){return document.querySelector(s)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function toast(m){var t=$('#toast');t.textContent=m;t.classList.remove('hide');setTimeout(function(){t.classList.add('hide')},1800)}
async function api(p,b){var r=await fetch(p,b===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});var j=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(j.error||r.status);return j}
function signIn(){return new Promise(async function(res){var r;try{r=await api('/api/auth/request',{})}catch(e){if(!/limit/.test(e.message)){alert(e.message);return res(false)}r={sent:false,note:e.message}}
 var box=$('#signbox');box.classList.remove('hide');box.className='signbox';
 box.innerHTML='<b>Sign in</b><div>'+esc(r.sent===false?r.note+' A code sent earlier still works.':'A 6-digit code was e-mailed to '+r.to+'.')+'</div><div class="row" style="margin-top:8px"><div><input id="scode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code"></div><button class="b pri" id="sgo">Sign in</button><button class="b" id="scancel">Cancel</button></div><div id="smsg" class="mut"></div>';
 function done(v){box.className='hide';box.innerHTML='';res(v)}
 $('#scancel').onclick=function(){done(false)};
 async function go(){try{await api('/api/auth/verify',{code:$('#scode').value.trim()});done(true)}catch(e){$('#smsg').textContent=e.message}}
 $('#sgo').onclick=go;$('#scode').onkeydown=function(e){if(e.key==='Enter')go()};$('#scode').focus()})}
async function authed(fn){try{return await fn()}catch(e){if(/sign in/.test(e.message)){if(await signIn())return await fn()}throw e}}
async function load(){S=await authed(function(){return api('/api/cv')})}
function go(t){cur=t;document.querySelectorAll('#nav button').forEach(function(b){b.classList.toggle('on',b.dataset.t==t)});['story','review','cv','resume','hist'].forEach(function(s){$('#'+s).classList.toggle('hide',s!=t)});
 ({story:rStory,review:rReview,cv:rCv,resume:rResume,hist:rHist})[t]();window.scrollTo(0,0)}
document.querySelectorAll('#nav button').forEach(function(b){b.onclick=function(){go(b.dataset.t)}});
function roleOpts(sel){return '<option value="">(no specific role)</option>'+S.roles.map(function(r){return '<option value="'+esc(r.id)+'"'+(r.id==sel?' selected':'')+'>'+esc(r.title+', '+r.org+' ('+r.start+' to '+r.end+')')+'</option>'}).join('')}
/* ---------- interview ---------- */
function rStory(){
 var qs=S.questions,done=qs.filter(function(q){return q.answer}).length;
 if(qi>=qs.length){$('#story').innerHTML='<div class="card"><h2>All '+qs.length+' questions answered</h2><p class="mut">Your CV holds '+S.facts.length+' achievements. Next: paste a job posting and get a tailored resume.</p><div class="row"><button class="b pri" onclick="go(\'resume\')">Resume for a job</button><button class="b" onclick="qi=0;rStory()">Review my answers</button></div></div>';return}
 var q=qs[qi];
 if(q.answer=='y'&&q.facts.length&&draft._q!==q.id){draft=q.facts.map(function(f){return {text:f.text,role:f.role}});draft._q=q.id}
 $('#story').innerHTML='<div class="card"><div class="bar"><i style="width:'+(done/qs.length*100)+'%"></i></div><div class="sec">'+esc(q.section)+' · '+(qi+1)+' of '+qs.length+'</div><div class="q">'+esc(q.ask)+'</div>'
  +'<div class="ds-choices" role="group" aria-label="Your answer"><button aria-pressed="'+(q.answer=='y')+'" onclick="pick(\'y\')">Yes</button><button aria-pressed="'+(q.answer=='n')+'" onclick="pick(\'n\')">No</button><button aria-pressed="false" onclick="step(1)">Not sure</button></div>'
  +(q.answer?'<p class="mut">Your earlier answer: <b>'+(q.answer=='y'?'Yes':'No')+'</b></p>':'')
  +'<div id="detail" class="'+(q.answer=='y'||draft._open?'':'hide')+'"></div>'
  +'<p style="margin-top:20px"><button class="link" onclick="step(-1)">← Back</button><button class="link" onclick="step(1)">Next →</button></p></div>';
 if(!$('#detail').classList.contains('hide'))rDetail()}
function rDetail(){
 $('#detail').innerHTML='<div class="hint"><b>One line, the way it would read on a resume:</b> start with a verb, say what and how big, add a result or a number.<br>Example: <i>Led a 6-person team that built a travel-demand model used by 12 state agencies.</i></div>'
  +draft.map(function(d,i){return '<div class="fact"><label>What you did</label><textarea oninput="draft['+i+'].text=this.value">'+esc(d.text)+'</textarea><label>In which role?</label><select onchange="draft['+i+'].role=this.value">'+roleOpts(d.role)+'</select></div>'}).join('')
  +'<div class="row"><button class="b" onclick="draft.push({});rDetail()">+ Add another</button><button class="b pri" onclick="saveQ(\'y\')">Save and continue</button></div>'}
function pick(a){if(a=='y'){draft._open=true;if(!draft.length)draft=[{}];$('#detail').classList.remove('hide');rDetail();return}saveQ(a)}
async function saveQ(a){var q=S.questions[qi];await authed(function(){return api('/api/cv/answer',{qid:q.id,answer:a,facts:a=='y'?draft.filter(function(d){return (d.text||'').trim()}):[]})});await load();toast(a=='y'?'Saved':'Noted');step(1)}
function step(n){qi=Math.max(0,qi+n);draft=[{}];rStory()}
/* ---------- review ---------- */
function rReview(){
 var items=S.review;
 $('#review').innerHTML='<div class="card"><h2>Review ('+items.length+')</h2><p class="mut">Claims found in older drafts that your verified CV does not contain. None of them will ever appear on a resume unless you confirm they are true.</p></div>'
  +(items.map(function(it){return '<div class="card" id="rv_'+esc(it.id)+'"><div class="hint">'+esc(it.why)+'</div><label>As it would appear on your resume</label><textarea id="rt_'+esc(it.id)+'">'+esc(it.text)+'</textarea><label>Role</label><select id="rr_'+esc(it.id)+'">'+roleOpts(it.role)+'</select><p class="row"><button class="b yes" onclick="rv(\''+esc(it.id)+'\',\'confirm\')">This is true, add it</button><button class="b bad" onclick="rv(\''+esc(it.id)+'\',\'reject\')">Not true, remove it</button></p></div>'}).join('')||'<div class="good">Nothing waiting for review.</div>')}
async function rv(id,action){try{await authed(function(){return api('/api/cv/review',{id:id,action:action,text:$('#rt_'+id).value,role:$('#rr_'+id).value})});await load();toast(action=='confirm'?'Added':'Removed');rReview()}catch(e){alert(e.message)}}
/* ---------- your cv ---------- */
function rCv(){
 var p=S.person;
 $('#cv').innerHTML='<div class="card"><h2>Your CV</h2><p class="mut">Last confirmed '+esc(S.verified_on||'never')+'. Everything a resume can say about you is here; changes apply to every future resume and re-run the job search.</p>'
  +'<h3>Summary</h3><textarea id="c_sum" style="min-height:120px">'+esc(S.summary)+'</textarea><p><button class="b" onclick="saveSet({summary:$(\'#c_sum\').value})">Save summary</button></p></div>'
  +'<div class="card"><h3>Contact</h3><div class="row"><div><label>Location</label><input id="p_loc" value="'+esc(p.location)+'"></div><div><label>Email on resumes</label><input id="p_mail" value="'+esc(p.email)+'"></div></div><div class="row"><div><label>LinkedIn</label><input id="p_li" value="'+esc(p.links.linkedin)+'"></div><div><label>Website</label><input id="p_site" value="'+esc(p.links.site)+'"></div></div><p><button class="b" onclick="saveSet({person:{location:$(\'#p_loc\').value,email:$(\'#p_mail\').value,links:{linkedin:$(\'#p_li\').value,site:$(\'#p_site\').value}}})">Save contact</button></p></div>'
  +'<div class="card"><h3>Roles</h3><div id="roles"></div><p><button class="b" onclick="addRole()">+ Add a role</button> <button class="b" onclick="saveRoles()">Save roles</button></p></div>'
  +'<div class="card"><h3>Achievements ('+S.facts.length+')</h3><p><button class="b" onclick="newFact()">+ Add an achievement</button></p><div id="fedit"></div><div id="facts"></div></div>'
  +'<div class="card"><h3>Publications</h3><div id="pubs"></div><p><button class="b" onclick="addPub()">+ Add a publication</button> <button class="b" onclick="savePubs()">Save publications</button></p></div>'
  +'<div class="card"><h3>Education (one per line)</h3><textarea id="c_edu">'+esc(S.education.join(String.fromCharCode(10)))+'</textarea><h3>Certifications (one per line)</h3><textarea id="c_cert">'+esc(S.certifications.join(String.fromCharCode(10)))+'</textarea><h3>Skills (comma separated)</h3><textarea id="c_sk">'+esc(S.skills.map(function(s){return s.name}).join(', '))+'</textarea><p><button class="b" onclick="saveLists()">Save these lists</button></p></div>'
  +'<div class="card"><h3>Backup</h3><p class="mut">Download your whole CV as a file, or restore one.</p><p><a href="/api/cv/export" download="cv-backup.json"><button class="b">Download backup</button></a> <input type="file" id="imp" accept="application/json" style="width:auto"></p></div>';
 drawRoles();drawFacts();drawPubs();$('#imp').onchange=importFile}
async function saveSet(d){try{await authed(function(){return api('/api/cv/set',d)});await load();toast('Saved');rCv()}catch(e){alert(e.message)}}
function drawRoles(){$('#roles').innerHTML=S.roles.map(function(r,i){return '<div class="fact" data-i="'+i+'"><div class="row"><div style="flex:2"><label>Title</label><input class="rt" value="'+esc(r.title)+'"></div><div style="flex:2"><label>Employer</label><input class="ro" value="'+esc(r.org)+'"></div></div><div class="row"><div><label>Place</label><input class="rl" value="'+esc(r.location)+'"></div><div><label>Start year</label><input class="rs" value="'+esc(r.start)+'"></div><div><label>End year or present</label><input class="re" value="'+esc(r.end)+'"></div><button class="link bad" onclick="delRole('+i+')">Remove</button></div></div>'}).join('')}
function readRoles(){return Array.prototype.map.call(document.querySelectorAll('#roles .fact'),function(el,i){return {id:(S.roles[i]||{}).id,title:el.querySelector('.rt').value,org:el.querySelector('.ro').value,location:el.querySelector('.rl').value,start:el.querySelector('.rs').value,end:el.querySelector('.re').value,tags:(S.roles[i]||{}).tags||[]}})}
function addRole(){S.roles=readRoles();S.roles.push({title:'',org:'',location:'',start:'',end:'',tags:[]});drawRoles()}
function delRole(i){S.roles=readRoles();S.roles.splice(i,1);drawRoles()}
function saveRoles(){saveSet({roles:readRoles()})}
function drawFacts(){var role={};S.roles.forEach(function(r){role[r.id]=r.title+', '+r.org});$('#facts').innerHTML=S.facts.map(function(f){return '<div class="fact"><div>'+esc(f.text)+'</div><div class="mut" style="font-size:13px">'+esc(role[f.role]||'No specific role')+'</div><div>'+(f.tags||[]).map(function(t){return '<span class="tag">'+esc(t.replace(/_/g,' '))+'</span>'}).join('')+'</div><button class="link" onclick="editFact(\''+esc(f.id)+'\')">Edit</button><button class="link bad" onclick="delFact(\''+esc(f.id)+'\')">Remove</button></div>'}).join('')}
function newFact(){editFact(null)}
function editFact(id){var f=S.facts.filter(function(x){return x.id==id})[0]||{text:'',role:'',tags:[]};
 $('#fedit').innerHTML='<div class="fact"><label>What you did</label><textarea id="e_t">'+esc(f.text)+'</textarea><label>Role</label><select id="e_r">'+roleOpts(f.role)+'</select><label>Topics (so the right jobs find this)</label><div>'+S.tags.map(function(t){return '<label style="display:inline-block;font-weight:400;margin:2px 12px 2px 0"><input type="checkbox" style="width:auto" value="'+t+'"'+((f.tags||[]).indexOf(t)>=0?' checked':'')+'> '+t.replace(/_/g,' ')+'</label>'}).join('')+'</div><p><button class="b pri" onclick="saveFact(\''+(id||'')+'\')">Save</button></p></div>';$('#e_t').focus()}
async function saveFact(id){var tags=Array.prototype.map.call(document.querySelectorAll('#fedit input:checked'),function(c){return c.value});try{await authed(function(){return api('/api/cv/fact',{id:id||undefined,text:$('#e_t').value,role:$('#e_r').value,tags:tags})});await load();toast('Saved');rCv()}catch(e){alert(e.message)}}
async function delFact(id){if(!confirm('Remove this achievement?'))return;await authed(function(){return api('/api/cv/fact',{id:id,delete:true})});await load();rCv()}
function drawPubs(){$('#pubs').innerHTML=S.publications.map(function(p){return '<div class="fact pubrow"><label>Title</label><input class="pt" value="'+esc(p.title)+'"><div class="row"><div><label>Year</label><input class="py" value="'+esc(p.year)+'"></div><div style="flex:2"><label>DOI (optional)</label><input class="pd" value="'+esc(p.doi)+'"></div></div></div>'}).join('')}
function readPubs(){return Array.prototype.map.call(document.querySelectorAll('#pubs .pubrow'),function(el,i){return {id:(S.publications[i]||{}).id,title:el.querySelector('.pt').value,year:el.querySelector('.py').value,doi:el.querySelector('.pd').value,tags:(S.publications[i]||{}).tags||[]}})}
function addPub(){S.publications=readPubs();S.publications.push({title:'',year:'',doi:'',tags:[]});drawPubs()}
function savePubs(){saveSet({publications:readPubs()})}
function saveLists(){var nl=String.fromCharCode(10),known={};S.skills.forEach(function(s){known[s.name]=s.tags});
 saveSet({education:$('#c_edu').value.split(nl),certifications:$('#c_cert').value.split(nl),skills:$('#c_sk').value.split(',').map(function(n){n=n.trim();return {name:n,tags:known[n]||[]}})})}
async function importFile(e){var f=e.target.files[0];if(!f)return;if(!confirm('Replace your whole CV with this file?'))return;try{var d=JSON.parse(await f.text());await authed(function(){return api('/api/cv/import',d)});await load();toast('Restored');rCv()}catch(x){alert(x.message)}}
/* ---------- resume for a job ---------- */
function rResume(){
 $('#resume').innerHTML='<div class="card noprint"><h2>Resume for a job</h2><p class="mut">Paste the job link or the whole posting. The resume and cover note are built only from your CV and checked line by line.</p><textarea id="job" style="min-height:150px" placeholder="Paste the job posting or its link"></textarea><div class="row"><div><label>Job title (optional)</label><input id="jt"></div><div><label>Employer (optional)</label><input id="jc"></div></div><p><button class="b pri" onclick="make()">Build my resume</button></p></div><div id="out"></div>';if(last)show(last)}
async function make(){var job=$('#job').value.trim();if(!job)return toast('Paste a posting first');$('#out').innerHTML='<p class="mut">Reading the posting…</p>';
 try{last=await authed(function(){return api('/api/analyze',{input:job,title:$('#jt').value,company:$('#jc').value})});show(last)}catch(e){$('#out').innerHTML='<div class="gap">'+esc(e.message)+'</div>'}}
function inl(s){return esc(s).replace(/[*][*](.+?)[*][*]/g,'<b>$1</b>').replace(/(https:[/][/][^ ,<)]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>')}
function md(t){var out=[],inl_=false;t.split(String.fromCharCode(10)).forEach(function(l){var li=l.indexOf('- ')==0;if(inl_&&!li){out.push('</ul>');inl_=false}
 if(l.indexOf('# ')==0)out.push('<h1>'+esc(l.slice(2))+'</h1>');else if(l.indexOf('## ')==0)out.push('<h2>'+esc(l.slice(3))+'</h2>');else if(li){if(!inl_){out.push('<ul>');inl_=true}out.push('<li>'+inl(l.slice(2))+'</li>')}else if(l.trim())out.push('<p>'+inl(l)+'</p>')});if(inl_)out.push('</ul>');return out.join('')}
function show(r){
 var gaps=(r.cv_gaps||[]).map(function(g){return '<div class="gap"><b>The posting asks for '+esc(g.cluster.replace(/_/g,' '))+' and your CV does not mention it.</b> Have you done any of this?'+g.questions.map(function(q){return '<div style="margin-top:6px">'+esc(q.ask)+' <button class="link" onclick="jump(\''+esc(q.id)+'\')"><b>Answer →</b></button></div>'}).join('')+'</div>'}).join('');
 var d=r.draft||{};
 $('#out').innerHTML='<div class="card noprint"><h2>'+esc(r.verdict)+' ('+r.fit_score+')</h2><div class="mut">'+esc(r.title)+' · '+esc(r.company)+' · '+esc(r.location)+'</div><p>'+(r.would_appear_in_your_search?'This kind of role is in your job search.':'This role would not show up in your search: '+esc((r.why_not_in_search||[]).join('; ')))+'</p>'
  +(d.resume?'<div class="row"><button class="b'+(r.apply?'':' pri')+'" onclick="window.print()">Print or save as PDF</button><button class="b" onclick="cp(last.draft.resume)">Copy resume</button><button class="b" onclick="cp(last.draft.note)">Copy cover note</button>'+(r.apply?'<button class="b" onclick="saveFile(last.apply.resume_file,last.apply.resume_docx_b64)">Download Word (.docx)</button><button class="b pri" onclick="fireKit(last.apply)">Apply</button>':'')+'</div>'+kwHtml(r.keywords):'<div class="gap">Draft blocked: '+esc(d.blocked)+'</div>')+'</div>'
  +(d.resume?'<div class="resume">'+md(d.resume)+'</div><h3 class="noprint">Cover note</h3><div class="note noprint">'+esc(d.note)+'</div>':'')
  +'<div class="noprint"><h3>'+((r.cv_gaps||[]).length?'Gaps to close':'No gaps found')+'</h3>'+(gaps||'<div class="good">Everything this posting asks for is covered by your CV.</div>')+'</div>'}
function cp(t){navigator.clipboard.writeText(t);toast('Copied')}
window.CVPAGE=1;
${APPLY_JS}
function jump(id){qi=S.questions.findIndex(function(q){return q.id==id});draft=[{}];go('story')}
/* ---------- history ---------- */
async function rHist(){var h=await authed(function(){return api('/api/cv/history')});
 $('#hist').innerHTML='<div class="card"><h2>Resumes you built</h2><p class="mut">The last 200, newest first.</p></div>'+(h.items.map(function(x){return '<div class="card"><b>'+esc(x.title)+'</b> · '+esc(x.company)+' <span class="mut">'+esc(x.ts.slice(0,10))+' · '+esc(x.verdict)+' ('+x.fit+')</span> <button class="link" onclick="openHist('+x.id+')">Open</button></div>'}).join('')||'<div class="good">Nothing yet.</div>')}
async function openHist(id){var x=await authed(function(){return api('/api/cv/history/'+id)});last={title:x.title,company:x.company,location:'',verdict:x.verdict,fit_score:x.fit,would_appear_in_your_search:true,cv_gaps:[],draft:{resume:x.resume_md,note:x.note_md}};go('resume')}
load().then(function(){qi=Math.max(0,S.questions.findIndex(function(q){return !q.answer}));if(qi<0)qi=0;if(location.hash.indexOf('#q=')==0){var i=S.questions.findIndex(function(q){return q.id==location.hash.slice(3)});if(i>=0)qi=i}
 var rv=document.querySelector('#nav button[data-t=review]');rv.textContent='Review ('+S.review.length+')';rStory()}).catch(function(e){$('#story').innerHTML='<div class="card"><b>Could not load your CV.</b> '+esc(e.message)+'</div>'});
</script></body></html>`;

// ---- VOICE-INPUT-1:BEGIN (sourced from _shared/voice.js; applied by scripts/voice-apply.mjs; do not edit inside a worker) ----
// VOICE-INPUT-1 (2026-11-09, pillar reach; owner directive: "everywhere there's a text box or a prompt I want the microphone to work,
// like a Google search bar, on Android, desktop, whatever"). One block, inlined into every worker that serves HTML, that
//   1. serves /__voice.js, a tiny script that puts a mic button on every free-text field (textarea, text/search input), including fields
//      added later, and fills the field with what is said (Web Speech API; on a browser without it, a recording sent to /__voice/transcribe);
//   2. serves POST /__voice/transcribe (same-origin only, 4 MB, 12 a minute per address and isolate), forwarded to the dashboard's speech route;
//   3. injects the script tag into each 200 HTML page and sets Permissions-Policy microphone=(self) when the origin sent none or sent a
//      policy that blocks the microphone (the *.qnfo.org zone rule had forced microphone=() until MIC-ZONE-1 changed it to (self)).
// Opt a field out with data-novoice. Honeypots, passwords, numbers, e-mails and codes are skipped by the script itself.
var VX_VERSION = "1.0.0";
var VX_RATE = {};
var VX_STT_URL = "https://fleet.qnfo.org/__voice/stt";
function vxNop(e) { return e; }
var VX_CLIENT = "(function(){if(window.__vx)return;window.__vx=1;" +
"var SR=window.SpeechRecognition||window.webkitSpeechRecognition,MR=!!(window.MediaRecorder&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);" +
"if(!SR&&!MR)return;" +
"function nop(e){return e}" +
"var css=document.createElement('style');css.textContent='.vx-b{position:fixed;z-index:2147483000;width:36px;height:36px;border-radius:50%;border:1px solid rgba(128,128,128,.45);background:rgba(255,255,255,.92);color:#444;cursor:pointer;padding:0;display:none;align-items:center;justify-content:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent;box-shadow:0 1px 4px rgba(0,0,0,.25)}.vx-b svg{width:18px;height:18px;fill:currentColor;pointer-events:none}.vx-b.on{display:flex}.vx-b.rec{background:#d93025;color:#fff;border-color:#d93025;animation:vxp 1.1s infinite}.vx-b.err{background:#fce8e6;color:#b3261e}@keyframes vxp{50%{box-shadow:0 0 0 7px rgba(217,48,37,.18)}}@media(prefers-color-scheme:dark){.vx-b{background:rgba(40,40,40,.92);color:#ddd}}.vx-t{position:fixed;z-index:2147483001;left:12px;right:12px;bottom:16px;max-width:420px;margin:0 auto;background:#202124;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.4)}';document.head.appendChild(css);" +
"var ICON='<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z\"/></svg>';" +
"var map=new Map(),active=null,toastEl=null,toastT=0,raf=0;" +
"function toast(m){if(!toastEl){toastEl=document.createElement('div');toastEl.className='vx-t';toastEl.setAttribute('role','status');document.body.appendChild(toastEl)}toastEl.textContent=m;toastEl.style.display='block';clearTimeout(toastT);toastT=setTimeout(function(){toastEl.style.display='none'},5000)}" +
"function eligible(el){if(!el||el.nodeType!==1||el.dataset.novoice!==undefined||el.disabled||el.readOnly)return false;var t=el.tagName;if(t==='TEXTAREA')return true;if(t!=='INPUT')return false;var ty=(el.getAttribute('type')||'text').toLowerCase();if(ty!=='text'&&ty!=='search')return false;if(el.tabIndex<0||el.getAttribute('aria-hidden')==='true')return false;var im=(el.getAttribute('inputmode')||'').toLowerCase();if(/^(numeric|decimal|tel|email|url)$/.test(im))return false;var ac=(el.getAttribute('autocomplete')||'').toLowerCase();if(/one-time-code|email|username|tel|cc-/.test(ac))return false;if(/^(website|url|hp|qz_hp|honeypot|code|otp)$/i.test(el.name||''))return false;return true}" +
"function hasOwnMic(el){var p=el.parentElement,n=0;while(p&&n<3){var bs=p.querySelectorAll('button,[role=button]');for(var i=0;i<bs.length;i++){var b=bs[i];if(b.classList.contains('vx-b'))continue;var s=(b.id+' '+b.className+' '+(b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).toLowerCase();if(/\\b(mic|speak|dictat|voice)/.test(s)&&b.offsetParent!==null)return true}p=p.parentElement;n++}return false}" +
"function setVal(el,v){var proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,d=Object.getOwnPropertyDescriptor(proto,'value');if(d&&d.set)d.set.call(el,v);else el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}))}" +
"function sep(base){return base&&!/\\s$/.test(base)?' ':''}" +
"function stop(){if(!active)return;var a=active;active=null;a.stopped=true;try{a.rec&&a.rec.stop()}catch(e){nop(e)}try{a.mr&&a.mr.state!=='inactive'&&a.mr.stop()}catch(e){nop(e)}if(a.stream)a.stream.getTracks().forEach(function(t){t.stop()});a.btn.classList.remove('rec');a.btn.setAttribute('aria-label','Speak into this box')}" +
"function fail(btn,m){btn.classList.add('err');setTimeout(function(){btn.classList.remove('err')},2500);toast(m)}" +
"function errMsg(e){return e==='not-allowed'||e==='service-not-allowed'?'The microphone is blocked. Allow it for this site in the browser settings (lock icon in the address bar), then tap the mic again.':e==='no-speech'?'Heard nothing. Tap the mic and speak.':e==='audio-capture'?'No microphone found on this device.':e==='network'?'Speech recognition needs a connection. Try again.':'Voice input stopped ('+e+').'}" +
"function startSR(el,btn){var a={btn:btn,base:el.value,fin:'',lastErr:'',empty:0};active=a;btn.classList.add('rec');btn.setAttribute('aria-label','Stop and keep what you said');" +
"function run(){var r=new SR();a.rec=r;r.lang=document.documentElement.lang||navigator.language||'en-US';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;" +
"r.onresult=function(e){var interim='',got=false;for(var i=e.resultIndex;i<e.results.length;i++){var t=e.results[i][0].transcript;if(e.results[i].isFinal){a.fin+=(a.fin&&!/\\s$/.test(a.fin)?' ':'')+t.trim();got=true}else interim+=t}if(got)a.empty=0;var spoken=(a.fin+(interim?(a.fin?' ':'')+interim:'')).trim();setVal(el,a.base+sep(a.base)+spoken)};" +
"r.onerror=function(e){a.lastErr=e.error};" +
"r.onend=function(){if(active!==a)return;if(a.lastErr&&a.lastErr!=='no-speech'&&a.lastErr!=='aborted'){var m=errMsg(a.lastErr);stop();fail(btn,m);return}if(a.lastErr==='no-speech'||!a.fin)a.empty++;a.lastErr='';if(a.empty>=2){stop();return}a.base=el.value;a.fin='';try{run()}catch(x){stop()}};" +
"r.start()}" +
"try{run()}catch(e){stop();fail(btn,'Voice input could not start.')}}" +
"function startMR(el,btn){navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){var a={btn:btn,stream:s};active=a;var ch=[],mr=new MediaRecorder(s);a.mr=mr;btn.classList.add('rec');btn.setAttribute('aria-label','Stop and transcribe');mr.ondataavailable=function(e){if(e.data&&e.data.size)ch.push(e.data)};mr.onstop=function(){s.getTracks().forEach(function(t){t.stop()});var blob=new Blob(ch,{type:mr.mimeType||'audio/webm'});btn.classList.remove('rec');if(!blob.size)return;btn.disabled=true;toast('Transcribing...');fetch('/__voice/transcribe',{method:'POST',headers:{'x-voice':'1','Content-Type':blob.type},body:blob,credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){btn.disabled=false;if(j&&j.ok&&j.text){var v=el.value;setVal(el,v+sep(v)+j.text);el.focus();toastEl&&(toastEl.style.display='none')}else fail(btn,(j&&j.error)||'Could not transcribe that.')}).catch(function(){btn.disabled=false;fail(btn,'Could not reach the speech service.')})};mr.start()}).catch(function(e){fail(btn,e&&e.name==='NotAllowedError'?errMsg('not-allowed'):errMsg('audio-capture'))})}" +
"function toggle(el,btn){if(active){var same=active.btn===btn;stop();if(same)return}try{el.focus()}catch(e){nop(e)}if(SR)startSR(el,btn);else startMR(el,btn)}" +
"function attach(el){if(map.has(el)||!eligible(el)||hasOwnMic(el))return;var b=document.createElement('button');b.type='button';b.className='vx-b';b.innerHTML=ICON;b.setAttribute('aria-label','Speak into this box');b.title='Speak instead of typing';b.addEventListener('mousedown',function(e){e.preventDefault()});b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();toggle(el,b)});document.body.appendChild(b);map.set(el,b);place()}" +
"function place(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;var vw=innerWidth,vh=innerHeight;map.forEach(function(b,el){if(!el.isConnected){b.remove();map.delete(el);return}var r=el.getBoundingClientRect(),cs=getComputedStyle(el),ok=r.width>=80&&r.height>=20&&cs.visibility!=='hidden'&&cs.display!=='none'&&r.bottom>0&&r.top<vh&&r.right>0&&r.left<vw;if(!ok){b.classList.remove('on');return}var sz=r.height<44?28:36;b.style.width=b.style.height=sz+'px';var top=r.height<60?r.top+(r.height-sz)/2:r.bottom-sz-6,left=Math.min(r.right-sz-6,vw-sz-4);b.style.top=Math.max(2,top)+'px';b.style.left=Math.max(2,left)+'px';b.classList.add('on')})})}" +
"function scan(root){var q=(root&&root.querySelectorAll?root:document).querySelectorAll('textarea,input');for(var i=0;i<q.length;i++)attach(q[i]);if(root&&root.tagName&&(root.tagName==='TEXTAREA'||root.tagName==='INPUT'))attach(root)}" +
"scan(document);new MutationObserver(function(ms){var any=false;ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){scan(n);any=true}})});place()}).observe(document.documentElement,{childList:true,subtree:true});" +
"['scroll','resize','input','focusin','transitionend','animationend'].forEach(function(ev){addEventListener(ev,place,true)});setInterval(place,1500);" +
"document.addEventListener('keydown',function(e){if(e.key==='Escape'&&active)stop()});" +
"})();";
function vxHeaders(h) {
  try {
    var pp = h.get("Permissions-Policy");
    if (!pp) {
      h.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
    } else if (/microphone\s*=\s*\(\s*\)/i.test(pp)) {
      h.set("Permissions-Policy", pp.replace(/microphone\s*=\s*\(\s*\)/i, "microphone=(self)"));
    } else if (!/microphone/i.test(pp)) {
      h.set("Permissions-Policy", pp + ", microphone=(self)");
    }
    var csp = h.get("Content-Security-Policy");
    if (csp && /script-src/.test(csp) && !/script-src[^;]*'none'/.test(csp) && !/script-src[^;]*'self'/.test(csp)) {
      h.set("Content-Security-Policy", csp.replace(/script-src/, "script-src 'self'"));
    }
    if (csp && /connect-src/.test(csp) && !/connect-src[^;]*'self'/.test(csp) && !/connect-src[^;]*\*/.test(csp)) {
      h.set("Content-Security-Policy", h.get("Content-Security-Policy").replace(/connect-src/, "connect-src 'self'"));
    }
    h.set("X-Voice-Input", VX_VERSION);
  } catch (e) { vxNop(e); }
}
async function vxTranscribe(request, env) {
  var j = function (o, s) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); };
  var u = new URL(request.url);
  var origin = request.headers.get("Origin");
  if (request.headers.get("x-voice") !== "1" || (origin && origin !== u.origin) || request.headers.get("Sec-Fetch-Site") === "cross-site") return j({ ok: false, error: "same-origin voice requests only" }, 403);
  var ip = request.headers.get("CF-Connecting-IP") || "x", now = Date.now(), w = (VX_RATE[ip] || []).filter(function (t) { return now - t < 60000; });
  if (w.length >= 12) return j({ ok: false, error: "Too many recordings this minute. Wait a few seconds." }, 429);
  w.push(now); VX_RATE[ip] = w;
  var buf = await request.arrayBuffer();
  if (!buf.byteLength) return j({ ok: false, error: "empty recording" }, 400);
  if (buf.byteLength > 4194304) return j({ ok: false, error: "Recording over 4 MB; speak in shorter pieces." }, 413);
  // One speech-to-text implementation for the fleet: the dashboard sets globalThis.__vxStt (its own attributed AI binding); every other
  // worker forwards the bytes to it, so no other worker carries a second speech-model call site.
  try {
    if (typeof globalThis.__vxStt === "function") return j(await globalThis.__vxStt(buf, request.headers.get("Content-Type") || "audio/webm", env), 200);
    var fr = await fetch(VX_STT_URL, { method: "POST", headers: { "Content-Type": request.headers.get("Content-Type") || "audio/webm", "x-voice-fwd": "1" }, body: buf });
    var fj = await fr.json();
    return j(fj, fr.ok ? 200 : 502);
  } catch (e) { return j({ ok: false, error: "Could not reach the speech service." }, 502); }
}
function vxAttach(target, workerName) {
  try {
    if (!target || typeof target.fetch !== "function" || target.__vx === VX_VERSION) return target;
    var orig = target.fetch;
    target.fetch = async function (request, env, ctx) {
      var u;
      try { u = new URL(request.url); } catch (e) { return orig.call(this, request, env, ctx); }
      if (u.pathname === "/__voice.js" && request.method === "GET") {
        return new Response(VX_CLIENT, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Voice-Input": VX_VERSION } });
      }
      if (u.pathname === "/__voice/transcribe" && request.method === "POST") return vxTranscribe(request, env);
      var res = await orig.call(this, request, env, ctx);
      try {
        var ct = (res && res.headers.get("Content-Type") || "").toLowerCase();
        if (!res || res.status === 101 || ct.indexOf("text/html") !== 0) return res;
        var out = res;
        if (request.method === "GET" && res.ok && typeof HTMLRewriter !== "undefined" && !/script-src[^;]*'none'/.test(res.headers.get("Content-Security-Policy") || "")) {
          out = new HTMLRewriter().on("body", { element: function (el) { el.onEndTag(function (t) { t.before('<script src="/__voice.js" defer></script>', { html: true }); }); } }).transform(res);
          out.headers.delete("Content-Length"); out.headers.delete("ETag");
        } else {
          out = new Response(res.body, res);
        }
        vxHeaders(out.headers);
        return out;
      } catch (e) { return res; }
    };
    target.__vx = VX_VERSION;
    return target;
  } catch (e) { return target; }
}
// ---- VOICE-INPUT-1:END ----
// ---- VOICE-INPUT-1:ATTACH qnfo-jobsearch ----
vxAttach(handler, "qnfo-jobsearch");
