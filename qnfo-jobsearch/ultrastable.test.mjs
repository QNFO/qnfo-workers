// JOBSEARCH-ULTRASTABLE-1 (owner, 2026-11-10): the Ultrastable founder role reaches the live bank once, and strategy roles that hire for systems thinking are in a lane
import worker from "./worker.js";
const T = worker.__test;
let fail=0; const ok=(c,m)=>{if(!c){fail++;console.error("FAIL",m)}else console.log("ok",m)};
const seed = JSON.parse(JSON.stringify(T.getBank()));
const b = T.ultrastableBank(JSON.parse(JSON.stringify(seed)));
ok(b.roles[0].id==="R00" && /Ultrastable/.test(b.roles[0].org),"role added");
ok(b.facts.filter(f=>f.role==="R00").length===3,"3 facts");
ok(/Ultrastable/.test(b.summaries[0].text),"summary");
const b2=T.ultrastableBank(JSON.parse(JSON.stringify(b)));
ok(b2.facts.length===b.facts.length && b2.roles.length===b.roles.length,"idempotent");
T.applyBank(b,1);
const owner = T.makeCtx({ loc_nl: true, loc_remote: true }, []);
const job=(title,desc)=>({id:"t:"+title,company:"Org",title,location:"Amsterdam, Netherlands",url:"https://x",desc});
for (const t of ["Founder in Residence, AI","Head of AI Strategy","Director of AI Transformation"]) {
 const r=T.scoreJob(job(t,"Lead our AI strategy and operating model for coding agents and agentic systems; governance and oversight of autonomous systems; 0 to 1 platform strategy with stakeholders across the organisation; evaluation of AI adoption."),owner,"wide");
 ok(!r.drops.length && r.families.includes("fam_strategy"), t+" "+r.score+" "+r.tier+" "+r.drops.join(";"));
}
ok(T.linkedinSearches(owner).searches.some(s=>s.id==="strategy"),"linkedin strategy search");
{ const r = T.buildResume ? T.buildResume(job("Head of AI Strategy","AI strategy, agentic systems, governance, oversight, operating model, coding agents"), owner) : null;
  const txt = typeof r === "string" ? r : JSON.stringify(r || "");
  ok(!T.buildResume || /Ultrastable/.test(txt), "a tailored CV names Ultrastable"); }
process.exit(fail?1:0);
