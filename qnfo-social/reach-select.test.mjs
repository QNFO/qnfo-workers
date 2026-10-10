// REACH-SELECT-1 + REACH-REFILL-1 offline suite (qnfo-social 0.7.34, pillar reach). The fleet composes and queues social
// threads without asking, so this locks what it may pick:
//   - eligibility: STRATEGY 2.4 selected works and pillar 1-3 titles yes; pillar 4 / speculative theory no (real titles from
//     the 2026-10-03 scan); the selected-works DOIs equal the STRATEGY.md 2.4 table;
//   - refill: nothing while the queue holds REFILL_MIN_QUEUE; otherwise the selected work with the most Zenodo views and no
//     thread in 30 days, composed and checked, queued as a selected post, or held as a draft when the checker objects;
//   - the checker's ground truth carries the author and the link (7 of 11 drafts were held for "invented author name");
//   - the scan spends no AI on an ineligible paper and records it as suppressed; the sweep suppresses ineligible drafts;
//   - the recheck and the drain carry the same gate.
// Run: node qnfo-social/reach-select.test.mjs   -> prints "N failure(s)"
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const strategy = readFileSync(new URL("../docs/STRATEGY.md", import.meta.url), "utf8");
const dir = mkdtempSync(join(tmpdir(), "rs-"));
writeFileSync(join(dir, "w.mjs"), src + "\nexport { reachEligible, reachDenied, pickRefill, reachRefill, reachSweepDrafts, reachRepairDrafts, REACH_SELECTED, REFILL_MIN_QUEUE, checkThread };\n");
const W = await import(join(dir, "w.mjs"));
let fails = 0, passes = 0;
const ok = (c, m, x) => { if (c) passes++; else { fails++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

// ---- eligibility on real titles ----
const no = [
  ["ULTRAMETRIC PHYSICS: RESEARCH PLAN", "10.5281/zenodo.22758467"],
  ["Braid Group Representations, Modular Data, and the Classification of Anyons", "10.5281/zenodo.23086421"],
  ["The p-Adic Temperley-Lieb Parameter: Valuation-Theoretic Constraints", "10.5281/zenodo.23104598"],
  ["Holographic Quantum Error Correction as AdS/CFT Renormalization", "10.5281/zenodo.23107746"],
  ["The q-Generalized Diameter: Scaling Exponents for Arbitrary Ultrametric Ratio", "10.5281/zenodo.23100544"],
  ["Optimal Radix q under Resource Constraints: A Reconciled Derivation", "10.5281/zenodo.23101549"],
  ["Geometric Ratios as Generators of Hierarchical Structure: An Arithmetic Audit", "10.5281/zenodo.23097730"],
  ["A General Theory of Process: Unifying Physics, Intelligence, and Topology", "10.5281/zenodo.18299167"],
  ["Fine-Structure Constant as a Cross-Ratio: A Geometric Reframing of alpha", "10.5281/zenodo.20108536"],
  ["The Qubit Delusion: How Particle Ontology Sabotaged Quantum Computing", "10.5281/zenodo.21254143"],
  ["Why Vertices, Not Points? Vertex-Anchored Braiding", "10.5281/zenodo.23093675"]
];
for (const [t, d] of no) ok(!W.reachEligible(t, "", d).ok, "not eligible: " + t);
const yes = [
  ["Thermodynamic Trade-off Frontiers for Neuromorphic Processors", "10.5281/zenodo.23105375"],
  ["Thermodynamic Imperative: Why Colder Isn't Better for Quantum Scalability", "10.5281/zenodo.17928157"],
  ["Scientific Validity Assessment Toolkit (SVAT): Framework for Epistemic Rigor", "10.5281/zenodo.17170021"]
];
for (const [t, d] of yes) ok(W.reachEligible(t, "A unified framework for measuring energy.", d).ok, "eligible: " + t);
ok(!W.reachEligible("Energy budgets of computation", "We use p-adic analysis throughout.", "10.5281/zenodo.1").ok, "an unambiguous pillar-4 term in the abstract suppresses");
ok(!W.reachEligible("On the nature of things", "", "10.5281/zenodo.2").ok && /no pillar 1-3 signal/.test(W.reachEligible("On the nature of things", "", "x").reason), "no pillar signal: not eligible, with the reason");
const sel = W.reachEligible("Operating the Quniverse Fleet", "", "10.5281/zenodo.23079905");
ok(sel.ok && /selected work 7/.test(sel.reason), "a selected work is eligible whatever its title", sel);
ok(W.reachEligible("Universal ontology of things", "", "10.5281/zenodo.21901984").ok, "selection wins over a deny term");

// (NOZ-DOI-1: STRATEGY 2.4 no longer lists identifiers, so the table-vs-worker comparison was retired.)

// pickRefill
const D = (n) => W.REACH_SELECTED[n - 1].doi;
ok(W.pickRefill({}, {}).n === 1, "no views: STRATEGY order");
ok(W.pickRefill({}, { [D(3)]: 50, [D(2)]: 120 }).n === 2, "most Zenodo views first");
ok(W.pickRefill({ [D(2)]: 1 }, { [D(3)]: 50, [D(2)]: 120 }).n === 3, "a work with a recent thread is skipped");
ok(W.pickRefill(Object.fromEntries(W.REACH_SELECTED.map((w) => [w.doi, 1])), {}) === null, "every work recent: nothing to refill");

// ---- D1 + stubs ----
function mkdb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), retry_count INTEGER DEFAULT 0, error TEXT, doi TEXT, abstract TEXT, flags TEXT, notes TEXT, updated_at TEXT, post_uri TEXT);
  CREATE TABLE zenodo_stats (doi TEXT PRIMARY KEY, views INTEGER);
  CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, level TEXT, message TEXT);
  CREATE TABLE scan_state (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE dissemination_tracker (id INTEGER PRIMARY KEY AUTOINCREMENT, paper_doi TEXT, action TEXT, channel TEXT, posted_at TEXT, created_at TEXT);`);
  const D1 = { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } };
  return { db, D1 };
}
const calls = [];
let checkerReply = "[]";
const AI = { async run(model, input) {
  const c = input.messages[0].content;
  calls.push(c);
  if (/^Given a paper/.test(c)) return { response: checkerReply };
  return { response: ["A hook about energy per answer.", "The claim in plain words.", "Why it matters.", "How to check it.", "By Rowan Brad Quni-Gudzinas: https://doi.org/x What do you think?"].join("\n") };
} };
const zen = (id, title) => ({ id: Number(id), doi: "10.5281/zenodo." + id, created: "2026-10-03T06:00:00+00:00", metadata: { title, description: "<p>We measure the energy cost of computation and propose a protocol.</p>" } });
globalThis.fetch = async (url) => {
  const u = String(url);
  let m = u.match(/zenodo\.org\/api\/records\/(\d+)$/);
  if (m) return new Response(JSON.stringify({ metadata: { title: "Selected work " + m[1], description: "<p>Abstract of work " + m[1] + ".</p>" } }), { status: 200 });
  if (/zenodo\.org\/api\/records\?/.test(u)) return new Response(JSON.stringify({ hits: { hits: [zen("23104598", "The p-Adic Temperley-Lieb Parameter"), zen("23105375", "Thermodynamic Trade-off Frontiers for Neuromorphic Processors")] } }), { status: 200 });
  return new Response("nope", { status: 404 });
};

// refill: queue full -> nothing
{
  const { db, D1 } = mkdb();
  db.exec("INSERT INTO social_threads (slug, status) VALUES ('a','queued'),('b','queued')");
  calls.length = 0;
  const r = await W.reachRefill({ DB: D1, AI });
  ok(r.refilled === 0 && r.queued === 2 && calls.length === 0, "queue holds REFILL_MIN_QUEUE: no compose, no AI call", r);
}
// refill: empty queue -> highest-views selected work without a recent thread, queued as selected
{
  const { db, D1 } = mkdb();
  db.exec(`INSERT INTO zenodo_stats VALUES ('${D(2)}', 134), ('${D(3)}', 90), ('${D(5)}', 400);
  INSERT INTO social_threads (slug, doi, status, posted_at) VALUES ('old5','${D(5)}','posted', datetime('now','-3 days'));`);
  calls.length = 0; checkerReply = "[]";
  const r = await W.reachRefill({ DB: D1, AI }, Date.parse("2026-10-03T06:00:00Z"));
  const row = db.prepare("SELECT * FROM social_threads WHERE slug LIKE 'refill-%'").get();
  ok(r.refilled === 1 && r.work === 2 && r.status === "queued", "picks work 2 (most views; work 5 posted 3 days ago)", r);
  ok(row && row.slug === "refill-22261547-20261003" && row.doi === D(2) && row.flags === "selected" && /^selected: REACH-REFILL-1 STRATEGY 2\.4 work 2/.test(row.notes), "row queued as a selected post with its reason", row);
  ok(JSON.parse(row.posts).length === 5 && calls.length === 2, "one compose and one check", calls.length);
  const chk = calls.find((c) => /^Given a paper/.test(c));
  ok(/"author":"Rowan Brad Quni-Gudzinas"/.test(chk) && /"link":"https:\/\/doi\.org\/10\.5281\/zenodo\.22261547"/.test(chk) && /naming the author or giving the link is never an issue/.test(chk), "checker ground truth carries the author and the link");
  const comp = calls.find((c) => /^Write a 5-post/.test(c));
  ok(/Never call the paper new, first, novel or recent/.test(comp) && /https:\/\/doi\.org\/10\.5281\/zenodo\.22261547/.test(comp), "composer: no 'new' claims, full DOI link");
  // second run: queue now 1 (< 2) -> next work (3), not work 2 again
  const r2 = await W.reachRefill({ DB: D1, AI }, Date.parse("2026-10-03T12:00:00Z"));
  ok(r2.refilled === 1 && r2.work === 3, "next run refills the next work, never the same one twice in 30 days", r2);
  const r3 = await W.reachRefill({ DB: D1, AI }, Date.parse("2026-10-03T18:00:00Z"));
  ok(r3.refilled === 0 && /queue holds 2/.test(r3.reason), "stops once the queue holds REFILL_MIN_QUEUE", r3);
}
// refill: checker objects -> draft, alert, and that work is blocked next time
{
  const { db, D1 } = mkdb();
  checkerReply = '[{"post":2,"issue":"invented number 40%"}]';
  const r = await W.reachRefill({ DB: D1, AI });
  const row = db.prepare("SELECT status, flags, notes FROM social_threads").get();
  ok(r.status === "draft" && row.status === "draft" && row.flags === null && /invented number/.test(row.notes), "checker issue: held as a draft, not selected", row);
  ok(db.prepare("SELECT COUNT(*) n FROM alerts WHERE source='refill'").get().n === 1, "held refill raises one alert");
  const r2 = await W.reachRefill({ DB: D1, AI });
  ok(r2.work === 2, "the held work is not retried; the next work is composed", r2);
  checkerReply = "[]";
}
// sweep: ineligible drafts suppressed with reason; eligible draft untouched
{
  const { db, D1 } = mkdb();
  db.exec(`INSERT INTO social_threads (slug, title, doi, status, notes) VALUES
    ('u','ULTRAMETRIC PHYSICS: RESEARCH PLAN','10.5281/zenodo.22758467','draft','[{"issue":"invented author name"}]'),
    ('n','Thermodynamic Trade-off Frontiers for Neuromorphic Processors','10.5281/zenodo.23105375','draft','[]'),
    ('q','ULTRAMETRIC thing','10.5281/zenodo.9','queued',NULL);`);
  const n = await W.reachSweepDrafts({ DB: D1 });
  const g = (s) => db.prepare("SELECT status, notes FROM social_threads WHERE slug=?").get(s);
  ok(n === 1 && g("u").status === "suppressed" && /^REACH-SELECT-1: STRATEGY 2\.3: pillar 4.*\| was: \[\{"issue":"invented author name"\}\]/.test(g("u").notes), "ineligible draft suppressed, reason and old notes kept", g("u"));
  ok(g("n").status === "draft" && g("q").status === "queued", "eligible draft and non-draft rows untouched");
}
// autoScan: the ineligible paper costs no AI and is recorded suppressed; the eligible one is composed
{
  const { db, D1 } = mkdb();
  db.exec("INSERT INTO social_threads (slug, status) VALUES ('a','queued'),('b','queued')");
  calls.length = 0;
  const { autoScan } = await import(join(dir, "w.mjs"));
  const r = await autoScan({ DB: D1, AI });
  const pa = db.prepare("SELECT status, notes, posts FROM social_threads WHERE doi='10.5281/zenodo.23104598'").get();
  const th = db.prepare("SELECT status FROM social_threads WHERE doi='10.5281/zenodo.23105375'").get();
  ok(r.suppressed === 1 && r.drafted === 1 && r.publications_30d === 1, "scan: 1 suppressed, 1 composed, only the eligible paper counts as a publication", r);
  ok(pa && pa.status === "suppressed" && pa.posts === "[]" && /pillar 4/.test(pa.notes), "pillar-4 paper recorded suppressed with its reason", pa);
  ok(th && th.status === "queued", "eligible paper composed and queued", th);
  ok(calls.filter((c) => /Temperley/i.test(c)).length === 0 && calls.length === 2, "no AI call mentions the suppressed paper", calls.length);
  ok(r.refill && r.refill.refilled === 0, "queue was full, so the scan's refill step did nothing", r.refill);
}
// REACH-REPAIR-1: one rewrite with findings fed back; clean -> queued (selected for a 2.4 work); held again -> rejected
{
  const { db, D1 } = mkdb();
  db.exec(`INSERT INTO social_threads (slug, title, doi, posts, status, notes) VALUES
    ('r1','Thermodynamic Trade-off Frontiers for Neuromorphic Processors','10.5281/zenodo.23105375','["old"]','draft','[{"post":1,"issue":"invented claim X"}]'),
    ('r2','Operating the fleet','${D(7)}','["old"]','draft','[{"post":4,"issue":"invented number 40%"}]'),
    ('r3','Some paper','10.5281/zenodo.5','["x"]','draft','checker unavailable - unverified');`);
  calls.length = 0; checkerReply = "[]";
  const r = await W.reachRepairDrafts({ DB: D1, AI });
  const g = (s) => db.prepare("SELECT status, flags, notes, posts FROM social_threads WHERE slug=?").get(s);
  ok(r.tried === 2 && r.queued === 2, "two held drafts rewritten and queued", r);
  ok(g("r1").status === "queued" && g("r1").flags === null && /REACH-REPAIR-1: rewritten/.test(g("r1").notes) && JSON.parse(g("r1").posts).length === 5, "pillar-1 draft queued with the new posts", g("r1"));
  ok(g("r2").flags === "selected" && /^selected: REACH-REPAIR-1/.test(g("r2").notes), "a selected work is queued as selected");
  ok(g("r3").status === "draft", "a draft without checker findings is left to the recheck path");
  const rp = calls.find((c) => /fact checker rejected the previous draft/.test(c));
  ok(rp && /invented claim X/.test(rp) && /Previous draft/.test(rp), "the findings and the old draft are fed back");
  db.exec(`INSERT INTO social_threads (slug, title, doi, posts, status, notes) VALUES ('r4','Energy of inference in LLMs','10.5281/zenodo.6','["o"]','draft','[{"post":2,"issue":"overclaim"}]')`);
  checkerReply = '[{"post":2,"issue":"still overclaims"}]';
  const r2 = await W.reachRepairDrafts({ DB: D1, AI });
  ok(r2.rejected === 1 && g("r4").status === "rejected" && /held twice.*overclaim.*still overclaims/.test(g("r4").notes), "held again: rejected with both rounds recorded", g("r4"));
  const r3 = await W.reachRepairDrafts({ DB: D1, AI });
  ok(r3.tried === 0, "nothing is retried a second time");
  checkerReply = "[]";
}
// recheck and drain carry the gate (source checks: both paths need the Bluesky stack to run)
ok(/var rel = reachEligible\(String\(row\.title \|\| ""\), abstract, row\.doi\);[\s\S]{0,200}status='suppressed'/.test(src), "recheck suppresses an ineligible held draft instead of approving it");
ok(/const rd = row\.doi \? reachDenied\(row\.title, ''\) : '';[\s\S]{0,120}released by owner card/.test(src), "drain refuses a pillar-4 thread unless the owner released it");
ok((src.match(/Write a 5-post Bluesky thread/g) || []).length === 1, "one composer prompt (no drifting copies)");

console.log(passes + " passed, " + fails + " failure(s)");
process.exit(fails ? 1 : 0);
