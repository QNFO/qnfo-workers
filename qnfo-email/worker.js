var VERSION="2.1.4";
const BODY_MAX_TEXT=1e4,BODY_MAX_HTML=2e4;
export default{async email(m,e,c){const st=Date.now(),h=m.headers,from=m.from,to=m.to,subject=h.get("subject")||"(no subject)",messageId=h.get("message-id")||(Date.now()+"-"+crypto.randomUUID()),receivedAt=new Date().toISOString();const parsed=await parseBody(m.raw),bodyText=(parsed.bodyText||"").slice(0,BODY_MAX_TEXT),bodyHtml=(parsed.bodyHtml||"").slice(0,BODY_MAX_HTML),rawText=parsed.rawText||"",headersJson=JSON.stringify(Object.fromEntries(h.entries())),classification=classifyAddress(to);const filter=await applyFilters(e.AUDIT_DB,from,to,subject,bodyText);if(filter.action==="reject"){m.setReject(filter.reason||"rejected");return}const emailId=await storeEmail(e.AUDIT_DB,{messageId,from,to,subject,bodyText,bodyHtml,headersJson,classification,receivedAt,inReplyTo:h.get("in-reply-to")||null,refsHdr:h.get("references")||null});c.waitUntil(archiveRaw(e,{emailId,messageId,rawText,rawSize:m.rawSize,receivedAt}));const spam=(filter.action==="spam")||heuristicSpam(from,subject);if(spam){await logAction(e.AUDIT_DB,emailId,"spam",classification,st);return}if(String(bodyText||"").trim()||String(bodyHtml||"").trim())c.waitUntil(resolveParseFailures(e.AUDIT_DB,from,subject));c.waitUntil(recordParseFailure(e,{emailId,messageId,from,to,subject,bodyText,bodyHtml,headersJson,rawText,rawSize:m.rawSize,receivedAt}));c.waitUntil(enqueueHandoff(e,{emailId,from,subject,receivedAt,classification}));try{await processCommand(e,{emailId:emailId,messageId:messageId,inReplyTo:h.get("in-reply-to")||null,from:from,to:to,subject:subject,bodyText:bodyText})}catch(err){console.error("processCommand",err&&err.message||err)}
await logAction(e.AUDIT_DB,emailId,"processed",classification,st)},async scheduled(){console.log("qnfo-email v2.1.4 scheduled: MIME/raw guard active; digest paused pending full-source merge")},async fetch(req,e){const u=new URL(req.url),p=u.pathname==="/email"?"/":u.pathname.replace(/^\/email(?=\/)/,"");const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","access-control-allow-origin":"*"}});if(p==="/health")return J({status:"ok",worker:"qnfo-email",version:VERSION,command_control:true,raw_archive:true,mime_guard:true,bindings:{d1:!!e.AUDIT_DB,send_email:!!e.SEND_EMAIL,ops_key:!!e.OPS_KEY},timestamp:new Date().toISOString()});if(req.method!=="OPTIONS"&&p!=="/health"){const a=req.headers.get("authorization")||"",x=req.headers.get("x-api-key")||"";const ok=(e.API_KEY&&(a==="Bearer "+e.API_KEY||x===e.API_KEY))||(e.GATEWAY_EMAIL_KEY&&(a==="Bearer "+e.GATEWAY_EMAIL_KEY||x===e.GATEWAY_EMAIL_KEY));if(!ok)return J({error:"unauthorized"},401)}try{if(p==="/stats")return J(await stats(e));if(p==="/emails/recent"){const limit=Math.min(parseInt(u.searchParams.get("limit")||"20"),100),status=u.searchParams.get("status");let sql="SELECT id,message_id,sender,recipient,subject,classification,status,received_at,processing_ms FROM emails",vals=[];if(status){sql+=" WHERE status=?1";vals.push(status)}sql+=" ORDER BY id DESC LIMIT ?"+(vals.length+1);vals.push(limit);const r=await e.AUDIT_DB.prepare(sql).bind(...vals).all();return J({count:(r.results||[]).length,emails:r.results||[]})}if(p==="/emails/body"){const id=parseInt(u.searchParams.get("id")||"0"),r=await e.AUDIT_DB.prepare("SELECT * FROM emails WHERE id=?1").bind(id).first();return r?J(r):J({error:"not found"},404)}if(p==="/emails/search"){const q="%"+(u.searchParams.get("q")||"")+"%",limit=Math.min(parseInt(u.searchParams.get("limit")||"20"),100),r=await e.AUDIT_DB.prepare("SELECT id,message_id,sender,recipient,subject,classification,status,received_at FROM emails WHERE subject LIKE ?1 OR sender LIKE ?1 OR body_text LIKE ?1 ORDER BY id DESC LIMIT ?2").bind(q,limit).all();return J({count:(r.results||[]).length,emails:r.results||[]})}if(p==="/emails/status"&&(req.method==="PATCH"||req.method==="POST")){const b=await req.json().catch(()=>({}));const sid=parseInt(b.id||0),sstat=String(b.status||""),ALLOWED=["received","processed","sent","replied","archived","spam","read","rejected"];if(!sid||!ALLOWED.includes(sstat))return J({ok:false,error:"id and a valid status are required",allowed:ALLOWED},400);await e.AUDIT_DB.prepare("UPDATE emails SET status=?1 WHERE id=?2").bind(sstat,sid).run();return J({ok:true,id:sid,status:sstat})}if(p==="/command"&&req.method==="POST"){try{const b=await req.json().catch(()=>({}));const sender=b.sender||b.from||"",dry=u.searchParams.get("dry")==="1"||b.dry===true,bodyText=b.body||b.command||"",subj=b.subject||"(http command)",row=await lookupSender(e.AUDIT_DB,normalizeAddress(sender));if(!row)return J({ok:false,error:"sender not in command allowlist"},403);const kind=row.kind,pc=parseCommand(bodyText,subj);let result;try{result=await routeCommand(e,pc.verb,pc.commandText,kind)}catch(err){result={ok:false,error:String(err&&err.message||err)}}const replyText=formatResult(pc.verb,pc.commandText,result,kind);let sent=false;if(!dry&&e.SEND_EMAIL&&sender){try{await e.SEND_EMAIL.send({to:sender,from:"qnfo@qnfo.org",subject:"Re: "+subj,text:replyText});sent=true}catch(err){result.reply_error=String(err&&err.message||err)}}return J({ok:result.ok!==false,verb:pc.verb,kind:kind,dry:dry,reply_sent:sent,result:result,reply:replyText})}catch(err){return J({error:err.message||String(err)},500)}}if(p==="/commands"&&req.method==="GET"){try{const r=await e.AUDIT_DB.prepare("SELECT * FROM email_commands ORDER BY id DESC LIMIT 50").all();return J({count:(r.results||[]).length,commands:r.results||[]})}catch(err){return J({error:err.message||String(err)},500)}}if(p==="/command-senders"&&req.method==="GET"){try{const r=await e.AUDIT_DB.prepare("SELECT * FROM email_command_senders ORDER BY id").all();return J({senders:r.results||[]})}catch(err){return J({error:err.message||String(err)},500)}}if(p==="/send"&&req.method==="POST")return await sendApi(req,e,J);if(req.method==="GET")return J({ok:true,worker:"qnfo-email",version:VERSION,routes:["/health","/stats","/emails/recent","/emails/body","/emails/search","/emails/status","/commands","/command-senders","/send","/command"]});return J({ok:false,error:"not found",path:p,method:req.method,version:VERSION},404)}catch(err){return J({error:err.message||String(err)},500)}}};
function trunc(s,n){return String(s||"").slice(0,n)}function classifyAddress(to){to=String(to||"").toLowerCase();return to.includes("rowan")||to.includes("rwn")?"personal":"general"}
async function storeEmail(db,d){const r=await db.prepare("INSERT INTO emails (message_id,sender,recipient,subject,body_text,body_html,headers_json,classification,received_at,status,in_reply_to,references_hdr) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'received',?10,?11) ON CONFLICT(message_id) DO UPDATE SET recipient=?3,subject=?4,body_text=?5,body_html=?6,headers_json=?7,classification=?8,in_reply_to=?10,references_hdr=?11").bind(d.messageId,d.from,d.to,d.subject,d.bodyText,d.bodyHtml,d.headersJson,d.classification,d.receivedAt,d.inReplyTo,d.refsHdr).run();return r.meta&&r.meta.last_row_id||0}
async function applyFilters(db,from,to,subject,body){try{const r=await db.prepare("SELECT * FROM email_filters WHERE enabled=1 ORDER BY priority DESC LIMIT 100").all();for(const f of r.results||[]){const fl=String(f.field||"").toLowerCase();const hay=fl==="sender"||fl==="from"?from:fl==="recipient"||fl==="to"?to:fl==="body"||fl==="body_text"?body:subject;const pat=String(f.pattern||"").toLowerCase().replace(/^\*+|\*+$/g,"");if(pat&&String(hay||"").toLowerCase().includes(pat))return{action:f.action||"process",reason:f.reason||"filter"}}}catch(e){}return{action:"process"}}
async function logAction(db,id,status,cls,start){try{await db.prepare("UPDATE emails SET status=?1, processing_ms=?2 WHERE id=?3").bind(status,Date.now()-start,id).run()}catch(e){}}
async function archiveRaw(e,x){try{const raw=trunc(x.rawText,200000);await e.AUDIT_DB.prepare("INSERT INTO email_raw_archive (email_id,message_id,raw_text,raw_size,created_at) VALUES (?1,?2,?3,?4,?5)").bind(x.emailId,x.messageId,raw,Number(x.rawSize||raw.length||0),x.receivedAt).run()}catch(err){console.error("raw archive",err.message||err)}}
function machine(sender,subject){const s=(sender||"").toLowerCase(),sub=(subject||"").toLowerCase();return !s||s.includes("mailer-daemon")||s.includes("noreply")||s.includes("no-reply")||s.includes("postmaster")||(s.includes("google.com")&&sub.includes("report domain:"))}function strategic(sender,subject){return /green-coding|arne|jpc|jpcub|joules|benchmark|license|licensing|qnfo-ula|commercial|prototype|small-batch|energy per compute/i.test((sender||"")+" "+(subject||""))}
async function recordParseFailure(e,x){try{const empty=!String(x.bodyText||"").trim()&&!String(x.bodyHtml||"").trim(),mime=Number(x.rawSize||0)>512||/multipart|quoted-printable|base64|content-type:/i.test((x.headersJson||"")+" "+(x.rawText||"").slice(0,2000));if(!empty||!mime||machine(x.from,x.subject))return;const sev=strategic(x.from,x.subject)?"critical":"high",hint=trunc((x.headersJson||"")+"\nrawSize="+(x.rawSize||0),1000),notes="Parsed empty inbound body despite MIME/body evidence; raw archived for recovery";await e.AUDIT_DB.prepare("INSERT OR IGNORE INTO email_parse_failures (email_id,message_id,sender,subject,received_at,content_hint,status,severity,created_at,notes) VALUES (?1,?2,?3,?4,?5,?6,'open',?7,?8,?9)").bind(x.emailId,x.messageId,x.from,x.subject,x.receivedAt,hint,sev,x.receivedAt,notes).run();if(sev==="critical")await e.AUDIT_DB.prepare("INSERT INTO handoffs (session_id,project_id,summary,pending_work,next_action,timestamp) VALUES (?1,'qnfo-email',?2,?3,?4,?5)").bind("email-parse-failure-"+x.emailId,"Critical email parsed empty: "+x.from+" / "+x.subject,notes,"Recover from email_raw_archive and hand off before replying",x.receivedAt).run().catch(()=>{})}catch(err){console.error("parse failure",err.message||err)}}
async function enqueueHandoff(e,x){try{if(strategic(x.from,x.subject))await e.AUDIT_DB.prepare("INSERT INTO handoffs (session_id,project_id,summary,pending_work,next_action,timestamp) VALUES (?1,'qnfo-email',?2,?3,?4,?5)").bind("email-strategic-"+x.emailId,"Strategic email requires handoff: "+x.from+" / "+x.subject,"Review after 1-2 automated replies; licensing/commercial nuance must not auto-send.","Route to Rowan/Outlook handoff or draft-only queue.",x.receivedAt).run().catch(()=>{})}catch(err){}}
async function stats(e){const a=await Promise.all([e.AUDIT_DB.prepare("SELECT COUNT(*) count FROM emails").first(),e.AUDIT_DB.prepare("SELECT COUNT(*) count FROM emails WHERE julianday(received_at)>julianday('now','-24 hours')").first(),e.AUDIT_DB.prepare("SELECT status,COUNT(*) count FROM emails GROUP BY status").all()]);return{total:a[0]?.count||0,last24h:a[1]?.count||0,byStatus:a[2].results||[]}}
async function sendApi(req,e,J){if(!e.SEND_EMAIL)return J({error:"send_email binding not available"},503);const b=await req.json();if(!b.to)return J({error:"to is required"},400);const to=String(b.to).toLowerCase();try{if(await e.AUDIT_DB.prepare("SELECT 1 FROM email_suppression WHERE lower(email)=?1").bind(to).first())return J({error:"recipient is suppressed",to:b.to,suppressed:true},409)}catch(err){}const text=b.body||String(b.html||"").replace(/<[^>]*>/g,"");if(/\b(stupid|idiot|delusional|useless)\b/i.test(text))return J({error:"tone gate",blocked:true},422);const from=(b.from&&/@(qnfo\.org|qwav\.org|qwav\.tech|qwav\.net|qwav\.uk|q08\.org|qnfo\.net|qnfo\.uk)$/i.test(b.from))?b.from:"qnfo@qnfo.org";await e.SEND_EMAIL.send({to:b.to,from,subject:b.subject||"(no subject)",text,html:b.html||"<p>"+text.replace(/\n/g,"<br>")+"</p>"});const id=crypto.randomUUID(),now=new Date().toISOString();await e.AUDIT_DB.prepare("INSERT INTO emails (message_id,sender,recipient,subject,body_text,body_html,headers_json,classification,received_at,status) VALUES (?1,?2,?3,?4,?5,?6,'{}','general',?7,'sent')").bind(id,from,b.to,b.subject||"(no subject)",trunc(text,BODY_MAX_TEXT),trunc(b.html||"",BODY_MAX_HTML),now).run();if(b.reply_to_id)await e.AUDIT_DB.prepare("UPDATE emails SET status='replied' WHERE id=?1").bind(b.reply_to_id).run();return J({success:true,message_id:id,to:b.to,subject:b.subject||"(no subject)",sent_at:now})}
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

async 
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

async function processCommand(env, c) {
  const db = env.AUDIT_DB;
  const sender = normalizeAddress(c.from);
  const row = await lookupSender(db, sender);
  if (!row) return null;
  const kind = row.kind || "owner";
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
    const res = await fetch(OPS_BASE + "/v1/jobs/" + encodeURIComponent(id), { headers: h });
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
      const res = await fetch(OPS_BASE + "/v1/jobs", {
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
      const pr = await fetch(OPS_BASE + "/v1/jobs/" + encodeURIComponent(j.id), { headers: { "Authorization": "Bearer " + key } });
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
