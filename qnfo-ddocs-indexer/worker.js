// qnfo-ddocs-indexer v1.0 — server-side QNFO D-drive document vectorizer (2026-09-04)
// Directive: ALL vectorize/RAG server-side + automated on Cloudflare; never local.
// Plane: QNFO only (R2 qnfo-ddocs bucket -> Vectorize qnfo-ddocs). Personal plane is
// served by personal-life-indexer (separate worker, never commingled).
// Embedding: @cf/baai/bge-base-en-v1.5 (free/low-cost) via AI Gateway 'default'
// ($90/30d sliding cost limit binds). Auth: X-Index-Token. Dedup: content-hash in
// AUDIT.ddocs_index_state. Id: sha256(rel#chunk)[:40] deterministic/overwrite-safe.

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBED_BATCH = 24;
const VZ_BATCH = 100;
const DEFAULT_LIMIT = 30;
const TEXT_EXTS = new Set(["md","txt","csv","tsv","json","html","htm","xml","yaml","yml","tex","bib","mermaid","log","ini","cfg","conf","rtf","mdx","markdown"]);
const SKIP_FRAG = ["node_modules","/.git/",".wrangler/","/dist/","/build/","/.obsidian/workspace","desktop.ini","_manifests/"];

async function sha256hex(str){const enc=new TextEncoder().encode(str);const buf=await crypto.subtle.digest("SHA-256",enc);return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function sanitize(s){return String(s||"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF]/g,"").trim().slice(0,800);}
function extOf(key){const i=key.lastIndexOf(".");return i>=0?key.slice(i+1).toLowerCase():"";}
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
  const prefix=env.DDOC_PREFIX||"2026-09-04";
  if(!key.startsWith(prefix+"/"))return {key,skipped:true,reason:"wrong_prefix"};
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
  const rel=key.slice(prefix.length+1);
  const chunks=chunkText(text);
  if(!chunks.length)return {key,skipped:true,reason:"no_chunks"};
  const vectors=[];
  for(let i=0;i<chunks.length;i+=EMBED_BATCH){
    const batch=chunks.slice(i,i+EMBED_BATCH);
    const result=await env.AI.run(EMBED_MODEL,{text:batch},{gateway:{id:"default"}});
    for(let j=0;j<batch.length;j++){
      const idx=i+j;
      const id=(await sha256hex(rel+"#"+idx)).slice(0,40);
      vectors.push({id,values:result.data[j],metadata:{path:rel,bucket:"qnfo-ddocs",plane:"qnfo",ext,chunk:String(idx),total:String(chunks.length),src:"ddocs-indexer-v1",r2key:key}});
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
  const prefix=url.searchParams.get("prefix")||(env.DDOC_PREFIX||"2026-09-04")+"/";
  let cursor=url.searchParams.get("cursor")||undefined;
  let done=0,skipped=0,errors=0,chunksTotal=0,nextCursor=null,scanned=0;
  while(done+skipped<limit){
    const listed=await env.DDOCS.list({prefix,cursor,limit:Math.min(100,limit-done-skipped+20)});
    if(!listed.objects.length)break;
    scanned+=listed.objects.length;
    for(const o of listed.objects){
      if(done+skipped>=limit)break;
      try{const r=await processObject(env,o.key);if(r.indexed){done++;chunksTotal+=r.chunks;}else{skipped++;}}
      catch(e){errors++;skipped++;}
    }
    cursor=listed.truncated?listed.cursor:undefined;
    nextCursor=cursor||null;
    if(!listed.truncated)break;
    if(scanned>limit*6)break;
  }
  return json({success:true,batch:{indexed:done,skipped,errors,chunks:chunksTotal},scanned,nextCursor,cursor:url.searchParams.get("cursor")||null});
}

async function handleStats(env){
  const st=await env.AUDIT.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(chunks),0) AS chunks FROM ddocs_index_state").first();
  const un=await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM ddocs_index_state WHERE error!=0").first();
  return json({success:true,indexed:st?st.n:0,chunks:st?st.chunks:0,errors:un?un.n:0,worker:"qnfo-ddocs-indexer"});
}

export default {
  async scheduled(event,env,ctx){
    await ensureStateTable(env);
    ctx.waitUntil(handleIndex(env,new URL("https://qnfo-ddocs-indexer.q08.workers.dev/index?limit="+DEFAULT_LIMIT)));
  },
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({ok:true,worker:"qnfo-ddocs-indexer",index:"qnfo-ddocs",version:"v1.0-server-side",bindings:{ai:!!env.AI,r2:!!env.DDOCS,vz:!!env.DDOC_VZ,d1:!!env.AUDIT}});
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
