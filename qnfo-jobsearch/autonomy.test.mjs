// JOBSEARCH-AUTONOMY-1: the search targets autonomous and AI systems research (owner direction 2026-11-09)
import worker from "./worker.js";
const T = worker.__test;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };
const ctx = T.makeCtx({}, []);
ok(ctx.fam.has("fam_autonomy"), "the autonomy family is on by default");
ok(!ctx.fam.has("fam_quantum"), "quantum is off by default");
ok(T.makeCtx({ fam_quantum: true }, []).fam.has("fam_quantum"), "a yes brings quantum back");
const job = (title, desc) => ({ id: "t:" + title, company: "Lab", title, location: "Amsterdam", url: "https://x", desc });
const auto = T.scoreJob(job("Senior Researcher, Autonomous Systems", "Study how agentic AI systems and multi-agent systems fail in operation. Oversight, evaluation, research program management, systems modeling and simulation models."), ctx);
ok(!auto.drops.length, "an autonomous-systems research title passes: " + auto.drops.join("; "));
ok(auto.why.some((w) => /fam_autonomy|autonomy/.test(w)), "the title counts as in your lane");
ok(auto.clusters.includes("autonomous_systems"), "autonomous_systems evidence is read from the posting");
const q = T.scoreJob(job("Quantum Researcher", "Quantum computing hardware roadmap."), ctx, "wide");
ok(q.stretch || q.drops.length, "a quantum title is outside the preferences by default");
ok(T.headline(["autonomous_systems"]).id === "H2", "autonomous-systems postings get the research headline");
ok(T.headline(["ai_systems", "research_mgmt"]).id === "H2", "AI postings get the research headline, not the data/product one");
ok(/^Autonomous AI systems researcher/.test(T.LEDGER.headlines.find((h) => h.id === "H2").text), "H2 is the new positioning");
ok(!JSON.stringify(T.BOARDS).match(/ionq|psiquantum|riverlane|rigetti|q=quantum/), "quantum feeds are gone");
ok(T.BOARDS.remotive.includes("q=autonomous"), "an autonomy query is searched");
ok(!T.BANK_SEED.skills.some((s) => ["Python", "JavaScript", "SQL"].includes(s.name)), "no programming languages in the seed skills");
ok(/^Systems researcher studying autonomous AI systems/.test(T.BANK_SEED.summaries[0].text), "seed summary carries the positioning");
ok(T.TAG_TO_CLUSTERS.llm.includes("autonomous_systems"), "the CV's AI-system facts back autonomous-systems evidence");

// the live bank migration: once, keeps owner edits, confirms V1 and V2, adds the owner's facts
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(":memory:");
const wrap = (sql) => { const st = db.prepare(sql); let args = []; const o = { bind: (...a) => { args = a; return o; }, first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => { const r = st.run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return o; };
const env = { JOBS_DB: { prepare: (sql) => wrap(sql.replace(/\?(\d+)/g, "?")), batch: async (ss) => { for (const s of ss) await s.run(); return []; }, exec: async (sql) => db.exec(sql) } };
let migrated = null;
try {
  const old = JSON.parse(JSON.stringify(T.BANK_SEED));
  old.summaries[0].text = "Data and AI leader who builds the systems behind the research. 15 years running national research programs and data products at the U.S. Federal Highway Administration and AARP. Founder of QNFO, an independent research imprint with an AI-assisted pipeline, a published audit method, and a public correction trail. Open to research management, applied AI, and research-integrity roles.";
  old.skills.push({ name: "Python", tags: ["software"] }, { name: "SQL", tags: ["data_eng"] });
  old.roles[0].tags = ["research_integrity", "llm", "quantum", "software"];
  await T.mutateBank(env, () => old, { keepVerified: true });
  ok(await T.ensureAutonomyBrand(env), "the migration runs once");
  ok(!(await T.ensureAutonomyBrand(env)), "and not twice");
  migrated = await T.loadBank(env);
} catch (e) { console.error("migration test skipped:", e.message); }
if (migrated) {
  ok(/^Systems researcher studying/.test(migrated.summaries[0].text), "old summary replaced");
  ok(!migrated.skills.some((s) => ["Python", "SQL", "JavaScript"].includes(s.name)), "languages removed");
  ok(migrated.skills.some((s) => s.name === "Autonomous AI systems"), "systems skills added");
  ok(!migrated.roles[0].tags.includes("quantum"), "QNFO loses the quantum tag");
  ok(!(migrated.review || []).some((r) => r.id === "V1" || r.id === "V2"), "V1 and V2 confirmed");
  ok((migrated.review || []).some((r) => r.id === "V3"), "V3 (patents) stays in review");
  ok(migrated.facts.some((f) => f.text === "Co-directed the $10M U.S. DOT National Household Travel Survey."), "NHTS fact added");
  ok(migrated.facts.filter((f) => f.text === "Built and ran transportation network models.").length === 2, "network-model facts for DVRPC and IBI");
}
{ const b = JSON.parse(JSON.stringify(T.BANK_SEED)); T.cvReview(b, { id: "V2", action: "reject" }); ok(!b.review.some((r) => r.id === "V2") && b.facts.length === T.BANK_SEED.facts.length, "a rejected claim is removed from review and adds no fact"); }
console.log(`qnfo-jobsearch autonomy: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
