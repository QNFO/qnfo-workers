// WORKER-SOURCE-IN-REPO-1 (issue 9713): tracked copy of the deployed script (fetched through the Cloudflare API on 2026-11-09), plus /health.
var VERSION = "1.0.1";
const SCOPES=[["AUDIT","handoffs/"],["AUDIT","audits/"],["AUDIT","closeouts/"],["AUDIT","fleet-consolidation/"],["AUDIT","audit/"],["AUDIT","install-dir-cleanup/"],["PALIMPSEST","docs/"],["QNFO","governance/"]];
const CUTOFF="2026-11-06T18:00:00.000Z";
const MAX_LISTED=50;
async function q(env,sql,params){
  for(let t=0;t<3;t++){
    try{ const st=env.DB.prepare(sql); const r=await (params&&params.length?st.bind(...params):st).all(); return r.results||[]; }
    catch(e){ if(t===2) throw e; await new Promise(function(r){setTimeout(r,300*(t+1));}); }
  }
}
function cluster(b,key){
  if(b==="PALIMPSEST") return "DOC-RESEARCH-1";
  if(b==="QNFO") return "DOC-GOV-1";
  if(key.indexOf("audits/")===0) return /backlog|bloat/i.test(key)?"DOC-BACKLOG-1":"DOC-AUDIT-1";
  if(key.indexOf("audit/infrastructure/")===0||key.indexOf("audit/LOSS")===0) return "DOC-AUDIT-1";
  if(key.indexOf("audit/projects/")===0||key.indexOf("install-dir-cleanup/")===0) return "DOC-RESEARCH-1";
  return "DOC-HANDOFF-1";
}
async function init(env){
  await q(env,"CREATE TABLE IF NOT EXISTS doc_audit (bucket TEXT NOT NULL, key TEXT NOT NULL, size INTEGER, uploaded TEXT, first_seen TEXT, last_seen TEXT, traced INTEGER DEFAULT 0, disposition TEXT, PRIMARY KEY (bucket,key))");
  await q(env,"CREATE TABLE IF NOT EXISTS doc_gate_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, total INTEGER, traced INTEGER, clustered INTEGER, orphans INTEGER, new_docs INTEGER, lint_hits INTEGER, note TEXT)");
}

async function extractItems(env){
  try{ await q(env,"ALTER TABLE doc_audit ADD COLUMN items_scanned TEXT"); }catch(e){}
  await q(env,"CREATE TABLE IF NOT EXISTS doc_action_items (id INTEGER PRIMARY KEY AUTOINCREMENT, bucket TEXT, key TEXT, section TEXT, line TEXT, created_at TEXT DEFAULT (datetime('now')))");
  const docs=await q(env,"SELECT bucket,key,size FROM doc_audit WHERE items_scanned IS NULL AND lower(key) LIKE '%.md' ORDER BY size DESC LIMIT 6");
  let filed=0;
  const hd=/^#{1,6}\s*(.*)$/;
  const want=/(open|remaining|deferred|todo|to-do|next step|blocker|blocked|follow[- ]?up|not done|pending|unresolved|failure|failed|incomplete)/i;
  for(const d of docs){
    let text="";
    try{ const o=await env[d.bucket].get(d.key); text=o?await o.text():""; }catch(e){ text=""; }
    const items=[]; let sec="";
    for(const ln of text.split("\n")){
      const m=ln.match(hd);
      if(m){ sec=want.test(m[1])?m[1].trim().slice(0,60):""; continue; }
      if(/^\s*[-*]\s*\[ \]\s+\S/.test(ln)) items.push(["unchecked",ln.trim().slice(0,200)]);
      else if(sec&&/^\s*([-*]|\d+[.)])\s+\S/.test(ln)) items.push([sec,ln.trim().slice(0,200)]);
      if(items.length>=40) break;
    }
    for(const it of items) await q(env,"INSERT INTO doc_action_items (bucket,key,section,line) VALUES (?1,?2,?3,?4)",[d.bucket,d.key,it[0],it[1]]);
    await q(env,"UPDATE doc_audit SET items_scanned=?1 WHERE bucket=?2 AND key=?3",[new Date().toISOString(),d.bucket,d.key]);
    if(items.length&&filed<3){
      const pid="DOC-ITEMS-"+d.key.replace(/[^A-Za-z0-9]/g,"").slice(-40);
      const ex=await q(env,"SELECT id FROM agent_issues WHERE predicate_id=?1 LIMIT 1",[pid]);
      if(!ex.length){
        filed++;
        const nm=d.key.split("/").pop();
        const body=items.slice(0,15).map(function(x){return "["+x[0]+"] "+x[1];}).join("\n");
        await q(env,"INSERT INTO agent_issues (title,description,source,category,priority,status,created_at,updated_at,predicate_id) VALUES (?1,?2,'doc-gate','code-change','low','open',?3,?3,?4)",["DOC-ITEMS: "+nm+" lists "+items.length+" open item(s)","DOC-GATE-1 extraction from "+d.bucket+":"+d.key+". Each item below is either implemented as code (cite the PR, worker or migration as close evidence), filed as its own issue, or recorded as no longer applying. Items:\n"+body,Date.now(),pid]);
      }
    }
  }
}
async function runChecks(env){
  const checks=[
   ["output-as-text",1002287,"SELECT COUNT(*) n FROM false_stop_hits WHERE pattern_key='text-as-output' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days')"],
   ["sole-safeguard-phrasing",1002289,"SELECT COUNT(*) n FROM false_stop_hits WHERE pattern_key='sole-safeguard' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days')"],
   ["directive-rows-unenforced",1002287,"SELECT COUNT(*) n FROM v_open_loops_unenforced"],
   ["orphan-docs",1002257,"SELECT COUNT(*) n FROM doc_audit WHERE traced=0 AND disposition IS NULL"],
   ["closeout-without-artifacts",1002534,"SELECT COUNT(*) n FROM v_closeouts_without_artifacts"]
  ];
  for(const c of checks){
    const n=(await q(env,c[2]))[0].n;
    const k="chk_"+c[0];
    const prev=await q(env,"SELECT v FROM doc_gate_state WHERE k=?1",[k]);
    if(!prev.length||prev[0].v!==String(n)){
      await q(env,"INSERT OR REPLACE INTO doc_gate_state (k,v) VALUES (?1,?2)",[k,String(n)]);
      await q(env,"INSERT INTO remediation_verifications (issue_id,class,transport,expected,observed,pass,verifier) VALUES (?1,'output','d1-query','0 rows',?2,?3,'qnfo-doc-gate')",[c[1],c[0]+" = "+n,n===0?1:0]);
    }
  }
}
async function run(env){
  await init(env);
  const now=new Date().toISOString();
  const known={};
  (await q(env,"SELECT bucket||'/'||key AS k FROM doc_audit")).forEach(function(r){known[r.k]=1;});
  const docs=[];
  for(const s of SCOPES){
    const b=s[0], p=s[1]; let cursor;
    do{
      const l=await env[b].list({prefix:p,cursor:cursor,limit:1000});
      for(const o of l.objects){ if(/\.(md|docx|pdf)$/i.test(o.key)) docs.push({b:b,key:o.key,size:o.size,up:o.uploaded.toISOString()}); }
      cursor=l.truncated?l.cursor:undefined;
    }while(cursor);
  }
  let newDocs=0;
  for(const d of docs){
    const k=d.b+"/"+d.key;
    if(known[k]){ await q(env,"UPDATE doc_audit SET last_seen=?1,size=?2 WHERE bucket=?3 AND key=?4",[now,d.size,d.b,d.key]); continue; }
    newDocs++;
    const name=d.key.split("/").pop().replace(/\.(md|docx|pdf)$/i,"").slice(0,40);
    const like="%"+name+"%";
    const a=await q(env,"SELECT COUNT(*) n FROM agent_issues WHERE title LIKE ?1 OR description LIKE ?1",[like]);
    const r=await q(env,"SELECT COUNT(*) n FROM roadmap_implementation WHERE item LIKE ?1 OR source LIKE ?1 OR title LIKE ?1 OR IFNULL(evidence,'') LIKE ?1 OR IFNULL(artifact_ref,'') LIKE ?1",[like]);
    const traced=(a[0].n>0||r[0].n>0)?1:0;
    const disp=(!traced&&d.up<CUTOFF)?("cluster:"+cluster(d.b,d.key)):null;
    await q(env,"INSERT OR IGNORE INTO doc_audit (bucket,key,size,uploaded,first_seen,last_seen,traced,disposition) VALUES (?1,?2,?3,?4,?5,?5,?6,?7)",[d.b,d.key,d.size,d.up,now,traced,disp]);
  }
  await q(env,"UPDATE doc_audit SET disposition=NULL WHERE traced=0 AND disposition LIKE 'cluster:%' AND substr(disposition,9) IN (SELECT predicate_id FROM agent_issues WHERE status IN ('closed','resolved','wontfix') AND predicate_id IS NOT NULL) AND substr(disposition,9) NOT IN (SELECT predicate_id FROM agent_issues WHERE status='open' AND predicate_id IS NOT NULL)");
  const unc=await q(env,"SELECT bucket,key FROM doc_audit WHERE traced=0 AND disposition IS NULL ORDER BY first_seen LIMIT "+MAX_LISTED);
  if(unc.length){
    const pid="DOC-ORPHAN-"+now.slice(0,13).replace(/[-T]/g,"");
    const desc="DOC-GATE-1 (qnfo-doc-gate): "+unc.length+" document(s) on R2 have no issue or roadmap trace. Implement each as code (worker, PR, probe) or retire with a recorded reason. Documents:\n"+unc.map(function(u){return u.bucket+":"+u.key;}).join("\n");
    const ex=await q(env,"SELECT id FROM agent_issues WHERE predicate_id=?1 LIMIT 1",[pid]);
    let id;
    if(ex.length) id=ex[0].id; else {
      const ins=await q(env,"INSERT INTO agent_issues (title,description,source,category,priority,status,created_at,updated_at,predicate_id) VALUES (?1,?2,'doc-gate','code-change','medium','open',?3,?3,?4) RETURNING id",[pid+": "+unc.length+" untraced R2 documents",desc,Date.now(),pid]);
      id=ins[0].id;
      await q(env,"INSERT INTO roadmap_implementation (item,source,title,artifact_type,status,evidence) VALUES (?1,'doc-gate',?2,'core','open',?3)",[pid,pid+": implement or retire "+unc.length+" untraced docs","issue "+id+"\n"+desc]);
    }
    for(const u of unc) await q(env,"UPDATE doc_audit SET disposition=?1 WHERE bucket=?2 AND key=?3",["issue:"+id,u.bucket,u.key]);
  }

  await q(env,"CREATE TABLE IF NOT EXISTS doc_gate_state (k TEXT PRIMARY KEY, v TEXT)");
  const hwr=await q(env,"SELECT v FROM doc_gate_state WHERE k='reply_hw'");
  const since=hwr.length?hwr[0].v:new Date(Date.now()-3*86400000).toISOString().slice(0,19).replace('T',' ');
  const nextHw=new Date(Date.now()-300000).toISOString().slice(0,19).replace('T',' ');
  const phr=await q(env,"SELECT phrase,pattern_key FROM false_stop_phrases WHERE pattern_key IN ('sole-safeguard','text-as-output') AND scope='reply'");
  for(const p of phr){
    const rows=await q(env,"SELECT source,reply_id,reply_ts,substr(body,1,200) AS ex FROM v_agent_replies WHERE reply_ts > ?2 AND lower(body) LIKE ?1 LIMIT 100",["%"+p.phrase+"%",since]);
    for(const x of rows) await q(env,"INSERT OR IGNORE INTO false_stop_hits (source,reply_id,reply_ts,pattern_key,phrase,excerpt) VALUES (?1,?2,?3,?4,?5,?6)",[x.source,String(x.reply_id),x.reply_ts,p.pattern_key,p.phrase,x.ex]);
  }
  await q(env,"INSERT OR REPLACE INTO doc_gate_state (k,v) VALUES ('reply_hw',?1)",[nextHw]);
  let lint=0;
  const hits=await q(env,"SELECT pattern_key, COUNT(*) AS n FROM false_stop_hits WHERE pattern_key IN ('sole-safeguard','text-as-output') AND ts > strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 day') GROUP BY 1");
  hits.forEach(function(h){lint+=h.n;});
  if(lint>0){
    const pid="LOOP-LINT-"+now.slice(0,10).replace(/-/g,"");
    const ex=await q(env,"SELECT id FROM agent_issues WHERE predicate_id=?1 LIMIT 1",[pid]);
    if(!ex.length){
      await q(env,"INSERT INTO agent_issues (title,description,source,category,priority,status,created_at,updated_at,predicate_id) VALUES (?1,?2,'doc-gate','code-change','high','open',?3,?3,?4)",[pid+": "+lint+" report(s) described a gap in prose instead of closing it in code",
        "LOOP-LINT-1 (qnfo-doc-gate): false_stop_hits in the last 24h: "+JSON.stringify(hits)+". For each hit, find the unenforced gap the text described and file or ship the code that closes it. Source rows: SELECT * FROM false_stop_hits WHERE pattern_key IN ('sole-safeguard','text-as-output') ORDER BY id DESC.",Date.now(),pid]);
    }
  }
  try{ await extractItems(env); await runChecks(env); }catch(e){ await q(env,"INSERT OR REPLACE INTO doc_gate_state (k,v) VALUES ('last_error',?1)",[String(e).slice(0,300)]); }
  const s=(await q(env,"SELECT COUNT(*) total, SUM(traced) traced, SUM(disposition LIKE 'cluster:%') clustered, SUM(traced=0 AND disposition IS NULL) orphans FROM doc_audit"))[0];
  await q(env,"INSERT INTO doc_gate_runs (ts,total,traced,clustered,orphans,new_docs,lint_hits,note) VALUES (?1,?2,?3,?4,?5,?6,?7,'ok')",[now,s.total,s.traced||0,s.clustered||0,s.orphans||0,newDocs,lint]);
  return {ts:now,total:s.total,traced:s.traced||0,clustered:s.clustered||0,orphans:s.orphans||0,new_docs:newDocs,lint_hits:lint};
}
export default {
  async scheduled(ev,env,ctx){ ctx.waitUntil(run(env)); },
  async fetch(req,env){
    const u=new URL(req.url);
    if(u.pathname==="/health"){
      return new Response(JSON.stringify({ok:true,worker:"qnfo-doc-gate",version:VERSION}),{headers:{"content-type":"application/json"}});
    }
    if(u.pathname==="/status"){
      const r=await q(env,"SELECT * FROM doc_gate_runs ORDER BY id DESC LIMIT 1");
      return new Response(JSON.stringify(r[0]||{}),{headers:{"content-type":"application/json"}});
    }
    return new Response("qnfo-doc-gate",{status:404});
  }
};
