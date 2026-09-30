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
const VERSION='1.0.9-toolinv-shape-v2';
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
async function blocked(env,id){try{if((await quarantined(env)).has(String(id)))return true;const r=(await env.QNFO_AUDIT.prepare('SELECT role,content FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 200').bind(id).all()).results||[];return r.some(x=>x.role==='system'||has(x.content,INTERNAL)||has(x.content,OPS)||has(x.content,JUNK))}catch(e){return true}}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
async function all(env){const rows=(await env.QNFO_AUDIT.prepare("SELECT c.thread AS id,COUNT(*) AS n,MIN(c.ts) first_ts,MAX(c.ts) last_ts,(SELECT content FROM chat c2 WHERE c2.thread=c.thread AND c2.role='user' ORDER BY c2.ts ASC,c2.id ASC LIMIT 1) title,(SELECT model FROM chat c2 WHERE c2.thread=c.thread ORDER BY c2.ts DESC LIMIT 1) model FROM chat c GROUP BY c.thread ORDER BY last_ts DESC LIMIT 500").all()).results||[];const out=[];for(const r of rows){if(!publicTitle(r.title))continue;if(await blocked(env,r.id))continue;out.push({id:r.id,kind:'thread',source:'live',title:clean(r.title,220),created_at:ts(r.first_ts)||ts(r.last_ts),updated_at:ts(r.last_ts)||ts(r.first_ts),message_count:Number(r.n)||0,model:r.model||null,tags:['conversation','live']})}try{const ar=(await env.QNFO_AUDIT.prepare("SELECT thread_id id,title,created_at,updated_at FROM chat_sessions WHERE category='research' ORDER BY COALESCE(updated_at,created_at) DESC LIMIT 500").all()).results||[];for(const r of ar){if(!publicTitle(r.title))continue;if(await blocked(env,r.id))continue;out.push({id:r.id,kind:'session',source:'archive',title:clean(r.title,220),created_at:ts(r.created_at),updated_at:ts(r.updated_at)||ts(r.created_at),message_count:0,model:null,tags:['conversation','archive']})}}catch(e){}const seen=new Set();return out.sort((a,b)=>Date.parse(b.updated_at||0)-Date.parse(a.updated_at||0)).filter(x=>{const k=x.title.toLowerCase().slice(0,100);if(seen.has(k))return false;seen.add(k);return true})}
async function rss(env){const it=(await all(env)).slice(0,40);const body='<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>QNFO Idea Factory</title><link>'+BASE+'/</link><description>Public read-only research conversations from QNFO - ideas as they develop.</description><lastBuildDate>'+new Date().toUTCString()+'</lastBuildDate>\n'+it.map(x=>'<item><title>'+esc(x.title)+'</title><link>'+BASE+'/#/s/'+encodeURIComponent(x.id)+'</link><guid isPermaLink="false">'+esc(x.id)+'</guid><description>'+esc(x.title)+'</description><pubDate>'+new Date(x.updated_at||x.created_at||Date.now()).toUTCString()+'</pubDate></item>').join('\n')+'\n</channel></rss>';return new Response(body,{headers:{...cors(),'Content-Type':'application/rss+xml; charset=utf-8','Cache-Control':'no-store'}})}
async function sessions(url,env){const limit=Math.min(Math.max(parseInt(url.searchParams.get('limit')||'50',10),1),100);return json({sessions:(await all(env)).slice(0,limit),limit})}
async function session(path,env){const id=decodeURIComponent(path.split('/').slice(3).join('/'));const rows=(await env.QNFO_AUDIT.prepare('SELECT ts,role,content,model FROM chat WHERE thread=? ORDER BY ts ASC,id ASC LIMIT 500').bind(id).all()).results||[];const first=rows.find(r=>r.role==='user');if(!first||!publicTitle(first.content)||await blocked(env,id))return json({error:'Session not found or not public'},404);return json({id,title:clean(first.content,500),messages:rows.filter(r=>r.role!=='system'&&!has(r.content,INTERNAL)&&!has(r.content,OPS)&&!has(r.content,JUNK)).map(r=>({role:r.role,content:clean(r.content,200000),timestamp:ts(r.ts),model:r.model||null}))})}
function html(){return new Response('<!doctype html><meta charset="utf-8"><title>QNFO Ideas</title><h1>QNFO Ideas</h1><p>Public read-only research conversations as they develop.</p><p><a href="/rss.xml">RSS feed</a></p>',{headers:{...cors(),'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})}
export default{async fetch(req,env){const u=new URL(req.url);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors()});try{if(u.pathname==='/health'){let qt=-1;try{qt=(await quarantined(env)).size}catch(e){}return json({ok:true,worker:'idea-hub',version:VERSION,public_filter:true,thread_filter:true,strict_filter:true,match_mode:'boundary',quarantine_wired:true,quarantine_threads:qt,mutation_routes:false,bindings:{audit:!!env.QNFO_AUDIT}})}if(u.pathname==='/api/gate'){const q=u.searchParams.get('q')||'';return json({q,public:publicTitle(q),internal:has(q,INTERNAL),ops:has(q,OPS),junk:has(q,JUNK),research:has(q,RESEARCH),match_mode:'boundary'})}if(u.pathname==='/rss.xml')return rss(env);if(u.pathname==='/api/sessions'||u.pathname==='/api/feed')return sessions(u,env);if(u.pathname.startsWith('/api/session/'))return session(u.pathname,env);if(u.pathname==='/api/suggest')return json({policy:'research-domain only; personal/ops/actions/runtime metadata are never suggested',groups:[]});if(u.pathname==='/api/ask'||u.pathname==='/api/proposals'||u.pathname==='/run')return json({error:'mutation or ask route disabled on public ideas surface'},503);if(u.pathname==='/'||u.pathname.startsWith('/#/'))return html();return json({error:'Not found'},404)}catch(e){return json({error:'Server error: '+(e&&e.message||String(e))},500)}}};