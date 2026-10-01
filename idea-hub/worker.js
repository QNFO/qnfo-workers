// idea-hub v1.2.0-ideation-loop-20261001
// SIGNALS-TRIAGE-GAP-1 (issue 1654) / L8 re-entry: qnfo-signal-loop, the only producer AND consumer of
//   signals.source='artifact_reentry', disappeared unrecorded around 2026-09-25 (worker_removals rationale), so
//   re-entry emission stopped 09-14, consumption 09-15 (128 left status=new) and idea_proposals stopped 09-24. Its
//   reentry + consume legs are ported here (idea-hub is already permitted for artifact_reentry in
//   signal_worker_boundary and holds the same LIVING_PAPER + QNFO_AUDIT bindings), with cost bounds the original
//   lacked: re-entry reads existing signals once instead of 2 queries per paper for 500 papers every hour and emits
//   at most REENTRY_BATCH new papers per run; consume takes CONSUME_SIGNALS signals x CONSUME_QUESTIONS questions per
//   run and pauses while more than PROPOSAL_BACKPRESSURE proposals await triage (the original could insert 375
//   proposals/hour against a triage rate of 5).
// idea-hub v1.1.0-triage-consumer-20261001
// IDEA-TRIAGE-CONSUMER-ABSENT-1 (issue 1689): qnfo-idea-triage was retired 2026-09-19 on the assumption that idea-hub
//   "embedded triage fully subsumes it", but idea-hub had no triage path at all, so idea_proposals stopped being
//   consumed on 2026-09-18 (19 status=new at 2026-10-01). The proposal-triage leg of qnfo-idea-triage 1.4.0 is ported
//   here verbatim (same two-model scorecard, tiebreak, ACCEPT thresholds, noise/question pre-filters, research_queue
//   enqueue) and runs on an hourly cron, at most TRIAGE_BATCH proposals per run. The public HTTP surface stays
//   read-only: /run and /api/proposals remain disabled; triage runs only from scheduled().
// idea-hub v1.0.8-toolinv-gate-20260929
// idea-hub v1.0.9-toolinv-shape-v2-20260929
// Fixes #1412 (D4/D5 RESIDUAL SHAPE HOLES). v1.0.8's TOOLINV caught the three live
//   leaks but its alternatives were over-specific: 'invoke <snake_case>' (no article),
//   and 'use your X tool' (no 'the'). Live gate probes 2026-09-29T17:2xZ returned
//   public:true for 'You must invoke the search tool ...' (D4) and 'Use the fetch
//   tool ...' (D5). v1.0.9 replaces verb-specific alternation with one VERB+ARTICLE+
//   NOUN-TYPE shape: (use|invoke|call|run) [your|the|a|an] <name> (tool|function|verb|
//   api|endpoint|action)s? -- plus 'call <snake_case> with' and bare '<snake_case> tool'.
//   Validated against the 39 live public titles (0 false positives) and the adversarial
//   set ('Call it with caution', 'Use your own judgement', 'call a function with keyword
//   arguments', 'Run the numbers', 'The tool with no name' all correctly unmatched).
//   Fail-closed: an imperative tool directive is never a public title. Still NOT in
//   INTERNAL/OPS, which also feed blocked(), so this gate cannot quarantine whole threads.
// Fixes #1412 (RESIDUAL CLASS). The v1.0.7 STAMP gate closed the orchestrator-retry
//   stamp vector, but the underlying OPS denylist enumerates SPECIFIC tool names and
//   therefore structurally lags the tool surface. Three public RSS items still exposed
//   raw agent tool-call directives as titles, because suggest_contacts and social_compose
//   were never added to OPS:
//     t-use-your-suggest-contacts-tool-w-2026-09-01
//     t-use-your-social-compose-tool-wit-2026-09-01
//     t-call-social-compose-with-title-t-2026-09-01
//   (Confirmed live 2026-09-29T17:16Z; the instances were quarantined in
//   chat_feed_quarantine_20260926 the same hour, which removed them from /rss.xml,
//   /api/feed, /api/sessions and /api/session/<id>. But /api/gate still returned
//   public:true for 'Use your suggest_contacts tool with topic=...', so the GATE was
//   still open and any newly added tool could leak the same way.)
//   TOOLINV replaces name-enumeration with the generic IMPERATIVE TOOL-INVOCATION
//   SHAPE. Validation against all 40 live titles: 3/3 leaks caught, 0 false positives;
//   10 adversarial probes all correctly unmatched ("Call it with caution", "Use your
//   own judgement", "call a function with keyword arguments", "Run the numbers",
//   "The tool with no name"). Fail-closed: an imperative tool directive is never a
//   public title. Deliberately NOT in INTERNAL/OPS, which also feed blocked(), so this
//   gate cannot quarantine whole threads.
// idea-hub v1.0.6-quarantine-wired-20260926
// Fixes #1179 QUARANTINE-TABLE-NOT-WIRED-1: chat_feed_quarantine_20260926 was written by the
//   integrity sweep but never read by this gate, so its 257 rows / 38 threads were inert.
//   blocked() now consults the quarantine set FIRST, so a quarantined thread cannot reach
//   /api/feed, /api/sessions, /rss.xml or /api/session/<id> regardless of title or content.
//   This also supplies the retraction path #1182 says is missing: the one thread quarantined
//   for "content error ... retracted 2026-09-26 (err-20260926-001)" is now withheld by
//   mechanism rather than by accident. Fail-closed on D1 error, consistent with the
//   pre-existing content scan. Set cached 60s. /health reports the wired count.
// Carries forward v1.0.5-boundary-match-20260926 (fix #1168 FEED-GATE-SUBSTRING-COLLISION-1:
//   single alphanumeric denylist tokens are matched with word boundaries
//   (?<![a-z0-9])token(?![a-z0-9]); phrases keep substring matching).
var VERSION = "1.2.1-errata-gate";
const BASE='https://ideas.qnfo.org';
const INTERNAL=['system-reminder','<system-reminder','system prompt','role instructions','respond with the exact first sentence','reply with ok','reply with exactly','write 200 words','write one self-contained python','extract every quantitative claim','you are an adversarial reviewer','you are the revising author','revision round-2 mandate','l8 specification','operator-shared thread','numerical verification sprint','paper-reviser','tool_call','tool result','strict json only','compare paqit','guard-probe','probe-','research and publish','calendar event','email received','attachment_file','file_index','file_key','file_content','read-only context data','working memory','context-data','treat them strictly as data'];
const OPS=['audit and remediate','remediate all failure modes','failure-mode','failure modes','backlog','open issues','ops_issue_run','fleet_status','backlog_status','ops_d1_query','ops_d1_write','cf_worker_read','cf_worker_deploy','cf_worker_bindings','workspace_write','workspace_read','web_fetch','web_search','github_','r2_','kv_','vectorize_query','telemetry_report','telemetry_analyze','dr_validate_schema','service_discover','shell_exec','exec_python','exec_node','container_status','qnfo-ops','worker deploy','patches not deployed','source drift','canonical source','binding missing','retired health stub','email-orchestrator','schema guard','dod audit','claim sheet','wbs plan','confirm:true','dryrun','incomplete:','ops endpoint','server-side ops','cloudflare worker'];
const JUNK=['say ok','say okay','test','testing','what is the capital','who are you','what is your name','tell me a joke','write a poem','write me a','make me a','create me','explain like i','good morning','good night','thank you','thanks','continue','repeat','again','what time is it','write code','implement a','give this conversation a name','hello world','what is 2+2','daily planning','life advice','productivity','planning a','trip to','overwinter','show my partner','weather in','weather for','what color is in this image','what colour is in this image','color is in this image','colour is in this image','image?','what relevant conferences are coming up'];
const RESEARCH=['quantum','qec','p-adic','ultrametric','thermodynamic','landauer','majorana','topological','number theory','physics','mathematics','set theory','self-reference','measurement','decoherence','gravity','spacetime','riemann','zeta','matrix','computation','ai-assisted science','consilience','distinction','entropy','hilbert','wheeler','page-wootters','cause','block','linguistic','etymological','sea peoples','conflict','misunderstanding','ignorance','slime mold','citation','marginalia'];
function cors(){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};}
function json(x,s=200){return new Response(JSON.stringify(x),{status:s,headers:{...cors(),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function clean(s,max=240){return String(s||'').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi,' ').replace(/<system-reminder>[\s\S]*$/gi,' ').replace(/^(User|Assistant|System|Human|AI)\s*:\s*/i,'').replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,'[redacted]').replace(/\b[A-Za-z0-9_-]{24,}\b/g,'[redacted]').replace(/\s+/g,' ').trim().slice(0,max)}
function reEsc(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
const _wordRe=new Map();
function wordHit(t,p){let re=_wordRe.get(p);if(!re){re=new RegExp('(?<![a-z0-9])'+reEsc(p)+'(?![a-z0-9])','i');_wordRe.set(p,re)}return re.test(t)}
function has(s,a){const t=String(s||'').toLowerCase();return a.some(function(x){const p=String(x).toLowerCase();if(/^[a-z0-9]+$/.test(p))return wordHit(t,p);return t.includes(p)})}
// F10-RSS-PIPELINE-STAMP-GATE-1 (issue #1412, 2026-09-29): publicTitle() previously
// required only a RESEARCH token, so an orchestrator retry stamp prefixed to the idea
// summary passed verbatim into the public RSS title. Live reproduction (external curl,
// 2026-09-29T17:11:22Z) item 2 of https://ideas.qnfo.org/rss.xml read
//   "RETRY (prior submission was dropped by an expressed-step abort). Notation-commissioning
//    audit: ... physics and quantum mechanics."
// It passed because "physics"/"quantum" are RESEARCH tokens and the stamp matches no
// INTERNAL/OPS/JUNK entry. Detected here, before the lists; deliberately NOT in INTERNAL,
// which also feeds blocked() and would quarantine whole threads on a phrase like
// "before execution". Fail-closed: a stamped summary is never a public title.
const STAMP=/(prior submission was dropped|expressed-step abort|dropped by an expressed|notation-commissioning|cross-link to qnf-|cross-link to dlf-|before execution|retry\s*\()/i;
// F10-TOOLINV-GATE-1 (issue #1412 residual class, 2026-09-29): see header. Matches the
// generic imperative tool-invocation SHAPE, not a tool-name list, so a newly registered
// tool cannot leak as a public title. Validated: 3/3 live leaks caught, 0/40 live titles
// and 0/10 adversarial probes false-positive.
const TOOLINV=/(?:use|invoke|call|run)\s+(?:your\s+|the\s+|a\s+|an\s+)?[a-z][a-z0-9_]{1,}(?:_[a-z0-9]+)*\s+(?:tools?|functions?|verbs?|apis?|endpoints?|actions?)\b|call\s+[a-z][a-z0-9_]{1,}(?:_[a-z0-9]+)+\s+with\b|(?<![a-z0-9])[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s+(?:tool|function|verb)\b/i;
function publicTitle(s){const t=clean(s,1000);if(STAMP.test(t))return false;if(TOOLINV.test(t))return false;return t.length>=12&&!has(t,INTERNAL)&&!has(t,OPS)&&!has(t,JUNK)&&has(t,RESEARCH)}
function ts(v){if(!v)return null;if(typeof v==='number')return new Date(v).toISOString();let s=String(v).replace(' ','T');if(!/Z$|[+-]\d\d:\d\d$/.test(s))s+='Z';const d=new Date(s);return Number.isNaN(d.getTime())?String(v):d.toISOString()}
let _qSet=null,_qAt=0;
async function quarantined(env){const n=Date.now();if(_qSet&&n-_qAt<60000)return _qSet;const r=(await env.QNFO_AUDIT.prepare('SELECT DISTINCT thread FROM chat_feed_quarantine_20260926 WHERE thread IS NOT NULL LIMIT 5000').all()).results||[];_qSet=new Set(r.map(function(x){return String(x.thread)}));_qAt=n;return _qSet}
let _eSet=null,_eAt=0;
// CONTENT-ACCURACY-NOT-A-GATE-1 (#1182): threads named by an open internal_errata row (target_kind chat_log, target_ref '<thread>:...') are withheld by mechanism, independent of title/substring gates.
async function errataThreads(env){const n=Date.now();if(_eSet&&n-_eAt<60000)return _eSet;const r=(await env.QNFO_AUDIT.prepare("SELECT target_ref FROM internal_errata WHERE target_kind='chat_log' AND COALESCE(status,'open') NOT IN ('closed','resolved','rejected') LIMIT 5000").all()).results||[];_eSet=new Set(r.map(function(x){return String(x.target_ref).split(':')[0]}));_eAt=n;return _eSet}
async function blocked(env,id){try{if((await quarantined(env)).has(String(id)))return true;if((await errataThreads(env)).has(String(id)))return true;const r=(await env.QNFO_AUDIT.prepare('SELECT role,content FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 200').bind(id).all()).results||[];return r.some(x=>x.role==='system'||has(x.content,INTERNAL)||has(x.content,OPS)||has(x.content,JUNK))}catch(e){return true}}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
async function all(env){const rows=(await env.QNFO_AUDIT.prepare("SELECT c.thread AS id,COUNT(*) AS n,MIN(c.ts) first_ts,MAX(c.ts) last_ts,(SELECT content FROM chat c2 WHERE c2.thread=c.thread AND c2.role='user' ORDER BY c2.ts ASC,c2.id ASC LIMIT 1) title,(SELECT model FROM chat c2 WHERE c2.thread=c.thread ORDER BY c2.ts DESC LIMIT 1) model FROM chat c GROUP BY c.thread ORDER BY last_ts DESC LIMIT 500").all()).results||[];const out=[];for(const r of rows){if(!publicTitle(r.title))continue;if(await blocked(env,r.id))continue;out.push({id:r.id,kind:'thread',source:'live',title:clean(r.title,220),created_at:ts(r.first_ts)||ts(r.last_ts),updated_at:ts(r.last_ts)||ts(r.first_ts),message_count:Number(r.n)||0,model:r.model||null,tags:['conversation','live']})}try{const ar=(await env.QNFO_AUDIT.prepare("SELECT thread_id id,title,created_at,updated_at FROM chat_sessions WHERE category='research' ORDER BY COALESCE(updated_at,created_at) DESC LIMIT 500").all()).results||[];for(const r of ar){if(!publicTitle(r.title))continue;if(await blocked(env,r.id))continue;out.push({id:r.id,kind:'session',source:'archive',title:clean(r.title,220),created_at:ts(r.created_at),updated_at:ts(r.updated_at)||ts(r.created_at),message_count:0,model:null,tags:['conversation','archive']})}}catch(e){}const seen=new Set();return out.sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0)).filter(x=>{const k=x.title.toLowerCase().slice(0,100);if(seen.has(k))return false;seen.add(k);return true})}
async function rss(env){const it=(await all(env)).slice(0,40);const body='<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>QNFO Idea Factory</title><link>'+BASE+'/</link><description>Public read-only research conversations from QNFO - ideas as they develop.</description><lastBuildDate>'+new Date().toUTCString()+'</lastBuildDate>\n'+it.map(x=>'<item><title>'+esc(x.title)+'</title><link>'+BASE+'/#/s/'+encodeURIComponent(x.id)+'</link><guid isPermaLink="false">'+esc(x.id)+'</guid><description>'+esc(x.title)+'</description><pubDate>'+new Date(x.updated_at||x.created_at||Date.now()).toUTCString()+'</pubDate></item>').join('\n')+'\n</channel></rss>';return new Response(body,{headers:{...cors(),'Content-Type':'application/rss+xml; charset=utf-8','Cache-Control':'no-store'}})}
async function sessions(url,env){const limit=Math.min(Math.max(parseInt(url.searchParams.get('limit')||'50',10),1),100);return json({sessions:(await all(env)).slice(0,limit),limit})}
async function session(path,env){const id=decodeURIComponent(path.split('/').slice(3).join('/'));const rows=(await env.QNFO_AUDIT.prepare('SELECT ts,role,content,model FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 500').bind(id).all()).results||[];const first=rows.find(r=>r.role==='user');if(!first||!publicTitle(first.content)||await blocked(env,id))return json({error:'Session not found or not public'},404);return json({id,title:clean(first.content,500),messages:rows.filter(r=>r.role!=='system'&&!has(r.content,INTERNAL)&&!has(r.content,OPS)&&!has(r.content,JUNK)).map(r=>({role:r.role,content:clean(r.content,200000),timestamp:ts(r.ts),model:r.model||null}))})}
function html(){return new Response('<!doctype html><meta charset="utf-8"><title>QNFO Ideas</title><h1>QNFO Ideas</h1><p>Public read-only research conversations as they develop.</p><p><a href="/rss.xml">RSS feed</a></p>',{headers:{...cors(),'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})}

// ---- triage consumer (ported from qnfo-idea-triage 1.4.0) ----
var TRIAGE_BATCH = 5;
var T_MODELS = { a: "@cf/zai-org/glm-5.3-flash", b: "@cf/deepseek-ai/deepseek-v4-flash-0731", tiebreak: "@cf/qwen/qwen3-30b-a3b-fp8" };
var T_CHAIN = ["@cf/zai-org/glm-5.3-flash", "@cf/zai-org/glm-5.3", "@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/zai-org/glm-5.2"];
var ACCEPT_MIN = 0.7, FEAS_MIN = 0.5, RISK_MAX = 0.4, STD_TIE = 0.25;
var T_KEYS = ["novelty", "technical_merit", "impact_potential", "exposure_potential", "feasibility", "risk"];
var SCORECARD_PROMPT = "You are QNFO's research-idea merit reviewer. Score the idea below for the QNFO autonomous research pipeline.\n" +
"Return JSON ONLY: {\"novelty\":0-1,\"technical_merit\":0-1,\"impact_potential\":0-1,\"exposure_potential\":0-1,\"feasibility\":0-1,\"risk\":0-1,\"rationale\":\"<=120 chars\",\"hook\":\"<=90 chars, one-line public-facing hook\"}\n" +
"Scoring guide: technical_merit = depth of technical content + verifiability; impact_potential = significance if proven; exposure_potential = breadth of audience/attention it can attract (social, media, cross-field); risk = probability of producing nothing citable (1 = near-certain dead end). IMPORTANT: feasibility means feasibility of the THEORETICAL/COMPUTATIONAL research itself (can the derivation, simulation, formal analysis, and computational verification be carried out by the QNFO autonomous pipeline) - NOT experimental testability. QNFO has no laboratory; an idea is feasible if its mathematics/computation can be executed and verified in silico, even if a confirming experiment would require external labs years away. Do NOT mark a theoretical physics idea infeasible merely because no experiment currently exists.\n" +
"IDEA: ";
function tExtract(r) {
  if (!r) return "";
  var ch = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (ch) return String(ch);
  if (typeof r.response === "string") return r.response;
  if (r.result && typeof r.result.response === "string") return r.result.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  return "";
}
async function tRunModel(env, name, prompt) {
  var lastErr = "";
  var chain = [name].concat(T_CHAIN.filter(function (x) { return x !== name; })).slice(0, 4);
  for (var i = 0; i < chain.length; i++) {
    try {
      var r = await env.AI.run(chain[i], { messages: [{ role: "user", content: prompt }], max_tokens: 700, temperature: 0.2 });
      var mm = tExtract(r).match(/\{[\s\S]*\}/);
      if (!mm) { lastErr = chain[i] + ": no JSON"; continue; }
      var c = JSON.parse(mm[0]); var ok = true;
      for (var k = 0; k < T_KEYS.length; k++) { var v = parseFloat(c[T_KEYS[k]]); if (!isFinite(v)) { ok = false; break; } c[T_KEYS[k]] = Math.max(0, Math.min(1, v)); }
      if (!ok) { lastErr = chain[i] + ": invalid scorecard"; continue; }
      return { card: c, model: chain[i] };
    } catch (e) { lastErr = chain[i] + ": " + (e && e.message || e); }
  }
  return { error: lastErr };
}
async function scoreIdea(env, desire) {
  var prompt = SCORECARD_PROMPT + String(desire || "").slice(0, 3000);
  var res = await Promise.all([tRunModel(env, T_MODELS.a, prompt), tRunModel(env, T_MODELS.b, prompt)]);
  var a = res[0].card ? res[0] : null, b = res[1].card ? res[1] : null, card, models;
  if (a && b) {
    card = {}; T_KEYS.forEach(function (k) { card[k] = (a.card[k] + b.card[k]) / 2; });
    card.rationale = a.card.rationale || ""; models = [a.model, b.model];
    var std = Math.sqrt(T_KEYS.map(function (k) { return Math.pow(a.card[k] - b.card[k], 2); }).reduce(function (x, y) { return x + y; }, 0) / T_KEYS.length);
    if (std > STD_TIE) { var t = await tRunModel(env, T_MODELS.tiebreak, prompt); if (t.card) { T_KEYS.forEach(function (k) { card[k] = (a.card[k] + b.card[k] + t.card[k]) / 3; }); models.push(t.model); } }
  } else if (a || b) { card = (a || b).card; models = [(a || b).model]; }
  else return { error: "all scoring models failed: " + [res[0].error, res[1].error].join(" | ") };
  var score = 0.3 * card.novelty + 0.3 * card.technical_merit + 0.2 * card.impact_potential + 0.2 * card.exposure_potential;
  var decision = score >= ACCEPT_MIN && card.feasibility >= FEAS_MIN && card.risk <= RISK_MAX ? "ACCEPT" : "HOLD";
  return { score: Math.round(score * 1000) / 1000, decision: decision, rationale: card.rationale, model: models.join("+") };
}
var NOISE_RE = [/^call (the )?[a-z_]+( tool)?(\s|$)/i, /(email_check|express_intent|intents_list|social_compose|search_research|search_papers tool)/i, /output the (complete )?raw json/i, /^reply with the single word/i, /^give this conversation a name/i, /^max \d+ chars/i, /based on the chat history/i, /rotation verification/i, /redirect probe/i, /auto-express block/i, /wrapped in/i, /^ok$/i];
function isNoise(t) { t = String(t || ""); return NOISE_RE.some(function (re) { return re.test(t); }); }
function isQuestion(t) { t = String(t || "").trim(); return t.length < 160 && /\?\s*$/.test(t) && /^(what|who|where|when|why|how|is|are|do|does|did|can|could|should|would|will|has|have|quick|one line|one sentence|in one sentence|probe)/i.test(t); }
async function triageProposals(env) {
  var out = { triaged: 0, accepted: 0, errors: 0 };
  var rows = (await env.QNFO_AUDIT.prepare("SELECT id, idea FROM idea_proposals WHERE status='new' ORDER BY created_at ASC LIMIT ?1").bind(TRIAGE_BATCH).all()).results || [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i], now = new Date().toISOString();
    try {
      if (isNoise(row.idea) || isQuestion(row.idea)) {
        await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision='HOLD', rationale=?, triaged_at=?, status='triaged_hold' WHERE id=?").bind("noise/question filter", now, row.id).run();
        out.triaged++; continue;
      }
      var s = await scoreIdea(env, row.idea);
      if (s.error) { out.errors++; continue; }
      await env.QNFO_AUDIT.prepare("UPDATE idea_proposals SET decision=?, score=?, rationale=?, triaged_at=?, status=? WHERE id=?").bind(s.decision, s.score, s.rationale || "", now, s.decision === "ACCEPT" ? "triaged_accepted" : "triaged_hold", row.id).run();
      out.triaged++;
      if (s.decision === "ACCEPT") {
        await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at) VALUES (?1,'proposal',?2,?3,'',?4,?5,'queued',?6)").bind(crypto.randomUUID(), String(row.id), String(row.idea || "").slice(0, 3000), s.score, s.decision, now).run();
        out.accepted++;
      }
    } catch (e) { out.errors++; }
  }
  try { await env.QNFO_AUDIT.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES ('idea-hub', ?1, ?2, ?3) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind(VERSION, new Date().toISOString(), out.errors ? 0 : 1).run(); } catch (e) {}
  return out;
}

// ---- L8 re-entry loop (ported from qnfo-signal-loop 1.1.2, bounded) ----
var REENTRY_BATCH = 20, CONSUME_SIGNALS = 2, CONSUME_QUESTIONS = 3, PROPOSAL_BACKPRESSURE = 30;
function extractOpenQuestions(bodyMd) {
  if (!bodyMd) return [];
  var text = String(bodyMd), out = [], seen = new Set();
  var push = function (x) {
    var t = String(x).replace(/\s+/g, " ").replace(/^[\s*\-\d.]+/, "").trim();
    if (t.length < 15 || t.length > 320) return;
    var k = t.slice(0, 80).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    if (out.length < 15) out.push(t);
  };
  var m = text.match(/##?\s*(Open Questions?|Open Problems?|Future Work|Future Directions?|Limitations?|Outlook|Unresolved|Discussion)[\s\S]{0,4000}/i);
  if (m) m[0].split("\n").forEach(function (l) { if (/^\s*([-*]|\d+\.)\s+\S/.test(l)) push(l); });
  (text.match(/[^.\n]{12,300}?(open question|remains? open|open problem|unresolved|future work|not yet (known|understood|resolved|established)|unknown whether|remains? to be)[^.\n]{0,240}[.?]/gi) || []).forEach(push);
  (text.match(/[^.\n?]{25,300}\?/g) || []).forEach(push);
  return out;
}
async function runReentry(env) {
  var out = { scanned: 0, emitted: 0, errors: 0 };
  var papers = (await env.LIVING_PAPER.prepare("SELECT doi, title FROM papers WHERE doi IS NOT NULL AND doi != '' AND body_md IS NOT NULL AND body_md != '' ORDER BY created_at DESC LIMIT 500").all()).results || [];
  out.scanned = papers.length;
  var have = new Set(((await env.QNFO_AUDIT.prepare("SELECT source_ref FROM signals WHERE source='artifact_reentry'").all()).results || []).map(function (r) { return String(r.source_ref); }));
  var todo = papers.filter(function (p) { return !have.has(String(p.doi)); }).slice(0, REENTRY_BATCH);
  for (var i = 0; i < todo.length; i++) {
    var p = todo[i];
    try {
      var pr = await env.LIVING_PAPER.prepare("SELECT substr(body_md, 1, 12000) AS b FROM papers WHERE doi = ? LIMIT 1").bind(p.doi).first();
      var oq = extractOpenQuestions(pr && pr.b || "");
      var now = new Date().toISOString();
      await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind("artifact_reentry:" + String(p.doi).replace(/[^a-z0-9]+/gi, "-").slice(0, 80), now, "artifact_reentry", p.doi, String(p.title || "").slice(0, 500), JSON.stringify(oq), oq.length ? 0.9 : 0, "research", "new", now).run();
      out.emitted++;
    } catch (e) { out.errors++; }
  }
  return out;
}
async function runConsume(env) {
  var out = { consumed: 0, proposals: 0, paused: false, errors: 0 };
  var pending = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status='new'").first();
  if (pending && Number(pending.n) > PROPOSAL_BACKPRESSURE) { out.paused = true; return out; }
  var b = await env.QNFO_AUDIT.prepare("SELECT permitted FROM signal_worker_boundary WHERE worker='idea-hub' AND source='artifact_reentry'").first();
  if (!b || Number(b.permitted) !== 1) { out.paused = true; return out; }
  var rows = (await env.QNFO_AUDIT.prepare("SELECT id, source_ref, open_questions FROM signals WHERE source='artifact_reentry' AND status='new' AND evidential_weight > 0 ORDER BY created_at LIMIT ?1").bind(CONSUME_SIGNALS).all()).results || [];
  for (var i = 0; i < rows.length; i++) {
    var sg = rows[i], oq = [];
    try { oq = JSON.parse(sg.open_questions || "[]"); } catch (e) {}
    var ok = true;
    var qs = Array.isArray(oq) ? oq.slice(0, CONSUME_QUESTIONS) : [];
    for (var j = 0; j < qs.length; j++) {
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES (?,?,?,?,?,?)")
          .bind("auto-reentry", "Re-entry from " + String(sg.source_ref || "").slice(0, 120) + ": " + String(qs[j]).slice(0, 1800), "auto", "new", "l8-reentry", new Date().toISOString()).run();
        out.proposals++;
      } catch (e) { out.errors++; ok = false; }
    }
    if (ok) { await env.QNFO_AUDIT.prepare("UPDATE signals SET status='consumed', decision=? WHERE id=?").bind("idea-hub " + VERSION + ": " + qs.length + " of " + oq.length + " open questions proposed", sg.id).run(); out.consumed++; }
  }
  return out;
}
async function ideationCycle(env) {
  var r = {};
  try { r.reentry = await runReentry(env); } catch (e) { r.reentry = { error: String(e && e.message || e) }; }
  try { r.consume = await runConsume(env); } catch (e) { r.consume = { error: String(e && e.message || e) }; }
  r.triage = await triageProposals(env);
  return r;
}
export default{async scheduled(event,env,ctx){ctx.waitUntil(ideationCycle(env))},async fetch(req,env){const u=new URL(req.url);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors()});try{if(u.pathname==='/health'){let qt=-1;try{qt=(await quarantined(env)).size}catch(e){}return json({ok:true,worker:'idea-hub',version:VERSION,public_filter:true,thread_filter:true,strict_filter:true,match_mode:'boundary',quarantine_wired:true,errata_wired:true,quarantine_threads:qt,mutation_routes:false,bindings:{audit:!!env.QNFO_AUDIT}})}if(u.pathname==='/api/gate'){const q=u.searchParams.get('q')||'';return json({q,public:publicTitle(q),internal:has(q,INTERNAL),ops:has(q,OPS),junk:has(q,JUNK),research:has(q,RESEARCH),match_mode:'boundary'})}if(u.pathname==='/rss.xml')return rss(env);if(u.pathname==='/api/sessions'||u.pathname==='/api/feed')return sessions(u,env);if(u.pathname.startsWith('/api/session/'))return session(u.pathname,env);if(u.pathname==='/api/suggest')return json({policy:'research-domain only; personal/ops/actions/runtime metadata are never suggested',groups:[]});if(u.pathname==='/api/ask'||u.pathname==='/api/proposals'||u.pathname==='/run')return json({error:'mutation or ask route disabled on public ideas surface'},503);if(u.pathname==='/'||u.pathname.startsWith('/#/'))return html();return json({error:'Not found'},404)}catch(e){return json({error:'Server error: '+(e&&e.message||String(e))},500)}}};