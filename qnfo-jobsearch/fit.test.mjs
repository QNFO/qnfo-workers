// JOBSEARCH-FIT-1 and JOBSEARCH-LINKEDIN-1 (owner, 2026-11-09): show roles a senior systems researcher gets, not coding roles; tell the owner what to search on LinkedIn
import worker from "./worker.js";
const T = worker.__test;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const owner = T.makeCtx({ loc_nl: true, loc_remote: true, loc_eu: false, loc_us: false, loc_world: false }, []);
const job = (title, desc, location = "Amsterdam, Netherlands") => ({ id: "t:" + title, company: "Org", title, location, url: "https://x", desc });
const wide = (j) => T.scoreJob(j, owner, "wide");
const CODE = "You will write production code in Python, use PyTorch, review pull requests and own the codebase; 5+ years of software engineering experience.";
// the roles the owner applied to and was rejected from (live record, 2026-11-09)
for (const t of ["Senior Applied AI Engineer, Autonomous Supply Chains", "Applied AI Engineer, Government", "Senior Data Engineer", "Member of Technical Staff, Cortex Lab (applied AI research)", "AI/ML Engineer", "Software/Data Engineer"])
  ok(wide(job(t, CODE + " agentic systems evaluation")).drops.length, "coding title is dropped: " + t);
ok(wide(job("Staff Applied AI Researcher (Agentic Search)", CODE + " agentic systems evaluation research")).drops.some((d) => /coding-heavy/.test(d)), "a research title that asks for heavy coding is dropped as coding-heavy");
const light = wide(job("Senior Researcher, AI Evaluation", "Lead evaluation research on agentic AI systems. Familiarity with PyTorch helps. Code review of analysis notebooks. Oversight, audit, policy research, stakeholders, government."));
ok(!light.drops.length && light.flags.some((f) => /^CODING/.test(f)), "a little coding is a flag and a penalty, not a drop");
// target roles score high
for (const t of ["Senior AI Governance Lead", "Head of AI Risk and Assurance", "Principal Researcher, Autonomous Systems", "Lead, Simulation and Network Modelling", "Research Program Manager, AI", "Senior Decision Scientist"]) {
  const r = wide(job(t, "Lead research on how AI systems and autonomous systems behave and fail; governance, oversight, audit and evaluation; simulation models, network models and decision support for government; research program management and stakeholders."));
  ok(!r.drops.length && r.tier === "A", `target role is tier A: ${t} (${r.score}, ${r.drops.join("; ")})`);
  ok(r.families.includes("fam_autonomy") || r.families.includes("fam_ai") || r.families.includes("fam_sysmodel") || r.families.includes("fam_research"), "the title is read as a target lane: " + t);
}
// places the owner said no to never appear, not even as a stretch
ok(wide(job("Senior AI Governance Lead", "AI governance policy research oversight audit", "Mountain View, CA, USA")).drops.length, "US on-site is dropped when the owner said No to the US");
ok(wide(job("Senior AI Governance Lead", "AI governance policy research oversight audit", "Remote - Greece")).drops.length, "remote in another EU country is dropped when the owner said No to Europe");
ok(!wide(job("Senior AI Governance Lead", "AI governance policy research oversight audit", "Remote - Europe")).drops.length, "remote Europe stays");
// coding roles come back only on an explicit yes
ok(!owner.fam.has("fam_tech") && T.makeCtx({ fam_tech: true }, []).fam.has("fam_tech"), "hands-on coding roles are opt-in");
ok(T.SURVEY.some((q) => q[0] === "fam_sysmodel" && q[3] === true), "systems modelling family is on by default");
ok(T.codingLoad(CODE).n >= 4 && T.codingLoad("Lead policy research and stakeholder engagement.").n === 0, "codingLoad counts hands-on code asks");
// feedback chip
const fb = T.makeCtx({}, [{ verdict: "dislike", title: "Applied AI Scientist", company: "A", reason: "coding" }, { verdict: "dislike", title: "Applied AI Scientist", company: "B", reason: "coding" }]);
ok(fb.learned.block.has("applied"), "a 'Too much coding' answer teaches the title words twice as hard");
// LinkedIn searches
const li = T.linkedinSearches(owner);
ok(li.searches.length >= 6 && li.searches.every((s) => s.q && s.label && s.why), "every LinkedIn search has words, a label and the reason it fits");
ok(li.searches.every((s) => s.links.length === 2 && s.links.every((l) => /^https:\/\/www\.linkedin\.com\/jobs\/search\/\?keywords=/.test(l.linkedin) && /f_E=4%2C5%2C6/.test(l.linkedin) && /f_TPR=r604800/.test(l.linkedin))), "LinkedIn links: Netherlands and remote Europe, senior levels, last week");
ok(!li.searches.some((s) => s.links.some((l) => /United%20States/.test(l.linkedin))), "no US search when the owner said No to the US");
ok(li.searches.every((s) => /site%3Alinkedin\.com%2Fjobs%2Fview/.test(s.links[0].google)), "a Google fallback restricted to LinkedIn job pages");
ok(!JSON.stringify(li).match(/quantum|software engineer|developer role/i), "no quantum or engineer framing in the searches");
// sources
ok(typeof T.FETCHERS.workable === "function" && T.feedPrefix("workable:tno") === "wk:tno:", "Workable boards are read");
ok(Object.values(T.CANDIDATE_BOARDS).flat().length === 0, "candidate board probing is retired after live slugs were promoted");
ok(T.BOARDS.workable.includes("rand-europe") && T.BOARDS.greenhouse.includes("thoughtworks") && T.BOARDS.ashby.includes("meter"), "live candidate slugs moved into BOARDS");
{ // a failing candidate board is silent: no error, no feed result
  T.CANDIDATE_BOARDS.workable = ["dead-slug"];
  const orig = T.FETCHERS.workable; T.FETCHERS.workable = async () => { throw new Error("HTTP 404"); };
  const r = await T.collectAndRank(owner, ["candidates"]);
  ok(r.errors.length === 0 && r.feedResults.length === 0, "candidate failures never count as feed outages");
  T.FETCHERS.workable = orig;
  delete T.CANDIDATE_BOARDS.workable;
}
console.log(`qnfo-jobsearch fit: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
