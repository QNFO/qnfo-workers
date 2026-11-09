var VERSION = "1.0.2";
// WORKER-SOURCE-IN-REPO-1 (issue 9663): tracked copy of the deployed script, plus /health.
const URLS=["https://me.q08.org/"];
async function q(env,sql,params){
  for(let t=0;t<3;t++){
    try{ const st=env.DB.prepare(sql); const r=await (params&&params.length?st.bind(...params):st).all(); return r.results||[]; }
    catch(e){ if(t===2) throw e; await new Promise(function(r){setTimeout(r,300*(t+1));}); }
  }
}
async function probe(env){
  await q(env,"CREATE TABLE IF NOT EXISTS companion_probe_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, url TEXT, status INTEGER, len INTEGER, title TEXT, ids_total INTEGER, ids_missing INTEGER, ok INTEGER, reason TEXT)");
  await q(env,"CREATE TABLE IF NOT EXISTS companion_baseline (url TEXT PRIMARY KEY, title TEXT, len INTEGER, ids TEXT, captured_at TEXT)");
  try{ await q(env,"ALTER TABLE companion_baseline ADD COLUMN texts TEXT"); }catch(e){ console.error(JSON.stringify({worker:"qnfo-companion-guard",step:"add-texts-column",error:String(e).slice(0,120)})); }
  const now=new Date().toISOString();
  const res=[];
  for(const url of URLS){
    let status=0, html="", err="";
    try{ const r=await fetch(url,{redirect:"follow",headers:{"user-agent":"qnfo-companion-guard/1"}}); status=r.status; html=await r.text(); }catch(e){ err=String(e).slice(0,120); }
    const tm=html.match(/<title[^>]*>([^<]*)/i); const title=tm?tm[1].trim():"";
    const ids=[]; const re=/\sid="([^"]{1,60})"/g; let m;
    while((m=re.exec(html))!==null){ if(ids.indexOf(m[1])<0&&ids.length<80) ids.push(m[1]); }
    const texts=[]; const tre=/<(?:button|h[1-3]|label|a|summary|option)\b[^>]*>([^<]{2,60})</gi; let tm2;
    while((tm2=tre.exec(html))!==null){ const t=tm2[1].replace(/\s+/g," ").trim(); if(t.length>=2&&texts.indexOf(t)<0&&texts.length<80) texts.push(t); }
    const base=await q(env,"SELECT * FROM companion_baseline WHERE url=?1",[url]);
    const reasons=[]; let missing=[];
    if(status!==200){ reasons.push("status "+status+(err?" "+err:"")); }
    else if(!base.length){
      await q(env,"INSERT INTO companion_baseline (url,title,len,ids,captured_at) VALUES (?1,?2,?3,?4,?5)",[url,title,html.length,JSON.stringify(ids),now]);
    } else {
      const b=base[0]; const bids=JSON.parse(b.ids||"[]");
      missing=bids.filter(function(i){return ids.indexOf(i)<0;});
      if(html.length<0.6*b.len) reasons.push("length "+html.length+" vs baseline "+b.len);
      if(title!==b.title) reasons.push("title '"+title+"' vs baseline '"+b.title+"'");
      if(bids.length&&missing.length/bids.length>0.1) reasons.push("ids missing: "+missing.slice(0,8).join(","));
      const btexts=b.texts?JSON.parse(b.texts):[];
      const tmiss=btexts.filter(function(t){return texts.indexOf(t)<0;});
      if(btexts.length&&tmiss.length/btexts.length>0.1) reasons.push("ui text missing: "+tmiss.slice(0,6).join(" | "));
      if(reasons.length===0){
        const merged=bids.slice(); ids.forEach(function(i){ if(merged.indexOf(i)<0&&merged.length<120) merged.push(i); });
        await q(env,"UPDATE companion_baseline SET ids=?1, len=?2 WHERE url=?3",[JSON.stringify(merged),Math.max(b.len,html.length),url]);
        const mt=b.texts?JSON.parse(b.texts):[]; texts.forEach(function(t){ if(mt.indexOf(t)<0&&mt.length<150) mt.push(t); });
        await q(env,"UPDATE companion_baseline SET texts=?1 WHERE url=?2",[JSON.stringify(mt),url]);
      }
    }
    const ok=reasons.length===0?1:0;
    await q(env,"INSERT INTO companion_probe_runs (ts,url,status,len,title,ids_total,ids_missing,ok,reason) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",[now,url,status,html.length,title,ids.length,missing.length,ok,reasons.join("; ")]);
    if(!ok){
      const pid="COMPANION-REGRESSION-"+now.slice(0,13).replace(/[-T]/g,"");
      const ex=await q(env,"SELECT id FROM agent_issues WHERE predicate_id=?1 LIMIT 1",[pid]);
      if(!ex.length) await q(env,"INSERT INTO agent_issues (title,description,source,category,priority,status,created_at,updated_at,predicate_id) VALUES (?1,?2,'companion-guard','code-change','high','open',?3,?3,?4)",[pid+": "+url+" failed the regression probe","COMPANION-REGRESSION-GATE-1 (qnfo-companion-guard): "+reasons.join("; ")+". Compare companion_probe_runs and companion_baseline in qnfo-audit D1, restore the previous worker version if the UI regressed, then ship a fix with a test that covers it.",Date.now(),pid]);
    }
    res.push({url:url,status:status,len:html.length,ok:ok,reasons:reasons});
  }
  return res;
}
export default {
  async scheduled(ev,env,ctx){ ctx.waitUntil(probe(env)); },
  async fetch(req,env){
    const u=new URL(req.url);
    if(u.pathname==="/health"){
      return new Response(JSON.stringify({ok:true,worker:"qnfo-companion-guard",version:VERSION}),{headers:{"content-type":"application/json"}});
    }
    if(u.pathname==="/status"){
      const r=await q(env,"SELECT * FROM companion_probe_runs ORDER BY id DESC LIMIT 1");
      return new Response(JSON.stringify(r[0]||{}),{headers:{"content-type":"application/json"}});
    }
    return new Response("qnfo-companion-guard",{status:404});
  }
};
