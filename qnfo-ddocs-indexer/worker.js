// qnfo-ddocs-indexer v1.1 — server-side QNFO D-drive document vectorizer
// Directive: ALL vectorize/RAG server-side + automated on Cloudflare; never local.
// Plane: QNFO only (R2 qnfo-ddocs bucket -> Vectorize qnfo-ddocs). Personal plane is
// served by personal-life-indexer (separate worker, never commingled).
// Embedding: @cf/baai/bge-base-en-v1.5 (free/low-cost) via AI Gateway 'default'
// ($90/30d sliding cost limit binds). Auth: X-Index-Token. Dedup: content-hash in
// AUDIT.ddocs_index_state. Id: sha256(rel#chunk)[:40] deterministic/overwrite-safe.
//
// v1.1-rolling-prefix (2026-09-13, ops-endpoint session). STRUCTURAL STALL FIXED.
//   v1.0 pinned the bucket prefix to a literal date:
//     handleIndex: const prefix = url.searchParams.get("prefix") || (env.DDOC_PREFIX || "2026-09-04") + "/";
//     processObject: const prefix = env.DDOC_PREFIX || "2026-09-04"; ... reason:"wrong_prefix"
//   The scheduled handler invokes /index?limit=30 with NO prefix param, so every run
//   listed only the key range "2026-09-04/" and rejected every later object as
//   wrong_prefix. The worker fired continuously but could never see a newer document.
//   EVIDENCE (read-only D1, 2026-09-13 ~14:2xZ):
//     SELECT COUNT(*), MAX(indexed_at) FROM ddocs_index_state;
//       -> n=1, indexed_at=2026-09-04T09:57:49   (the worker's own creation day)
//     worker_activity_daily: qnfo-ddocs-indexer req24 = 10..27/day on 09-10..09-13
//   So: firing every hour, one row of output ever, nine days stale.
//   FIX: prefixes now come from a rolling UTC window (last 7 days) when DDOC_PREFIX is
//   unset, and `rel` is derived from the key's own leading YYYY-MM-DD segment rather
//   than assuming a single pinned prefix. An explicit ?prefix= still overrides. Dedup
//   by content hash is unchanged, so repeat scans of the same window stay cheap.
//   NOTE: this is a source fix. It only takes effect on redeploy; the canonical R2
//   object must be refreshed from this repo for the deploy transport to pick it up.

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH = 24;
const VZ_BATCH = 100;
const DEFAULT_LIMIT = 30;
const ROLLING_DAYS = 7;
const TEXT_EXTS = new Set(["md","txt","csv","tsv","json","html","htm","xml","yaml","yml","tex","bib","mermaid","log","ini","cfg","conf","rtf","mdx","markdown"]);
const SKIP_FRAG = ["node_modules","/.git/",".wrangler/","/dist/","/build/","/.obsidian/workspace","desktop.ini","_manifests/"];

async function sha256hex(str){const enc=new TextEncoder().encode(str);const buf=await crypto.subtle.digest("SHA-256",enc);return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function sanitize(s){return String(s||"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF]/g,"").trim().slice(0,800);}
function extOf(key){const i=key.lastIndexOf(".");return i>=0?key.slice(i+1).toLowerCase():"";}

// UTC date string, offsetDays back from now. Deterministic per invocation.
function utcDate(offsetDays){
  const d=new Date(Date.now()+(offsetDays||0)*86400000);
  return d.toISOString().slice(0,10);
}

// Prefixes to scan this run. Explicit DDOC_PREFIX wins (comma-separated allowed);
// otherwise a rolling window of the last ROLLING_DAYS UTC dates.
function datePrefixes(env){
  if(env.DDOC_PREFIX){
    return String(env.DDOC_PREFIX).split(",").map(s=>s.trim()).filter(Boolean);
  }
  const out=[];
  for(let i=0;i<ROLLING_DAYS;i++)out.push(utcDate(-i));
  return out;
}

function chunkText(text){
  const chunks=[];let start=0;const clean=text.replace(/\r\n/g,"\n").replace(/[ \t]+/g," ").trim();const n=clean.length;
  if(n<60)return chunks;
  while(start<n){
    let end=Math.min(start+CHUNK_SIZE,n);
    if(end<n){const p=clean.lastIndexOf(".",end);if(p>start+CHUNK_SIZE/2)end=p+1;}
    const chunk=clean.slice(start,end).trim();
    if(chunk.length>=40)chunks.push(chunk);
    if(end>=n)break;
    start=end-CHUNK_OVERLAP;if(start<0)start=0;
  }
  return chunks;
}
function json(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});}

async function ensureStateTable(env){
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS ddocs_index_state (rkey TEXT PRIMARY KEY, hash TEXT, chunks INTEGER, indexed_at TEXT, error INTEGER DEFAULT 0)").run();
}

async function processObject(env,key){
  // Derive the date segment from the key itself. No pinned prefix: an object is
  // eligible if its key begins with a YYYY-MM-DD/ segment.
  const m=/^(\d{4}-\d{2}-\d{2})\/(.+)$/.exec(key);
  if(!m)return {key,skipped:true,reason:"no_date_prefix"};
  const rel=m[2];
  if(SKIP_FRAG.some(f=>key.includes(f)))return {key,skipped:true,reason:"skip_fragment"};
  const ext=extOf(key);
  if(!TEXT_EXTS.has(ext))return {key,skipped:true,reason:"not_text"};
  const obj=await env.DDOCS.get(key);
  if(!obj||obj.size>4*1024*1024)return {key,skipped:true,reason:obj?"too_large":"missing"};
  const buf=await obj.arrayBuffer();
  const text=new TextDecoder("utf-8",{fatal:false}).decode(buf);
  if(!text||text.trim().length<60)return {key,skipped:true,reason:"empty"};
  const hash=await sha256hex(text);
  const prev=await env.AUDIT.prepare("SELECT hash FROM ddocs_index_state WHERE rkey=?1").bind(key).first();
  if(prev&&prev.hash===hash)return {key,skipped:true,reason:"unchanged"};
  const chunks=chunkText(text);
  if(!chunks.length)return {key,skipped:true,reason:"no_chunks"};
  const vectors=[];
  for(let i=0;i<chunks.length;i+=EMBED_BATCH){
    const batch=chunks.slice(i,i+EMBED_BATCH);
    const result=await env.AI.run(EMBED_MODEL,{text:batch},{gateway:{id:"default"}});
    for(let j=0;j<batch.length;j++){
      const idx=i+j;
      const id=(await sha256hex(rel+"#"+idx)).slice(0,40);
      vectors.push({id,values:result.data[j],metadata:{path:rel,bucket:"qnfo-ddocs",plane:"qnfo",ext,chunk:String(idx),total:String(chunks.length),src:"ddocs-indexer-v1.1",r2key:key}});
    }
  }
  for(let i=0;i<vectors.length;i+=VZ_BATCH){
    await env.DDOC_VZ.upsert(vectors.slice(i,i+VZ_BATCH));
  }
  await env.AUDIT.prepare("INSERT OR REPLACE INTO ddocs_index_state (rkey,hash,chunks,indexed_at,error) VALUES (?1,?2,?3,datetime('now'),0)").bind(key,hash,chunks.length).run();
  return {key,indexed:true,chunks:chunks.length};
}

async function handleIndex(env,url){
  const limit=Math.min(Number(url.searchParams.get("limit")||DEFAULT_LIMIT)||DEFAULT_LIMIT,200);
  const explicit=url.searchParams.get("prefix");
  const prefixes=explicit?[explicit]:datePrefixes(env);
  let done=0,skipped=0,errors=0,chunksTotal=0,scanned=0;
  const scannedPrefixes=[];
  for(const p of prefixes){
    if(done+skipped>=limit)break;
    scannedPrefixes.push(p);
    let pcursor=undefined;
    for(;;){
      const listed=await env.DDOCS.list({prefix:p+"/",cursor:pcursor,limit:Math.min(100,limit-done-skipped+20)});
      if(!listed.objects.length)break;
      scanned+=listed.objects.length;
      for(const o of listed.objects){
        if(done+skipped>=limit)break;
        try{const r=await processObject(env,o.key);if(r.indexed){done++;chunksTotal+=r.chunks;}else{skipped++;}}
        catch(e){errors++;skipped++;}
      }
      pcursor=listed.truncated?listed.cursor:undefined;
      if(!listed.truncated)break;
      if(scanned>limit*6)break;
    }
    if(scanned>limit*6)break;
  }
  return json({success:true,batch:{indexed:done,skipped,errors,chunks:chunksTotal},scanned,scannedPrefixes,nextCursor:null,cursor:url.searchParams.get("cursor")||null});
}

async function handleStats(env){
  const st=await env.AUDIT.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(chunks),0) AS chunks, MAX(indexed_at) AS newest FROM ddocs_index_state").first();
  const un=await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM ddocs_index_state WHERE error!=0").first();
  return json({success:true,indexed:st?st.n:0,chunks:st?st.chunks:0,errors:un?un.n:0,newest:st?st.newest:null,worker:"qnfo-ddocs-indexer",version:"v1.1-rolling-prefix"});
}

export default {
  async scheduled(event,env,ctx){
    await ensureStateTable(env);
    ctx.waitUntil(handleIndex(env,new URL("https://qnfo-ddocs-indexer.q08.workers.dev/index?limit="+DEFAULT_LIMIT)));
  },
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({ok:true,worker:"qnfo-ddocs-indexer",index:"qnfo-ddocs",version:"v1.1-rolling-prefix",bindings:{ai:!!env.AI,r2:!!env.DDOCS,vz:!!env.DDOC_VZ,d1:!!env.AUDIT}});
    if(url.pathname==="/index"||url.pathname==="/stats"){
      const token=request.headers.get("X-Index-Token")||(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
      if(token!==env.INDEX_TOKEN)return json({error:"unauthorized"},401);
    }
    try{
      await ensureStateTable(env);
      if(url.pathname==="/index")return await handleIndex(env,url);
      if(url.pathname==="/stats")return await handleStats(env);
      return json({error:"not found"},404);
    }catch(e){return json({error:"EXCEPTION",detail:e.message},500);}
  }
};
