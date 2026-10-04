var VERSION="2.3.1-itinerary-ingest"/* HANDOFF-CLAIM-SHEET-1: every handoffs insert carries a claim_sheet (FRAMEWORK-DOGFOOD-1 trigger rejected them since 2026-09-27); SCHEDULES-LIVE-1 */;
const BODY_MAX_TEXT=1e4,BODY_MAX_HTML=2e4;
export default{async email(m,e,c){const st=Date.now(),h=m.headers,from=m.from,to=m.to,subject=h.get("subject")||"(no subject)",messageId=h.get("message-id")||(Date.now()+"-"+crypto.randomUUID()),receivedAt=new Date().toISOString();const parsed=await parseBody(m.raw),bodyText=(parsed.bodyText||"").slice(0,BODY_MAX_TEXT),bodyHtml=(parsed.bodyHtml||"").slice(0,BODY_MAX_HTML),rawText=parsed.rawText||"",headersJson=JSON.stringify(Object.fromEntries(h.entries())),classification=await classifyInbound(e.AUDIT_DB,from,to);const filter=await applyFilters(e.AUDIT_DB,from,to,subject,bodyText);if(filter.action==="reject"){m.setReject(filter.reason||"rejected");return}const emailId=await storeEmail(e.AUDIT_DB,{messageId,from,to,subject,bodyText,bodyHtml,headersJson,classification,receivedAt,inReplyTo:h.get("in-reply-to")||null,refsHdr:h.get("references")||null});c.waitUntil(archiveRaw(e,{emailId,messageId,rawText,rawSize:m.rawSize,receivedAt}));c.waitUntil(itineraryIngest(e,{emailId,from,subject,bodyText,bodyHtml,authResults:h.get("authentication-results")||""}));const spam=(filter.action==="spam")||heuristicSpam(from,subject);if(spam){await logAction(e.AUDIT_DB,emailId,"spam",classification,st);return}c.waitUntil(enqueueHumanReply(e,{emailId:emailId,from:from,to:to,subject:subject,bodyText:bodyText,bodyHtml:bodyHtml,receivedAt:receivedAt}));if(String(bodyText||"").trim()||String(bodyHtml||"").trim())c.waitUntil(resolveParseFailures(e.AUDIT_DB,from,subject));c.waitUntil(recordParseFailure(e,{emailId,messageId,from,to,subject,bodyText,bodyHtml,headersJson,rawText,rawSize:m.rawSize,receivedAt}));c.waitUntil(enqueueHandoff(e,{emailId,from,subject,receivedAt,classification}));try{await processCommand(e,{emailId:emailId,messageId:messageId,inReplyTo:h.get("in-reply-to")||null,from:from,to:to,subject:subject,bodyText:bodyText,authResults:h.get("authentication-results")||""})}catch(err){console.error("processCommand",err&&err.message||err)}
await logAction(e.AUDIT_DB,emailId,"processed",classification,st)},async scheduled(controller,env,ctx){try{const r=await drainReplyQueue(env);console.log("qnfo-email v2.1.5 drain",JSON.stringify(r))}catch(e){console.error("drain",e&&e.message||e)}try{await replyStallGuard(env)}catch(e){}try{console.log("qnfo-email freshness",JSON.stringify(await freshnessGuard(env)))}catch(e){console.error("freshness",e&&e.message||e)}console.log("qnfo-email v2.1.5 scheduled done")},async fetch(req,e){const u=new URL(req.url),p=u.pathname==="/email"?"/":u.pathname.replace(/^\/email(?=\/)/,"");const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","access-control-allow-origin":"*"}});if(p==="/health")return J({status:"ok",worker:"qnfo-email",version:VERSION,capabilities:["inbound-email", "command-control", "raw-archive", "send", "reply-queue"],limitations:["every route except /health needs API_KEY or GATEWAY_EMAIL_KEY", "commands are accepted only from allowlisted senders (the list is not published)", "queued replies drain on the daily 07:00 cron"],command_control:true,raw_archive:true,mime_guard:true,bindings:{d1:!!e.AUDIT_DB,send_email:!!e.SEND_EMAIL,ops_key:!!e.OPS_KEY},timestamp:new Date().toISOString()});/* OPTIONS-AUTH-1 (2026-10-01): OPTIONS used to skip the key check and fall through to the data routes. */if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS","access-control-allow-headers":"authorization,x-api-key,content-type"}});if(p!=="/health"){const a=req.headers.get("authorization")||"",x=req.headers.get("x-api-key")||"";const ok=(e.API_KEY&&(a==="Bearer "+e.API_KEY||x===e.API_KEY))||(e.GATEWAY_EMAIL_KEY&&(a==="Bearer "+e.GATEWAY_EMAIL_KEY||x===e.GATEWAY_EMAIL_KEY));if(!ok)return J({error:"unauthorized"},401)}try{if(p==="/stats")return J(await stats(e));if(p==="/emails/recent"){const limit=Math.min(parseInt(u.searchParams.get("limit")||"20"),100),status=u.searchParams.get("status");let sql="SELECT id,message_id,sender,recipient,subject,classification,status,received_at,processing_ms FROM emails",vals=[];if(status){sql+=" WHERE status=?1";vals.push(status)}sql+=" ORDER BY id DESC LIMIT ?"+(vals.length+1);vals.push(limit);const r=await e.AUDIT_DB.prepare(sql).bind(...vals).all();return J({count:(r.results||[]).length,emails:r.results||[]})}if(p==="/emails/body"){const id=parseInt(u.searchParams.get("id")||"0"),r=await e.AUDIT_DB.prepare("SELECT * FROM emails WHERE id=?1").bind(id).first();return r?J(r):J({error:"not found"},404)}if(p==="/emails/search"){const q="%"+(u.searchParams.get("q")||"")+"%",limit=Math.min(parseInt(u.searchParams.get("limit")||"20"),100),r=await e.AUDIT_DB.prepare("SELECT id,message_id,sender,recipient,subject,classification,status,received_at FROM emails WHERE subject LIKE ?1 OR sender LIKE ?1 OR body_text LIKE ?1 ORDER BY id DESC LIMIT ?2").bind(q,limit).all();return J({count:(r.results||[]).length,emails:r.results||[]})}if(p==="/emails/status"&&(req.method==="PATCH"||req.method==="POST")){const b=await req.json().catch(()=>({}));const sid=parseInt(b.id||0),sstat=String(b.status||""),ALLOWED=["received","processed","sent","replied","archived","spam","read","rejected"];if(!sid||!ALLOWED.includes(sstat))return J({ok:false,error:"id and a valid status are required",allowed:ALLOWED},400);await e.AUDIT_DB.prepare("UPDATE emails SET status=?1 WHERE id=?2").bind(sstat,sid).run();return J({ok:true,id:sid,status:sstat})}if(p==="/command"&&req.method==="POST"){try{const b=await req.json().catch(()=>({}));const sender=b.sender||b.from||"",dry=u.searchParams.get("dry")==="1"||b.dry===true,bodyText=b.body||b.command||"",subj=b.subject||"(http command)",row=await lookupSender(e.AUDIT_DB,normalizeAddress(sender));if(!row)return J({ok:false,error:"sender not in command allowlist"},403);const kind=row.kind,pc=parseCommand(bodyText,subj);let result;try{result=await routeCommand(e,pc.verb,pc.commandText,kind)}catch(err){result={ok:false,error:pubErr(err)}}const replyText=formatResult(pc.verb,pc.commandText,result,kind);let sent=false;if(!dry&&e.SEND_EMAIL&&sender){try{await e.SEND_EMAIL.send({to:sender,from:"qnfo@qnfo.org",subject:"Re: "+subj,text:replyText});sent=true}catch(err){result.reply_error=pubErr(err)}}return J({ok:result.ok!==false,verb:pc.verb,kind:kind,dry:dry,reply_sent:sent,result:result,reply:replyText})}catch(err){return J({error:pubErr(err)},500)}}if(p==="/commands"&&req.method==="GET"){try{const r=await e.AUDIT_DB.prepare("SELECT * FROM email_commands ORDER BY id DESC LIMIT 50").all();return J({count:(r.results||[]).length,commands:r.results||[]})}catch(err){return J({error:pubErr(err)},500)}}if(p==="/command-senders"&&req.method==="GET"){try{const r=await e.AUDIT_DB.prepare("SELECT * FROM email_command_senders ORDER BY id").all();return J({senders:r.results||[]})}catch(err){return J({error:pubErr(err)},500)}}if(p==="/send"&&req.method==="POST")return await sendApi(req,e,J);if(p==="/queue"&&req.method==="GET"){try{const r=await e.AUDIT_DB.prepare("SELECT decision,COUNT(*) c FROM email_reply_queue GROUP BY decision").all();return J({counts:r.results||[]})}catch(err){return J({error:pubErr(err)},500)}}if(req.method==="GET")return J({ok:true,worker:"qnfo-email",version:VERSION,routes:["/health","/stats","/emails/recent","/emails/body","/emails/search","/emails/status","/commands","/command-senders","/send","/command"]});return J({ok:false,error:"not found",path:p,method:req.method,version:VERSION},404)}catch(err){return J({error:pubErr(err)},500)}}};
function trunc(s,n){return String(s||"").slice(0,n)}function classifyAddress(to){to=String(to||"").toLowerCase();return to.includes("rowan")||to.includes("rwn")?"personal":"general"}
// EMAIL-CLASSIFICATION-PERSONAL-CATCHALL-1 (#1474, 2026-10-01): the owner alias alone used to make every
// message "personal", so the class was dominated by conference spam and vendor promos and could not route
// anything. "personal" now also requires a verified correspondent (someone the fleet has emailed, per
// contact_ledger, or an exact owner command sender). Other alias mail is "personal-unverified"; consumers that
// want everything sent to the alias (errata-hub) read both classes.
async function classifyInbound(db,from,to){const c=classifyAddress(to);if(c!=="personal")return c;const s=String(from||"").toLowerCase().trim();if(!s||isMachineSender(s))return"personal-unverified";try{const r=await db.prepare("SELECT 1 AS v FROM contact_ledger WHERE lower(email)=?1 AND COALESCE(suppress,0)=0 UNION ALL SELECT 1 FROM email_command_senders WHERE lower(pattern)=?1 AND COALESCE(enabled,1)=1 LIMIT 1").bind(s).first();return r?"personal":"personal-unverified"}catch(_){return"personal"}}
async function storeEmail(db,d){const r=await db.prepare("INSERT INTO emails (message_id,sender,recipient,subject,body_text,body_html,headers_json,classification,received_at,status,in_reply_to,references_hdr) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'received',?10,?11) ON CONFLICT(message_id) DO UPDATE SET recipient=?3,subject=?4,body_text=?5,body_html=?6,headers_json=?7,classification=?8,in_reply_to=?10,references_hdr=?11 RETURNING id").bind(d.messageId,d.from,d.to,d.subject,d.bodyText,d.bodyHtml,d.headersJson,d.classification,d.receivedAt,d.inReplyTo,d.refsHdr).first();return r&&r.id||0}/* EMAIL-ID-RETURNING-1 (2026-10-01): meta.last_row_id is unchanged by the ON CONFLICT UPDATE path, so a redelivered message got another table's rowid (email_raw_archive held email_id 56516 while emails.id max was 893) and the raw archive then hit UNIQUE(email_id). RETURNING id gives the row actually inserted or updated. */
async function applyFilters(db,from,to,subject,body){try{const r=await db.prepare("SELECT * FROM email_filters WHERE enabled=1 ORDER BY priority DESC LIMIT 100").all();for(const f of r.results||[]){const fl=String(f.field||"").toLowerCase();/* FILTER-UNKNOWN-FIELD-FAILCLOSED-1 (#1478): an unrecognised field used to fall back to the SUBJECT silently, so a typo'd filter matched the wrong header. Unknown fields now never match and are logged. Live filters use only from/sender/subject (measured 2026-09-30), so no live behaviour changes. */const hay=fl==="sender"||fl==="from"?from:fl==="recipient"||fl==="to"?to:fl==="body"||fl==="body_text"?body:fl==="subject"||fl===""?subject:null;if(hay===null){console.warn("email_filters: unknown field '"+fl+"' on filter "+(f.id||"?")+" - skipped (FILTER-UNKNOWN-FIELD-FAILCLOSED-1)");continue}const pat=String(f.pattern||"").toLowerCase().replace(/^\*+|\*+$/g,"");if(pat&&String(hay||"").toLowerCase().includes(pat))return{action:f.action||"process",reason:f.reason||"filter"}}}catch(e){}return{action:"process"}}
async function logAction(db,id,status,cls,start){try{await db.prepare("UPDATE emails SET status=?1, processing_ms=?2 WHERE id=?3").bind(status,Date.now()-start,id).run()}catch(e){}}
async function archiveRaw(e,x){try{const raw=trunc(x.rawText,200000);await e.AUDIT_DB.prepare("INSERT INTO email_raw_archive (email_id,message_id,raw_text,raw_size,created_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(email_id) DO NOTHING").bind(x.emailId,x.messageId,raw,Number(x.rawSize||raw.length||0),x.receivedAt).run()}catch(err){console.error("raw archive",err.message||err)}}
function machine(sender,subject){const s=(sender||"").toLowerCase(),sub=(subject||"").toLowerCase();return !s||s.includes("mailer-daemon")||s.includes("noreply")||s.includes("no-reply")||s.includes("postmaster")||(s.includes("google.com")&&sub.includes("report domain:"))}function strategic(sender,subject){return /green-coding|arne|jpc|jpcub|joules|benchmark|license|licensing|qnfo-ula|commercial|prototype|small-batch|energy per compute/i.test((sender||"")+" "+(subject||""))}
async function recordParseFailure(e,x){try{const empty=!String(x.bodyText||"").trim()&&!String(x.bodyHtml||"").trim(),mime=Number(x.rawSize||0)>512||/multipart|quoted-printable|base64|content-type:/i.test((x.headersJson||"")+" "+(x.rawText||"").slice(0,2000));if(!empty||!mime||machine(x.from,x.subject))return;const sev=strategic(x.from,x.subject)?"critical":"high",hint=trunc((x.headersJson||"")+"\nrawSize="+(x.rawSize||0),1000),notes="Parsed empty inbound body despite MIME/body evidence; raw archived for recovery";await e.AUDIT_DB.prepare("INSERT OR IGNORE INTO email_parse_failures (email_id,message_id,sender,subject,received_at,content_hint,status,severity,created_at,notes) VALUES (?1,?2,?3,?4,?5,?6,'open',?7,?8,?9)").bind(x.emailId,x.messageId,x.from,x.subject,x.receivedAt,hint,sev,x.receivedAt,notes).run();if(sev==="critical")await e.AUDIT_DB.prepare("INSERT INTO handoffs (session_id,project_id,summary,pending_work,next_action,timestamp,claim_sheet) VALUES (?1,'qnfo-email',?2,?3,?4,?5,json_object('claim',?2,'evidence','qnfo-email handoff '||?1,'confidence','asserted','status','unverified'))").bind("email-parse-failure-"+x.emailId,"Critical email parsed empty: "+x.from+" / "+x.subject,notes,"Recover from email_raw_archive and hand off before replying",x.receivedAt).run().catch(()=>{})}catch(err){console.error("parse failure",err.message||err)}}
async function enqueueHandoff(e,x){try{if(isOwnerSender(x.from))return;if(strategic(x.from,x.subject))await e.AUDIT_DB.prepare("INSERT INTO handoffs (session_id,project_id,summary,pending_work,next_action,timestamp,claim_sheet) VALUES (?1,'qnfo-email',?2,?3,?4,?5,json_object('claim',?2,'evidence','qnfo-email handoff '||?1,'confidence','asserted','status','unverified'))").bind("email-strategic-"+x.emailId,"Strategic email requires handoff: "+x.from+" / "+x.subject,"Review after 1-2 automated replies; licensing/commercial nuance must not auto-send.","Route to Rowan/Outlook handoff or draft-only queue.",x.receivedAt).run().catch(()=>{})}catch(err){}}
async function stats(e){const a=await Promise.all([e.AUDIT_DB.prepare("SELECT COUNT(*) count FROM emails").first(),e.AUDIT_DB.prepare("SELECT COUNT(*) count FROM emails WHERE julianday(received_at)>julianday('now','-24 hours')").first(),e.AUDIT_DB.prepare("SELECT status,COUNT(*) count FROM emails GROUP BY status").all()]);return{total:a[0]?.count||0,last24h:a[1]?.count||0,byStatus:a[2].results||[]}}
async function sendApi(req,e,J){if(!e.SEND_EMAIL)return J({error:"send_email binding not available"},503);const b=await req.json();if(!b.to)return J({error:"to is required"},400);const to=String(b.to).toLowerCase();const OWNER_NOTIFY=["rwnquni@outlook.com","rowan.quni@outlook.com","rwnqni@outlook.com","rowan.quni@qnfo.org"];const isHandoff=b.handoff===true||b.notify===true||b.classification==="handoff";if(!(isHandoff&&OWNER_NOTIFY.indexOf(to)>=0)){try{if(await e.AUDIT_DB.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?1").bind(to).first())return J({error:"recipient is suppressed",to:b.to,suppressed:true},409)}catch(err){}}const text=b.body||String(b.html||"").replace(/<[^>]*>/g,"");if(/\b(stupid|idiot|delusional|useless)\b/i.test(text))return J({error:"tone gate",blocked:true},422);const from=(b.from&&/@(qnfo\.org|qwav\.org|qwav\.tech|qwav\.net|qwav\.uk|q08\.org|qnfo\.net|qnfo\.uk)$/i.test(b.from))?b.from:"qnfo@qnfo.org";await e.SEND_EMAIL.send({to:b.to,from,subject:b.subject||"(no subject)",text,html:b.html||"<p>"+text.replace(/\n/g,"<br>")+"</p>"});const id=crypto.randomUUID(),now=new Date().toISOString();await e.AUDIT_DB.prepare("INSERT INTO emails (message_id,sender,recipient,subject,body_text,body_html,headers_json,classification,received_at,status) VALUES (?1,?2,?3,?4,?5,?6,'{}','general',?7,'sent')").bind(id,from,b.to,b.subject||"(no subject)",trunc(text,BODY_MAX_TEXT),trunc(b.html||"",BODY_MAX_HTML),now).run();if(b.reply_to_id)await e.AUDIT_DB.prepare("UPDATE emails SET status='replied' WHERE id=?1").bind(b.reply_to_id).run();return J({success:true,message_id:id,to:b.to,subject:b.subject||"(no subject)",sent_at:now})}
function unfold(h){return String(h||"").replace(/\r?\n[ \t]+/g," ")}function hdr(head,name){const w=String(name).toLowerCase();for(const l of unfold(head).split(/\r?\n/)){const i=l.indexOf(":");if(i>=0&&l.slice(0,i).trim().toLowerCase()===w)return l.slice(i+1).trim()}return""}function splitHB(s){const m=String(s).match(/\r?\n\r?\n/);if(!m)return{head:String(s),body:""};return{head:String(s).slice(0,m.index),body:String(s).slice(m.index+m[0].length)}}function decQP(s){return String(s||"").replace(/=\r?\n/g,"").replace(/=([0-9A-Fa-f]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)))}function dec(s,cte){cte=String(cte||"").toLowerCase();try{if(cte.includes("quoted-printable"))return decQP(s);if(cte.includes("base64"))return atob(String(s).replace(/\s+/g,""))}catch(e){}return String(s||"")}function walk(raw,acc={text:"",html:""}){const hb=splitHB(raw),rawCt=hdr(hb.head,"content-type"),ct=rawCt.toLowerCase(),cte=hdr(hb.head,"content-transfer-encoding");if(ct.startsWith("multipart/")){const m=rawCt.match(/boundary\s*=\s*"?([^";\r\n]+)"?/i);if(m){const b=m[1].trim();for(const part of hb.body.split("--"+b).slice(1)){if(part.startsWith("--"))break;walk(part.replace(/^\r?\n/,""),acc)}}return acc}if(ct.includes("text/plain")&&!acc.text)acc.text=dec(hb.body,cte).trim();else if(ct.includes("text/html")&&!acc.html)acc.html=dec(hb.body,cte).trim();else if(!ct&&hb.body&&!acc.text)acc.text=dec(hb.body,cte).trim();return acc}async function parseBody(raw){let rawText="";try{rawText=await new Response(raw).text();const a=walk(rawText);let text=a.text||"",html=a.html||"";if(!text&&!html){const hb=splitHB(rawText);text=dec(hb.body,hdr(hb.head,"content-transfer-encoding")).trim()}return{bodyText:text,bodyHtml:html,rawText}}catch(err){return{bodyText:"",bodyHtml:"",rawText,error:err.message||String(err)}}}
function normalizeSubject(s){return String(s||"").replace(/^(\s*(re|fwd?|aw|sv|vs|antw)\s*:\s*)+/i,"").replace(/\s+/g," ").trim().toLowerCase()}
function heuristicSpam(from,subject){try{const f=String(from||"").toLowerCase(),s=String(subject||"").toLowerCase();const dom=(f.split("@")[1]||"").trim();if(!dom)return false;if(/\.(edu|gov)(\.[a-z]{2,})?$|\.ac\.[a-z]{2,}$|\.edu\./.test(dom))return false;return /(article|manuscript|preprint|papers?)\s+(submission|publication)|(submit|publish|consider)\s+(your\s+)?(article|manuscript|preprint|paper)|waiting for your (article|manuscript|paper|submission)|final reminder[^\n]{0,30}(article|manuscript|paper)|invitation to (publish|submit)|call for (papers|submissions?)/.test(s)}catch(e){return false}}
async function resolveParseFailures(db,from,subject){try{const r=await db.prepare("SELECT email_id,sender,subject FROM email_parse_failures WHERE status IN ('open','handoff') AND lower(sender)=lower(?1)").bind(from).all();for(const row of r.results||[]){if(normalizeSubject(row.subject)===normalizeSubject(subject)){await db.prepare("UPDATE email_parse_failures SET status='resolved', resolved_at=datetime('now'), notes=COALESCE(notes,'')||' | auto-resolved: matching resend received' WHERE email_id=?1").bind(row.email_id).run()}}}catch(e){}}

const HELP = [
"QNFO email command control v" + VERSION,
"Email qnfo@qnfo.org (or reply to any QNFO email) with a command.",
"",
"READ (any time):",
"  help            this text",
"  status / health fleet + worker health",
"  fleet / workers worker census + drift",
"  registry        service registry",
"  manifest        ops-exec capability manifest",
"  cost            AI spend (today + 30d)",
"  analytics       Cloudflare analytics (30d)",
"  email / inbox   inbound email stats + recent",
"  read <id>       full body of inbound email <id>",
"  job <id>        poll an async ops-exec job",
"",
"ACTIONS (owner sender only): anything else goes to the ops-exec agent as a",
"natural-language task (e.g. 'pause outreach', 'rollback qnfo-email', 'list",
"drift'). You get back 'queued <job-id>'; reply 'job <job-id>' to poll it.",
"",
"AUTH: sender must be in email_command_senders. owner = full; agent = read-only.",
"Self-ingestion is quarantined (issue 951). COMMAND_TOKEN (if set) gates actions."
].join("\n");
const OPS_BASE = "https://ops.qnfo.org";
// OWNER-CMD-OPS-522-1 (2026-09-30, agent_issues #1472): every owner email command failed with "ops job queue
// unavailable (HTTP 522)" -- 7/7 rows, zero successes ever. This worker's email handler runs in the qnfo.org zone,
// and ops.qnfo.org is a custom domain for another Worker on that SAME zone: without global_fetch_strictly_public
// such a subrequest does not reach the Worker and dies as 522 (the same defect measured on ops -> ideas.qnfo.org,
// 522 from inside, 200 from outside). The flag is now declared in wrangler.toml, and every ops call falls back to
// ops' workers.dev hostname -- a different zone -- on a network error, 52x or a 1042 answer.
const OPS_BASES = [OPS_BASE, "https://qnfo-ops.q08.workers.dev"];
async function opsFetch(path, init) {
  let last = null;
  for (const base of OPS_BASES) {
    try {
      const res = await fetch(base + path, init);
      if (res.status >= 520 && res.status <= 530) { last = res; continue; }
      if (res.status === 404) {
        const peek = await res.clone().text().catch(function () { return ""; });
        if (/error code:?\s*1042/i.test(peek)) { last = res; continue; }
      }
      return res;
    } catch (e) { last = e; }
  }
  if (last instanceof Response) return last;
  throw last || new Error("ops unreachable on every base");
}
async function sha16(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
}

function truncate(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? text.substring(0, maxLength) + "\u2026" : text;
}

function decodeSubject(s) {
  s = String(s || "");
  return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, function(m, cs, enc, data) {
    try {
      if (enc.toLowerCase() === "b") {
        const bin = atob(data);
        const bytes = Uint8Array.from(bin, function(c){ return c.charCodeAt(0); });
        return new TextDecoder(cs === "" ? "utf-8" : cs).decode(bytes);
      } else { return data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, function(_, h){ return String.fromCharCode(parseInt(h, 16)); }); }
    } catch (e) { return m; }
  }).replace(/\s+/g, " ").trim();
}

function normalizeAddress(a) {
  let s = String(a || "").trim();
  const lt = s.indexOf("<");
  if (lt >= 0) { const gt = s.indexOf(">", lt); if (gt > lt) s = s.slice(lt + 1, gt); }
  s = s.replace(/^prvs=[^=]+=/, "").replace(/^SRS0=[^=]+=[^=]+=/, "");
  return s.toLowerCase().trim();
}

async function lookupSender(db, sender) {
  try {
    const rows = await db.prepare("SELECT pattern, kind, enabled FROM email_command_senders").all();
    for (const r of rows.results || []) {
      if (!r.enabled) continue;
      const p = normalizeAddress(r.pattern);
      if (!p) continue;
      if (p === sender) return { kind: r.kind };
      if (p.charAt(0) === "@" && sender.endsWith(p)) return { kind: r.kind };
    }
  } catch (e) { console.error("lookupSender:", e.message); }
  return null;
}

function parseCommand(bodyText, subject) {
  let t = String(bodyText == null ? "" : bodyText).replace(/\r/g, "");
  const keep = [];
  let started = false;
  for (const rawLine of t.split("\n")) {
    const s = rawLine.trim();
    if (!s) { if (started) break; continue; }
    if (/^>/.test(s)) { if (started) break; continue; }
    if (/^_{6,}$/.test(s)) break;
    if (/^-{2,}\s*$/.test(s)) break;
    if (/^-{2,}\s*(original message|forwarded message|forwarded)/i.test(s)) break;
    if (/^on .{6,}wrote:?$/i.test(s)) break;
    if (/^(from|sent|to|cc|bcc|date|subject|reply-to)\s*:/i.test(s)) break;
    if (/^<[^>]+>$/.test(s)) continue;
    started = true;
    keep.push(s);
  }
  t = keep.join("\n").trim();
  if (!t) t = String(subject || "").replace(/^((re|fwd|fw)\s*:\s*)+/i, "").trim();
  const m = t.match(/^([A-Za-z][A-Za-z0-9_-]*)(?:\s+([\s\S]*))?$/);
  if (!m) return { verb: t.toLowerCase().slice(0, 60), commandText: "" };
  return { verb: m[1].toLowerCase(), commandText: (m[2] || "").trim() };
}

function isSelfIngest(c, sender) {
  const internal = /@(qnfo\.org|q08\.org|qwav\.(org|tech|net|uk)|q-wave\.tech|qwave\.tech)$/i;
  return internal.test(String(c.to || "")) && internal.test(sender);
}

async function setCmdStatus(db, id, status, result) {
  if (!id) return;
  try { await db.prepare("UPDATE email_commands SET status=?1, result=?2, updated_at=datetime('now') WHERE id=?3").bind(status, result || null, id).run(); }
  catch (e) { console.error("setCmdStatus:", e.message); }
}

/* OWNER-CMD-DMARC-GATE-1 (2026-09-30, agent_issues #1275 OWNER-CMD-FROM-UNAUTHENTICATED-1): owner verbs were
   authorised on a From-address match alone, so any message spoofing an allow-listed From could drive the ops agent.
   Cloudflare Email Routing prepends "Authentication-Results: mx.cloudflare.net; ... dmarc=<v> header.from=<d>".
   An owner sender now needs dmarc=pass aligned to its OWN From domain, read ONLY from that first,
   Cloudflare-stamped segment (a forged Authentication-Results later in the message cannot satisfy it). Failing
   senders are downgraded to read-only ("agent"), never rejected silently: the reply states why. Escape hatch for the
   owner: set OWNER_AUTH_MODE=off. HTTP /command is unaffected (it is already API-key authenticated). */
function ownerAuthenticated(env, c, sender) {
  if (String(env.OWNER_AUTH_MODE || "dmarc").toLowerCase() === "off") return { ok: true, why: "OWNER_AUTH_MODE=off" };
  const raw = String(c.authResults || "");
  if (!raw) return { ok: false, why: "no Authentication-Results header" };
  const first = raw.split(/,\s*(?=[a-z0-9.-]+\s*;)/i)[0];
  if (!/^\s*mx\.cloudflare\.net\s*;/i.test(first)) return { ok: false, why: "first Authentication-Results is not from mx.cloudflare.net" };
  const m = /\bdmarc=(\w+)\s+header\.from=([^\s;]+)/i.exec(first);
  if (!m) return { ok: false, why: "no DMARC verdict" };
  const dom = (String(sender).split("@")[1] || "").toLowerCase();
  if (m[1].toLowerCase() !== "pass") return { ok: false, why: "dmarc=" + m[1].toLowerCase() };
  if (m[2].toLowerCase() !== dom) return { ok: false, why: "DMARC header.from " + m[2].toLowerCase() + " does not match sender domain " + dom };
  return { ok: true, why: "dmarc=pass header.from=" + dom };
}

async function processCommand(env, c) {
  const db = env.AUDIT_DB;
  const sender = normalizeAddress(c.from);
  const row = await lookupSender(db, sender);
  if (!row) return null;
  let kind = row.kind || "owner";
  let ownerAuth = null;
  if (kind === "owner") {
    ownerAuth = ownerAuthenticated(env, c, sender);
    if (!ownerAuth.ok) kind = "agent";
  }
  const pc = parseCommand(c.bodyText, c.subject);
  let cmdId = 0;
  try {
    const ins = await db.prepare("INSERT INTO email_commands (email_id, message_id, in_reply_to, sender, recipient, subject, verb, command_text, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'pending')").bind(c.emailId, c.messageId, c.inReplyTo || null, sender, c.to, c.subject, pc.verb, pc.commandText).run();
    cmdId = ins.meta ? ins.meta.last_row_id || 0 : 0;
  } catch (e) { console.error("cmd-log:", e.message); }

  if (kind === "agent" && isSelfIngest(c, sender)) {
    try {
      await db.prepare("INSERT INTO email_loop_quarantine (orig_id, message_id, sender, recipient, subject, body_text, classification, status, received_at, reason) VALUES (?1,?2,?3,?4,?5,?6,'general','received',?7,'self-ingestion loop (issue 951)')").bind(c.emailId, c.messageId, sender, c.to, c.subject, truncate(c.bodyText, 2000), new Date().toISOString()).run();
    } catch (e) { console.error("quarantine:", e.message); }
    await setCmdStatus(db, cmdId, "quarantined", "self-ingestion loop");
    return { quarantined: true };
  }

  let result;
  try { result = await routeCommand(env, pc.verb, pc.commandText, kind); }
  catch (e) { result = { ok: false, error: String(e && e.message || e) }; }
  if (ownerAuth && !ownerAuth.ok) {
    result.owner_auth = "downgraded to read-only: " + ownerAuth.why + " (OWNER-CMD-DMARC-GATE-1)";
    if (result.ok === false && result.error) result.error += " [owner sender not authenticated: " + ownerAuth.why + "]";
  }

  await setCmdStatus(db, cmdId, result.ok === false ? "error" : "done", truncate(JSON.stringify(result), 4000));

  if (env.SEND_EMAIL && !c.dry) {
    const replyText = formatResult(pc.verb, pc.commandText, result, kind);
    try { await env.SEND_EMAIL.send({ to: c.from, from: "qnfo@qnfo.org", subject: "Re: " + c.subject, text: replyText }); }
    catch (e) { console.error("reply:", e.message); }
  }
  return result;
}

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    const txt = await res.text();
    if (!res.ok) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
  } catch (e) { return null; }
}

async function cmdOps(env, path) {
  const j = await getJson(OPS_BASE + path);
  if (j === null) return { ok: false, error: "ops endpoint " + path + " unreachable" };
  return { ok: true, text: truncate(JSON.stringify(j, null, 2), 3000) };
}

async function cmdHealth(env) {
  const ops = await getJson(OPS_BASE + "/health");
  const L = ["QNFO fleet health", ""];
  if (ops && ops.version) L.push("ops-exec: " + ops.version + " (" + (ops.worker || "qnfo-ops") + ")");
  const fl = await getJson(OPS_BASE + "/fleet");
  if (fl) {
    const arr = Array.isArray(fl.fleet) ? fl.fleet : (Array.isArray(fl.workers) ? fl.workers : (Array.isArray(fl.names) ? fl.names : null));
    if (arr) L.push("workers: " + arr.length);
    else if (fl.count !== undefined) L.push("workers: " + fl.count);
    if (fl.drift !== undefined) L.push("drift: " + JSON.stringify(fl.drift));
  }
  L.push("email-worker: qnfo-email v" + VERSION);
  return { ok: true, text: L.join("\n") };
}

async function cmdFleet(env) {
  const j = await getJson(OPS_BASE + "/fleet");
  if (j === null) return { ok: false, error: "/fleet unreachable" };
  const arr = Array.isArray(j.fleet) ? j.fleet : (Array.isArray(j.workers) ? j.workers : (Array.isArray(j.names) ? j.names : []));
  const L = ["QNFO fleet (" + arr.length + " workers)"];
  const list = arr.map(function(n){ return typeof n === "string" ? n : (n.name || n.id || JSON.stringify(n).slice(0, 40)); });
  if (list.length) L.push(list.slice(0, 60).join("\n"));
  if (j.drift !== undefined) L.push("drift: " + JSON.stringify(j.drift));
  return { ok: true, text: L.join("\n").slice(0, 3000) };
}

async function cmdInbox(env) {
  const db = env.AUDIT_DB;
  const total = await db.prepare("SELECT COUNT(*) c FROM emails").first();
  const recent = await db.prepare("SELECT id, sender, recipient, subject, classification, status, received_at FROM emails WHERE status != 'sent' ORDER BY id DESC LIMIT 15").all();
  const L = ["QNFO inbox (" + (total && total.c || 0) + " total)", ""];
  for (const r of recent.results || []) L.push("[" + r.id + "] " + decodeSubject(r.subject).slice(0, 70) + " <- " + r.sender);
  L.push("", "reply 'read <id>' for a body");
  return { ok: true, text: L.join("\n") };
}

async function cmdRead(env, commandText) {
  const id = parseInt(String(commandText || "").trim(), 10);
  if (!id) return { ok: false, error: "usage: read <email-id>" };
  const row = await env.AUDIT_DB.prepare("SELECT id, sender, recipient, subject, body_text, received_at FROM emails WHERE id=?1").bind(id).first();
  if (!row) return { ok: false, error: "email " + id + " not found" };
  let body = String(row.body_text || "");
  if (/^-{2,}[A-Za-z0-9_=+.\/-]{8,}/m.test(body) || /content-type\s*:\s*multipart/i.test(body)) {
    try {
      const acc = _walkMime(body, { text: "", html: "" });
      if (acc.text) body = acc.text;
      else if (acc.html) body = _htmlToText(acc.html);
    } catch (e) { }
  }
  const L = ["[" + row.id + "] " + decodeSubject(row.subject), "from: " + row.sender, "to: " + row.recipient, "at: " + row.received_at, "", truncate(body, 4000)];
  return { ok: true, text: L.join("\n") };
}

async function cmdJob(env, commandText) {
  const id = String(commandText || "").trim();
  if (!id) return { ok: false, error: "usage: job <id>" };
  const key = env.OPS_KEY || "";
  const h = key ? { "Authorization": "Bearer " + key } : {};
  try {
    const res = await opsFetch("/v1/jobs/" + encodeURIComponent(id), { headers: h });
    const txt = await res.text();
    if (res.status === 404) return { ok: false, error: "job " + id + " not found" };
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (!j) return { ok: false, error: "ops returned non-JSON (HTTP " + res.status + "): " + txt.slice(0, 180) };
    return { ok: true, text: truncate(JSON.stringify(j, null, 2), 3000) };
  } catch (e) {
    return { ok: false, error: "ops unreachable: " + String(e && e.message || e).slice(0, 160) };
  }
}

async function cmdAgent(env, verb, commandText, kind) {
  if (kind !== "owner") return { ok: false, error: "action commands require owner sender; agent sender is read-only" };
  const text = String(commandText ? (verb ? verb + " " + commandText : commandText) : (verb || "")).trim();
  if (env.COMMAND_TOKEN) {
    const tok = String(env.COMMAND_TOKEN || "");
    if (text.indexOf(tok) < 0) return { ok: false, error: "COMMAND_TOKEN required for action commands (append the token to your message)" };
  }
  const key = env.OPS_KEY || "";
  if (!key) return { ok: false, error: "OPS_KEY not configured on qnfo-email; agent passthrough disabled" };
  let j = null, lastErr = "";
  for (let attempt = 0; attempt < 3 && !j; attempt++) {
    try {
      const res = await opsFetch("/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: "ops-exec", messages: [{ role: "user", content: text }] })
      });
      const txt = await res.text();
      if (res.status === 202) { try { j = JSON.parse(txt); } catch (e) { j = null; } }
      if (!j) lastErr = "HTTP " + res.status + " " + txt.slice(0, 120);
    } catch (e) { lastErr = String(e && e.message || e).slice(0, 120); }
    if (!j && attempt < 2) await new Promise(function(r){ setTimeout(r, 1000 * (attempt + 1)); });
  }
  if (!j || !j.id) return { ok: false, error: "ops job queue unavailable (" + lastErr + ")" };
  const polls = Math.max(0, parseInt(env.AGENT_POLLS || "6", 10) || 0);
  for (let i = 0; i < polls; i++) {
    await new Promise(function(r){ setTimeout(r, 2000); });
    try {
      const pr = await opsFetch("/v1/jobs/" + encodeURIComponent(j.id), { headers: { "Authorization": "Bearer " + key } });
      const ptxt = await pr.text();
      let pj = null;
      try { pj = JSON.parse(ptxt); } catch (e) { pj = null; }
      if (!pj) continue;
      const st = pj.status || (pj.job && pj.job.status);
      if (st && st !== "queued" && st !== "running") {
        const out = pj.response || (pj.job && pj.job.response) || pj.error || (pj.job && pj.job.error) || "";
        return { ok: st === "succeeded", job_id: j.id, status: st, text: "job " + j.id + " " + st + (out ? ":\n" + truncate(String(out), 3500) : "") };
      }
    } catch (e) { }
  }
  return { ok: true, queued: true, job_id: j.id, note: "ops-exec agent job queued; reply 'job " + j.id + "' to poll" };
}

async function routeCommand(env, verb, commandText, kind) {
  const v = (verb || "").toLowerCase();
  switch (v) {
    case "help": return { ok: true, text: HELP };
    case "status": case "health": return await cmdHealth(env);
    case "fleet": case "workers": return await cmdFleet(env);
    case "registry": return await cmdOps(env, "/registry");
    case "manifest": return await cmdOps(env, "/manifest");
    case "cost": return await cmdOps(env, "/cost");
    case "analytics": return await cmdOps(env, "/analytics");
    case "email": case "emails": case "inbox": return await cmdInbox(env);
    case "read": return await cmdRead(env, commandText);
    case "job": return await cmdJob(env, commandText);
    default: return await cmdAgent(env, verb, commandText, kind);
  }
}

function formatResult(verb, commandText, result, kind) {
  const L = [];
  L.push("QNFO command: " + (verb || "(action)") + (commandText ? " " + commandText : ""));
  L.push("");
  if (result.queued) {
    L.push("Queued as ops-exec job " + result.job_id);
    L.push("Reply 'job " + result.job_id + "' to poll for the result.");
  } else if (result.text) {
    L.push(result.text);
  } else if (result.error) {
    L.push("ERROR: " + result.error);
  } else {
    L.push(truncate(JSON.stringify(result, null, 2), 2500));
  }
  L.push("");
  L.push("-- QNFO email control v" + VERSION + " (reply 'help' for commands)");
  return L.join("\n");
}

function _walkMime(raw, acc) { return walk(raw, acc); }
function _htmlToText(h) { return String(h || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }

function isMachineSender(from){const s=String(from||"").toLowerCase();return !s||s.includes("mailer-daemon")||s.includes("noreply")||s.includes("no-reply")||s.includes("postmaster")||s.includes("bounce")||s.includes("dmarcreport")||s.startsWith("srs0=")}
function isInternalLoop(from,to){const int=/@(qnfo\.org|q08\.org|qwav\.(org|tech|net|uk)|q-wave\.tech|qwave\.tech)$/i;return int.test(String(to||""))&&int.test(String(from||""))}
function buildResendDraft(){return "Hello,\n\nYour message arrived but its body text did not survive on my side (an intake problem), so I did not want to reply to something I cannot read.\n\nCould you resend the substance of your note? Replying to this email is enough - the thread is preserved.\n\nThank you,\nRowan Brad Quni-Gudzinas\nQNFO"}
async function notifyOwner(env,subject,text){try{if(!env.SEND_EMAIL)return;await env.SEND_EMAIL.send({to:"rwnquni@outlook.com",from:"qnfo@qnfo.org",subject:String(subject||"QNFO handoff"),text:String(text||"")})}catch(e){}}/* HANDOFF-ALLOWLIST-1 (#1049): handoff/owner notices reach the owner past the digest opt-out; general digests/outreach remain suppressed. */
/* OWNER-SENDER-NO-REPLY-1 (2026-10-03, owner directive "don't spam me about my own replies!"): a message FROM one of
   the owner's own addresses, or a reply to a fleet handoff notice, is the owner's own voice - never "a nuanced human
   email held for your reply". Before this guard the owner's reply to a handoff notice was itself queued for an authored
   reply (email 916 -> email_reply_queue 53) and notifyOwner mailed a NEW handoff notice back to the owner about that
   very reply, which the owner answered again (email 917 -> queue 54): an unbounded owner<->fleet notice loop,
   measured 2026-10-03. Owner mail is still ingested, still classified and still runs processCommand (the owner email
   command surface); this only stops creating a reply-queue row, a strategic handoff row and an owner notice. */
var OWNER_SENDERS=["rwnquni@outlook.com","rowan.quni@outlook.com","rwnqni@outlook.com","rowan.quni@qnfo.org","rwnquni@qnfo.org"];
function isOwnerSender(from){var s=String(from||"").toLowerCase();var m=s.match(/<([^>]+)>/);if(m)s=m[1];return OWNER_SENDERS.indexOf(s.trim())>=0}
function isHandoffNoticeReply(subject){var s=String(subject||"");return /^\s*(re|aw|sv|antw|fwd?)\s*:/i.test(s)&&/\[handoff\]/i.test(s)}
async function enqueueHumanReply(env,d){try{if(isMachineSender(d.from))return null;if(isInternalLoop(d.from,d.to))return null;if(isOwnerSender(d.from))return null;if(isHandoffNoticeReply(d.subject))return null;const ex=await env.AUDIT_DB.prepare("SELECT id FROM email_reply_queue WHERE email_id=?1").bind(d.emailId).first();if(ex)return ex.id;const bodyLost=!String(d.bodyText||"").trim()&&!String(d.bodyHtml||"").trim();const draft=bodyLost?buildResendDraft():null;const ins=await env.AUDIT_DB.prepare("INSERT INTO email_reply_queue (email_id,sender,person_key,subject,received_at,human_score,decision,skip_reason,draft_text,drafted_at) VALUES (?1,?2,NULL,?3,?4,2,'escalate',?5,?6,?7)").bind(d.emailId,d.from,d.subject,d.receivedAt,bodyLost?"auto-draft: body lost in transit (resend request)":"awaiting authored draft",draft,draft?new Date().toISOString():null).run();const qid=(ins.meta&&ins.meta.last_row_id)||0;if(!draft){try{await env.AUDIT_DB.prepare("INSERT INTO handoffs (session_id,project_id,summary,pending_work,next_action,timestamp,claim_sheet) VALUES (?1,'qnfo-email',?2,?3,?4,datetime('now'),json_object('claim',?2,'evidence','qnfo-email handoff '||?1,'confidence','asserted','status','unverified'))").bind("email-reply-"+d.emailId,"Human email needs an authored reply: "+d.from+" / "+d.subject,"Author a substantive reply, then set email_reply_queue.draft_text so the executor sends it.","Author reply then executor auto-sends").run()}catch(e){}}try{await notifyOwner(env,"[handoff] "+(d.subject||"human thread"),"A nuanced human email is held for your reply (queue id "+qid+"). From "+d.from+" | Subject: "+d.subject+" | Received: "+d.receivedAt+". This is a handoff notice (not a digest). Set email_reply_queue.draft_text to send a reply.")}catch(e){}return qid}catch(e){return null}}
/* EMAIL-APPROVAL-GATE-1: owner-approval + sender-reputation gate restored */
async function drainReplyQueue(env){const out={sent:0,skipped:0,errors:0,held:0};try{const r=await env.AUDIT_DB.prepare("SELECT q.id,q.email_id,q.sender,q.subject,q.draft_text FROM email_reply_queue q WHERE q.decision='escalate' AND q.sent_at IS NULL AND q.draft_text IS NOT NULL AND q.skip_reason LIKE '%cleared for auto-send%' AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.id=q.email_id AND e.status='spam') AND NOT EXISTS (SELECT 1 FROM emails e2 WHERE e2.sender=q.sender AND e2.status='spam') ORDER BY q.id LIMIT 20").all();for(const row of r.results||[]){try{await env.SEND_EMAIL.send({to:row.sender,from:"rowan.quni@qnfo.org",subject:"Re: "+row.subject,text:row.draft_text});await env.AUDIT_DB.prepare("UPDATE email_reply_queue SET decision='sent',sent_at=datetime('now'),attempt_count=attempt_count+1,updated_at=datetime('now') WHERE id=?1").bind(row.id).run();await env.AUDIT_DB.prepare("UPDATE emails SET status='replied' WHERE id=?1").bind(row.email_id).run();try{await env.AUDIT_DB.prepare("INSERT INTO emails (message_id,sender,recipient,subject,body_text,headers_json,classification,received_at,status) VALUES (?1,'rowan.quni@qnfo.org',?2,?3,?4,'{}','general',?5,'sent')").bind(crypto.randomUUID(),row.sender,"Re: "+row.subject,String(row.draft_text||"").slice(0,10000),new Date().toISOString()).run()}catch(e){}out.sent++}catch(e){out.errors++}}const s=await env.AUDIT_DB.prepare("SELECT q.id FROM email_reply_queue q JOIN emails e ON e.id=q.email_id WHERE q.decision='escalate' AND q.sent_at IS NULL AND e.status='spam'").all();for(const row of s.results||[]){try{await env.AUDIT_DB.prepare("UPDATE email_reply_queue SET decision='skip',skip_reason=COALESCE(skip_reason,'')||' | executor: parent email is spam (terminal).',updated_at=datetime('now') WHERE id=?1").bind(row.id).run();out.skipped++}catch(e){}}const _held=await env.AUDIT_DB.prepare("SELECT q.id FROM email_reply_queue q WHERE q.decision='escalate' AND q.sent_at IS NULL AND q.draft_text IS NOT NULL AND (q.skip_reason IS NULL OR q.skip_reason NOT LIKE '%cleared for auto-send%')").all();for(const row of _held.results||[]){try{await env.AUDIT_DB.prepare("UPDATE email_reply_queue SET skip_reason=COALESCE(skip_reason,'')||' | executor: owner-approval marker absent, held (REPLY-QUEUE-AUTOSEND-ON-DRAFT-1).',updated_at=datetime('now') WHERE id=?1").bind(row.id).run();out.held++}catch(e){}}}catch(e){}return out}
async function replyStallGuard(env){try{const r=await env.AUDIT_DB.prepare("SELECT q.id,q.sender,q.subject FROM email_reply_queue q WHERE q.decision='escalate' AND q.sent_at IS NULL AND q.draft_text IS NULL AND q.created_at < datetime('now','-24 hours')").all();for(const row of r.results||[]){const ex=await env.AUDIT_DB.prepare("SELECT id FROM handoffs WHERE session_id=?1").bind("email-stall-"+row.id).first();if(!ex){try{await env.AUDIT_DB.prepare("INSERT INTO handoffs (session_id,project_id,summary,pending_work,next_action,timestamp,claim_sheet) VALUES (?1,'qnfo-email',?2,?3,?4,datetime('now'),json_object('claim',?2,'evidence','qnfo-email handoff '||?1,'confidence','asserted','status','unverified'))").bind("email-stall-"+row.id,"STALLED >24h: human email awaiting authored reply: "+row.sender+" / "+row.subject,"Queue row "+row.id+" has no draft_text; the executor cannot send it.","Author a reply (set draft_text) so the executor sends it.").run()}catch(e){}}}}catch(e){}}

/* ITINERARY-INGEST-1 (agent_issues #1881, 2026-10-04): booking confirmations that reach this inbound handler become
   personal-life.events rows (category lodging/travel, with city, country, start_date, end_date) and a mirror
   qnfo-audit.calendar row, so the radar away gate and the daily brief see a trip without hand entry.
   Deterministic parser, no model call. Only two kinds of mail are read: (a) from a booking-company domain whose
   Cloudflare-stamped DMARC verdict passes for that same domain (Gmail/Outlook auto-forward keeps the original From and
   DKIM), (b) from an owner address with the same DMARC check (a manual forward). Anything else is ignored, because a
   fake "confirmation" must not be able to hide the owner's Amsterdam events behind an away window.
   Booking references and phone numbers stay in personal-life.events.booking_ref; the calendar mirror never carries
   them, and its uid is an HMAC of the code (not the code). Re-delivery is idempotent (same id, upsert). */
var ITIN_OWNER = OWNER_SENDERS.concat(["rwnquni@gmail.com"]);
var ITIN_BOOKING_DOMAINS = ["booking.com", "klm.com", "klm.nl", "airfrance.com", "airfrance.fr", "wizzair.com", "esky.com", "esky.pl", "esky.nl", "ryanair.com", "transavia.com", "easyjet.com", "lufthansa.com", "airbnb.com", "expedia.com", "hotels.com", "agoda.com", "vueling.com", "eurowings.com", "lot.com", "norwegian.com", "tui.com", "trip.com", "omio.com", "flixbus.com"];
var ITIN_AIRPORTS = {
  AMS: ["Amsterdam", "NL", 1], EIN: ["Eindhoven", "NL", 1], RTM: ["Rotterdam", "NL", 1], BRU: ["Brussels", "BE", 1], CRL: ["Charleroi", "BE", 1],
  CDG: ["Paris", "FR", 1], ORY: ["Paris", "FR", 1], FRA: ["Frankfurt", "DE", 1], MUC: ["Munich", "DE", 1], BER: ["Berlin", "DE", 1], DUS: ["Dusseldorf", "DE", 1], HAM: ["Hamburg", "DE", 1],
  LHR: ["London", "GB", 0], LGW: ["London", "GB", 0], STN: ["London", "GB", 0], LTN: ["London", "GB", 0], DUB: ["Dublin", "IE", 0], LIS: ["Lisbon", "PT", 0], OPO: ["Porto", "PT", 0],
  MAD: ["Madrid", "ES", 1], BCN: ["Barcelona", "ES", 1], FCO: ["Rome", "IT", 1], MXP: ["Milan", "IT", 1], VCE: ["Venice", "IT", 1], VIE: ["Vienna", "AT", 1], ZRH: ["Zurich", "CH", 1], PRG: ["Prague", "CZ", 1], BUD: ["Budapest", "HU", 1],
  CPH: ["Copenhagen", "DK", 1], ARN: ["Stockholm", "SE", 1], OSL: ["Oslo", "NO", 1], HEL: ["Helsinki", "FI", 2], ATH: ["Athens", "GR", 2], OTP: ["Bucharest", "RO", 2], SOF: ["Sofia", "BG", 2],
  WAW: ["Warsaw", "PL", 1], WMI: ["Warsaw", "PL", 1], KRK: ["Kraków", "PL", 1], WRO: ["Wrocław", "PL", 1], GDN: ["Gdańsk", "PL", 1], POZ: ["Poznań", "PL", 1], KTW: ["Katowice", "PL", 1]
};
var ITIN_COUNTRIES = { poland: "PL", netherlands: "NL", germany: "DE", france: "FR", belgium: "BE", spain: "ES", italy: "IT", portugal: "PT", austria: "AT", switzerland: "CH", czechia: "CZ", "czech republic": "CZ", hungary: "HU", denmark: "DK", sweden: "SE", norway: "NO", finland: "FI", greece: "GR", ireland: "IE", "united kingdom": "GB", romania: "RO", bulgaria: "BG", croatia: "HR", slovakia: "SK", lithuania: "LT", latvia: "LV", estonia: "EE" };
var ITIN_MONTHS = { jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maart: 3, mrt: 3, apr: 4, april: 4, may: 5, mei: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, augustus: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12 };
var ITIN_DATE_RE = "(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./]\\d{1,2}[./]\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?[A-Za-z]{3,9}\\.?,?\\s+\\d{4}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})";
function itinPad(n) { return (n < 10 ? "0" : "") + n }
function itinIso(y, m, d) {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  var t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return "";
  return y + "-" + itinPad(m) + "-" + itinPad(d);
}
function itinParseDate(s) {
  s = String(s || "").trim().replace(/ /g, " ");
  var m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return itinIso(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s))) return itinIso(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s))) { var a = ITIN_MONTHS[m[2].toLowerCase()]; return a ? itinIso(+m[3], a, +m[1]) : "" }
  if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s))) { var b = ITIN_MONTHS[m[1].toLowerCase()]; return b ? itinIso(+m[3], b, +m[2]) : "" }
  return "";
}
function itinFindDate(text, labelRe) {
  var re = new RegExp("(?:" + labelRe + ")[^\\n\\d]{0,40}?(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\\.?,?\\s+)?(" + ITIN_DATE_RE + ")", "i");
  var m = re.exec(text);
  return m ? itinParseDate(m[1]) : "";
}
function itinFindTime(text, labelRe) {
  var re = new RegExp("(?:" + labelRe + ")[^\\n]{0,60}?\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b", "i");
  var m = re.exec(text);
  return m ? itinPad(+m[1]) + ":" + m[2] : "";
}
function itinCode(text) {
  var re = /(?:booking|confirmation|reservation|reference|locator|PNR)(?:[ \t]+(?:code|number|no\.?|ref(?:erence)?|id))?(?:[ \t]*\([A-Z]+\))?[ \t]*[:#][ \t]*([A-Z0-9]{5,10})\b/gi, m;
  while ((m = re.exec(text))) {
    var tok = m[1];
    if (tok !== tok.toUpperCase()) continue; // codes are printed upper case; "details", "number" are not codes
    if (!/\d/.test(tok) && !/^[A-Z]{6}$/.test(tok)) continue;
    return tok;
  }
  return "";
}
function itinStrip(raw) {
  return String(raw || "").replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, " ").replace(/<br\s*\/?>|<\/(?:p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t ]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
// +01:00 or +02:00 for a European local time: EU summer time runs 01:00 UTC last Sunday of March to 01:00 UTC last Sunday of October.
function itinOffset(iso, stdHours) {
  var y = +iso.slice(0, 4);
  function lastSun(mon) { var d = new Date(Date.UTC(y, mon + 1, 0)); return Date.UTC(y, mon, d.getUTCDate() - d.getUTCDay(), 1) }
  var p = iso.split("-"), t = Date.UTC(+p[0], +p[1] - 1, +p[2], 12);
  var dst = t >= lastSun(2) && t < lastSun(9);
  var h = stdHours + (dst ? 1 : 0);
  return "+" + itinPad(h) + ":00";
}
function itinAddDays(iso, n) { var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.getUTCFullYear() + "-" + itinPad(d.getUTCMonth() + 1) + "-" + itinPad(d.getUTCDate()) }
function itinAirline(fn, text, from) {
  var map = { KL: "KLM", HV: "Transavia", W6: "Wizz Air", W4: "Wizz Air", FR: "Ryanair", U2: "easyJet", LH: "Lufthansa", AF: "Air France", LO: "LOT", VY: "Vueling", EW: "Eurowings", DY: "Norwegian", BA: "British Airways", SK: "SAS" };
  var c = fn.slice(0, 2);
  if (map[c]) return map[c];
  var f = String(from || "").toLowerCase();
  for (var k in { klm: 1, wizzair: 1, ryanair: 1, transavia: 1, easyjet: 1, lufthansa: 1 }) if (f.indexOf(k) >= 0 || new RegExp("\\b" + k + "\\b", "i").test(text)) return k === "wizzair" ? "Wizz Air" : k === "klm" ? "KLM" : k.charAt(0).toUpperCase() + k.slice(1);
  return "Flight";
}
function itinParseFlights(text, from, code) {
  var out = [], seen = {};
  var re = /\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{2,4})\b[^\n]{0,80}?\b([A-Z]{3})\s*(?:-|–|→|>|to)\s*([A-Z]{3})\b|\b([A-Z]{3})\s*(?:-|–|→|>|to)\s*([A-Z]{3})\b[^\n]{0,60}?\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{2,4})\b/g, m;
  var lines = text.split("\n"); var reOne = new RegExp(re.source);
  for (var i = 0; i < lines.length; i++) {
    re.lastIndex = 0;
    while ((m = re.exec(lines[i]))) {
      var fn = m[1] ? m[1] + m[2] : m[7] + m[8], o = m[1] ? m[3] : m[5], d = m[1] ? m[4] : m[6];
      if (!ITIN_AIRPORTS[o] || !ITIN_AIRPORTS[d] || o === d) continue;
      // date and times sit on this line or the next three
      var fwd = [lines[i]];
      for (var j = i + 1; j < Math.min(lines.length, i + 4); j++) { if (reOne.test(lines[j])) break; fwd.push(lines[j]) }
      var ctx = fwd.join("\n"), dre = new RegExp("(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\\.?,?\\s+)?(" + ITIN_DATE_RE + ")", "i");
      var dm = dre.exec(ctx);
      if (!dm && i > 0) { ctx = lines[i - 1] + "\n" + lines[i]; dm = dre.exec(ctx) }
      var date = dm ? itinParseDate(dm[1]) : "";
      if (!date) continue;
      var tms = ctx.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) || [];
      var key = fn + "|" + date + "|" + o + "|" + d;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ fn: fn, o: o, d: d, date: date, dep: tms[0] || "", arr: tms[1] || "" });
    }
  }
  return out.map(function (f) {
    var oa = ITIN_AIRPORTS[f.o], da = ITIN_AIRPORTS[f.d], air = itinAirline(f.fn, text, from);
    var timed = /^\d{1,2}:\d{2}$/.test(f.dep);
    var dep = timed ? itinPad(+f.dep.split(":")[0]) + ":" + f.dep.split(":")[1] : "";
    var arr = /^\d{1,2}:\d{2}$/.test(f.arr) ? itinPad(+f.arr.split(":")[0]) + ":" + f.arr.split(":")[1] : "";
    var title;
    title = "Flight " + f.o + " to " + f.d + " (" + (air === "Flight" ? "" : air + " ") + f.fn + ")";
    return { kind: "flight", disc: f.fn.toLowerCase(), code: code, category: "travel", title: title, venue: oa[0] + " Airport", city: oa[0], country: oa[1], start_date: f.date, end_date: f.date,
      notes: (dep ? "Departs " + dep : "Departure time not stated") + (arr ? ", arrives " + arr + " local" : "") + ". " + oa[0] + " to " + da[0] + ".",
      cal: { title: title, description: oa[0] + " to " + da[0] + (dep ? ", departs " + dep + " local" : "") + ".", location: oa[0] + " Airport (" + f.o + ") to " + da[0] + " Airport (" + f.d + ")",
        all_day: timed ? 0 : 1, dtstart: timed ? f.date + "T" + dep + ":00" + itinOffset(f.date, oa[2]) : f.date, dtend: timed ? (arr ? f.date + "T" + arr + ":00" + itinOffset(f.date, da[2]) : null) : itinAddDays(f.date, 1) } };
  });
}
function itinCountry(s) { var k = String(s || "").toLowerCase().replace(/[^a-z ]/g, "").trim(); return ITIN_COUNTRIES[k] || (/^[A-Z]{2}$/.test(String(s || "").trim()) ? String(s).trim() : "") }
function itinParseHotel(subject, text, code) {
  var cin = itinFindDate(text, "check[- ]?in|arrival|aankomst|incheck(?:en)?"), cout = itinFindDate(text, "check[- ]?out|departure|vertrek|uitcheck(?:en)?");
  if (!cin || !cout || cout <= cin) return null;
  var name = "", m;
  var pats = [/^(?:property|hotel|accommodation|accommodatie|name)\s*[:\-]\s*(.{3,80})$/im, /your (?:booking|reservation|stay) (?:at|with) (.{3,80}?) (?:is|has been|was) confirmed/i, /(?:booking|reservation) confirmed\s*[:\-–]\s*(.{3,80})$/im, /confirmed\s*[:\-–]\s*(.{3,80}?)(?:\s+in\s+[^\n]+)?$/im];
  var src = String(subject || "") + "\n" + text;
  for (var i = 0; i < pats.length && !name; i++) if ((m = pats[i].exec(src))) name = m[1].replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
  var city = "", country = "";
  if ((m = /^(?:address|adres)\s*[:\-]\s*(.{5,200})$/im.exec(text))) {
    var parts = m[1].split(",").map(function (x) { return x.trim() }).filter(Boolean);
    country = itinCountry(parts[parts.length - 1]);
    var cp = parts[country ? parts.length - 2 : parts.length - 1] || "";
    city = cp.replace(/^\d{2}-?\d{3}\s*|^\d{4}\s?[A-Z]{2}\s*|^\d{5}\s*/, "").trim();
  }
  if (!city && (m = /^(?:city|location|stad|plaats)\s*[:\-]\s*([^\n,]{2,60})(?:,\s*([^\n]{2,40}))?$/im.exec(text))) { city = m[1].trim(); country = country || itinCountry(m[2]) }
  if (!city && (m = /your (?:booking|stay|reservation) in ([A-Z][^\n,.]{1,40}?) (?:is|has)/.exec(subject || ""))) city = m[1].trim();
  if (!city) return null;
  var tin = itinFindTime(text, "check[- ]?in|from"), tout = itinFindTime(text, "check[- ]?out|until|by");
  if (!name) name = "Stay in " + city;
  var nights = Math.round((Date.parse(cout) - Date.parse(cin)) / 864e5);
  return { kind: "lodging", disc: "", code: code, category: "lodging", title: name, venue: name, city: city, country: country, start_date: cin, end_date: cout,
    notes: (tin ? "Check-in from " + tin : "Check-in time not stated") + (tout ? ", check-out by " + tout : "") + ". " + nights + " night" + (nights === 1 ? "" : "s") + ".",
    cal: { title: name, description: "Check-in " + cin + (tin ? " from " + tin : "") + ", check-out " + cout + (tout ? " by " + tout : "") + ".", location: city + (country ? ", " + country : ""), all_day: 1, dtstart: cin, dtend: cout } };
}
// Pure: returns [] for anything that is not a recognisable flight or hotel confirmation.
function itinParse(subject, bodyText, bodyHtml, from) {
  var text = String(bodyText || "").trim() ? String(bodyText) : itinStrip(bodyHtml);
  text = text.replace(/\r/g, "").replace(/[ \t ]+/g, " ").slice(0, 60000);
  if (!text.trim()) return [];
  var code = itinCode(text) || itinCode(String(subject || ""));
  if (!code) return [];
  var items = itinParseFlights(text, from, code);
  var h = items.length ? null : itinParseHotel(subject, text, code);
  if (h) items.push(h);
  return items;
}
function itinPrivacyScrub(s, code) {
  var t = String(s || "");
  if (code) t = t.split(code).join("").split(code.toLowerCase()).join("");
  return t.replace(/\+?\d[\d ()\-]{7,}\d/g, "").replace(/\s{2,}/g, " ").trim();
}
async function itinHmac(key, msg) {
  var k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  var sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
  var hex = ""; for (var i = 0; i < 6; i++) hex += (sig[i] < 16 ? "0" : "") + sig[i].toString(16);
  return hex;
}
function itinSenderAddr(from) { var s = String(from || "").toLowerCase(); var m = s.match(/<([^>]+)>/); if (m) s = m[1]; return s.trim() }
// Which door is this mail allowed through? Returns "" when none. Reuses the Cloudflare-stamped DMARC reading of ownerAuthenticated().
function itinGate(env, from, authResults) {
  var addr = itinSenderAddr(from), dom = addr.split("@")[1] || "";
  if (!dom) return "";
  var raw = String(authResults || ""), first = raw.split(/,\s*(?=[a-z0-9.-]+\s*;)/i)[0];
  if (!/^\s*mx\.cloudflare\.net\s*;/i.test(first)) return "";
  var m = /\bdmarc=(\w+)\s+header\.from=([^\s;]+)/i.exec(first);
  if (!m || m[1].toLowerCase() !== "pass") return "";
  var hf = m[2].toLowerCase();
  if (hf !== dom) return "";
  if (ITIN_OWNER.indexOf(addr) >= 0) return "owner-forward";
  for (var i = 0; i < ITIN_BOOKING_DOMAINS.length; i++) { var b = ITIN_BOOKING_DOMAINS[i]; if (dom === b || (dom.length > b.length && dom.slice(dom.length - b.length - 1) === "." + b)) return "booking-domain" }
  return "";
}
function itinLooksLikeBooking(subject) {
  var s = String(subject || "");
  return /confirm|itinerar|e-?ticket|your (?:booking|reservation|flight|trip)|boarding/i.test(s) && !/review|rate your|offer|deal|survey|reminder to|newsletter/i.test(s);
}
// Idempotent upsert of parsed items. db handles are injected so the fixtures can run offline.
async function itinWrite(env, items, meta) {
  var key = env.OPS_KEY || env.API_KEY || "";
  var out = { written: 0, duplicate: 0, skipped: 0, ids: [] };
  if (!key) { out.error = "no HMAC key (OPS_KEY/API_KEY)"; return out }
  if (!env.PERSONAL) { out.error = "PERSONAL binding missing"; return out }
  var now = new Date().toISOString();
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var id = "evt-itin-" + await itinHmac(key, [it.code, it.kind, it.start_date, it.disc].join("|"));
    // A hand-entered row for the same booking and date already feeds the gate and the brief: do not double it.
    var hand = await env.PERSONAL.prepare("SELECT id FROM events WHERE booking_ref = ?1 AND start_date = ?2 AND category = ?3 AND id NOT LIKE 'evt-itin-%' LIMIT 1").bind(it.code, it.start_date, it.category).first();
    if (hand) { out.duplicate++; continue }
    await env.PERSONAL.prepare("INSERT INTO events (id, category, title, venue, city, country, start_date, end_date, amount, currency, booking_ref, source, source_subject, energy, energy_label, notes, ingested_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,NULL,NULL,?9,?10,?11,NULL,NULL,?12,?13) ON CONFLICT(id) DO UPDATE SET title=?3, venue=?4, city=?5, country=?6, start_date=?7, end_date=?8, booking_ref=?9, source=?10, source_subject=?11, notes=?12, ingested_at=?13")
      .bind(id, it.category, trunc(it.title, 200), trunc(it.venue, 200), it.city, it.country || "", it.start_date, it.end_date, it.code, "email-itinerary:" + meta.gate, trunc(meta.subject, 200), trunc(itinPrivacyScrub(it.notes, it.code), 400), now).run();
    var c = it.cal, uid = "trip-" + id + "@qnfo.cloud";
    await env.AUDIT_DB.prepare("INSERT INTO calendar (plane, uid, title, description, location, dtstart, dtend, all_day, url, source, domain, status, created, updated) VALUES ('personal',?1,?2,?3,?4,?5,?6,?7,NULL,'manual','travel','confirmed',datetime('now'),datetime('now')) ON CONFLICT(uid) DO UPDATE SET title=?2, description=?3, location=?4, dtstart=?5, dtend=?6, all_day=?7, status='confirmed', updated=datetime('now')")
      .bind(uid, itinPrivacyScrub(c.title, it.code), itinPrivacyScrub(c.description, it.code), itinPrivacyScrub(c.location, it.code), c.dtstart, c.dtend || null, c.all_day).run();
    out.written++; out.ids.push(id);
  }
  return out;
}
async function itineraryIngest(env, x) {
  try {
    var gate = itinGate(env, x.from, x.authResults);
    if (!gate) return { skipped: "not-gated" };
    var items = itinParse(x.subject, x.bodyText, x.bodyHtml, x.from);
    if (!items.length) {
      if (itinLooksLikeBooking(x.subject)) {
        try { await env.AUDIT_DB.prepare("INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status) VALUES (?1,?2,'qnfo-email','personal','low','open')").bind("ITINERARY-PARSE-MISS-1: email " + x.emailId + " looked like a booking confirmation but nothing was parsed", "A gated sender (" + gate + ") sent a mail whose subject looks like a booking confirmation, but itinParse returned no flight or hotel. Read audit emails.id=" + x.emailId + " (subject: " + trunc(String(x.subject || "").replace(/[\r\n]+/g, " "), 120) + ") and extend itinParse in qnfo-email/worker.js with a fixture. No row was written to events or calendar.").run() } catch (_) {}
      }
      return { parsed: 0 };
    }
    var r = await itinWrite(env, items, { gate: gate, subject: x.subject });
    console.log("itinerary", JSON.stringify({ email: x.emailId, gate: gate, parsed: items.length, written: r.written, duplicate: r.duplicate, error: r.error || null }));
    return { parsed: items.length, written: r.written, duplicate: r.duplicate, error: r.error || null };
  } catch (err) { console.error("itineraryIngest", err && err.message || err); return { error: String(err && err.message || err) } }
}
/* SOURCE-FRESHNESS-1 (#1881): rides the existing 07:00 cron. One agent_issues row per ingest source with no new row for
   more than 3 days. The open-title unique index dedupes; the description is refreshed with the current age. */
var FRESH_LIMIT_DAYS = 3;
async function freshnessGuard(env) {
  var rows = [];
  try { var a = await env.AUDIT_DB.prepare("SELECT max(datetime(received_at)) AS last_seen FROM emails").first(); rows.push({ source: "qnfo-email inbound (audit.emails)", last: a && a.last_seen }) } catch (_) {}
  if (env.PERSONAL) {
    try { var s = await env.PERSONAL.prepare("SELECT store, max(datetime(received_at)) AS last_seen FROM email_index GROUP BY store").all(); (s.results || []).forEach(function (r) { rows.push({ source: "email_index store " + r.store, last: r.last_seen }) }) } catch (_) {}
    try { var ev = await env.PERSONAL.prepare("SELECT max(datetime(ingested_at)) AS last_seen FROM events").first(); rows.push({ source: "personal-life.events ingest", last: ev && ev.last_seen }) } catch (_) {}
  }
  var filed = 0, stale = [];
  for (var i = 0; i < rows.length && filed < 6; i++) {
    var r = rows[i], t = r.last ? Date.parse(String(r.last).replace(" ", "T") + "Z") : NaN;
    var days = isNaN(t) ? 999 : Math.floor((Date.now() - t) / 864e5);
    if (days <= FRESH_LIMIT_DAYS) continue;
    stale.push(r.source + ":" + days + "d");
    var title = "SOURCE-FRESHNESS-1: " + r.source + " has no new rows for over " + FRESH_LIMIT_DAYS + " days";
    var desc = "Newest row: " + (r.last || "none") + " UTC, " + days + " days ago, measured " + new Date().toISOString() + " by qnfo-email freshnessGuard. Find the writer for this source, repair or formally retire it; if retired, delete its dependents instead of monitoring. See #1881.";
    try {
      var ins = await env.AUDIT_DB.prepare("INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status) VALUES (?1,?2,'qnfo-email','personal','medium','open')").bind(title, desc).run();
      if (ins && ins.meta && ins.meta.changes) filed++;
      else await env.AUDIT_DB.prepare("UPDATE agent_issues SET description = ?2 WHERE title = ?1 AND status = 'open'").bind(title, desc).run();
    } catch (_) {}
  }
  return { checked: rows.length, stale: stale, filed: filed };
}
/* PUBLIC-ERROR-1: authenticated routes returned raw err.message (CodeQL js/stack-trace-exposure); the detail goes to the log only. */
function pubErr(err) { try { console.error("qnfo-email route error", err && err.message || err) } catch (_) {} return "internal error" }
