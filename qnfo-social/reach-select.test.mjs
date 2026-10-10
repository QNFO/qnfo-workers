// REACH-SELECT-1 offline suite (pillar reach). The fleet composes and queues social threads without asking, so this locks
// what it may pick and what it may never post:
//   - eligibility: pillar 1-3 titles yes; pillar 4 / speculative theory no (real titles); no fixed list of works;
//   - the sweep suppresses ineligible drafts; the repair pass rewrites a held draft once from its own stored abstract;
//   - the 06:00 run makes no outbound request (the external registry scan is retired, NOZ-DOI-1);
//   - a dead-registry identifier or link is refused by the content gate and never reaches a prompt, a checker or a post.
// Run: node qnfo-social/reach-select.test.mjs   -> prints "N failure(s)"
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const dir = mkdtempSync(join(tmpdir(), "rs-"));
writeFileSync(join(dir, "w.mjs"), src + "\nexport { reachEligible, reachDenied, reachSweepDrafts, reachRepairDrafts, checkThread, paperLink };\n");
const W = await import(join(dir, "w.mjs"));
let fails = 0, passes = 0;
const ok = (c, m, x) => { if (c) passes++; else { fails++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };


// ---- eligibility on real titles ----
const no = [
  "ULTRAMETRIC PHYSICS: RESEARCH PLAN",
  "Braid Group Representations, Modular Data, and the Classification of Anyons",
  "The p-Adic Temperley-Lieb Parameter: Valuation-Theoretic Constraints",
  "Holographic Quantum Error Correction as AdS/CFT Renormalization",
  "The q-Generalized Diameter: Scaling Exponents for Arbitrary Ultrametric Ratio",
  "Optimal Radix q under Resource Constraints: A Reconciled Derivation",
  "A General Theory of Process: Unifying Physics, Intelligence, and Topology",
  "Fine-Structure Constant as a Cross-Ratio: A Geometric Reframing of alpha",
  "Why Vertices, Not Points? Vertex-Anchored Braiding"
];
for (const t of no) ok(!W.reachEligible(t, "", "10.1000/t.1").ok, "not eligible: " + t);
const yes = [
  "Thermodynamic Trade-off Frontiers for Neuromorphic Processors",
  "Thermodynamic Imperative: Why Colder Isn't Better for Quantum Scalability",
  "Scientific Validity Assessment Toolkit (SVAT): Framework for Epistemic Rigor"
];
for (const t of yes) ok(W.reachEligible(t, "A unified framework for measuring energy.", "10.1000/t.2").ok, "eligible: " + t);
ok(!W.reachEligible("Energy budgets of computation", "We use p-adic analysis throughout.", "10.1000/t.3").ok, "an unambiguous pillar-4 term in the abstract suppresses");
ok(/no pillar 1-3 signal/.test(W.reachEligible("On the nature of things", "", "x").reason), "no pillar signal: not eligible, with the reason");
ok(!("REACH_SELECTED" in W) && !/10\.5281\/[a-z]+[.\d]/i.test(src), "no fixed list of works and no registry identifiers in the worker");

// ---- paperLink / composePrompt: only a URL or a third-party DOI is ever linked ----
ok(W.paperLink("10.1000/abc") === "https://doi.org/10.1000/abc", "third-party DOI becomes a doi.org link");
ok(W.paperLink("https://papers.qnfo.org/papers/x/") === "https://papers.qnfo.org/papers/x/", "a paper-page URL is used as given");
ok(W.paperLink("10.5281/anything.1") === "" && W.paperLink("https://doi.org/10.5281/anything.1") === "" && W.paperLink("") === "" && W.paperLink(null) === "", "a dead-registry value or an empty value gives no link");
const cp = W.composePrompt("10.5281/anything.1", "Energy of inference", "We measure joules.");
ok(!/10\.5281|doi\.org/.test(cp) && /No paper link is supplied/.test(cp), "composer prompt carries no dead identifier and says no link is supplied");
const cp2 = W.composePrompt("https://papers.qnfo.org/papers/e/", "Energy of inference", "We measure joules.");
ok(/give the paper link as a full URL: https:\/\/papers\.qnfo\.org\/papers\/e\//.test(cp2), "composer prompt gives the supplied page URL");

// ---- content gate ----
const dead = ["see https://doi.org/10.5281/" + "x.1", "published on " + ["Zen", "odo"].join("")];
for (const t of dead) { const g = W.contentGate(["fine", t]); ok(!g.ok && g.reason === "dead-doi", "gate refuses: " + t); }
ok(W.contentGate(["Joules per solution https://papers.qnfo.org/papers/e/ and https://doi.org/10.1000/abc"]).ok, "page URLs and third-party DOIs pass the gate");

// ---- D1 + stubs ----
function mkdb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE social_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, posts TEXT, status TEXT DEFAULT 'queued', posted_at TEXT, created_at TEXT DEFAULT (datetime('now')), doi TEXT, abstract TEXT, flags TEXT, notes TEXT, error TEXT, updated_at TEXT);
  CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, level TEXT, message TEXT);
  CREATE TABLE scan_state (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE dissemination_tracker (id INTEGER PRIMARY KEY AUTOINCREMENT, paper_doi TEXT, action TEXT, channel TEXT, posted_at TEXT, created_at TEXT);`);
  const D1 = { prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; } }; return st; } };
  return { db, D1 };
}
const calls = [];
let checkerReply = "[]";
const AI = { async run(model, input) {
  const c = input.messages[0].content;
  calls.push(c);
  if (/^Given a paper/.test(c)) return { response: checkerReply };
  return { response: ["A hook about energy per answer.", "The claim in plain words.", "Why it matters.", "How to check it.", "By Rowan Brad Quni-Gudzinas: What do you think?"].join("\n") };
} };
let fetched = 0;
globalThis.fetch = async () => { fetched++; return new Response("nope", { status: 404 }); };

// sweep: ineligible drafts suppressed with reason; eligible draft untouched
{
  const { db, D1 } = mkdb();
  db.exec(`INSERT INTO social_threads (slug, title, doi, status, notes) VALUES
    ('u','ULTRAMETRIC PHYSICS: RESEARCH PLAN','10.1000/t.1','draft','[{"issue":"invented author name"}]'),
    ('n','Thermodynamic Trade-off Frontiers for Neuromorphic Processors','10.1000/t.2','draft','[]'),
    ('q','ULTRAMETRIC thing','10.1000/t.3','queued',NULL);`);
  const n = await W.reachSweepDrafts({ DB: D1 });
  const g = (s) => db.prepare("SELECT status, notes FROM social_threads WHERE slug=?").get(s);
  ok(n === 1 && g("u").status === "suppressed" && /^REACH-SELECT-1: STRATEGY 2\.3: pillar 4.*\| was: \[\{"issue":"invented author name"\}\]/.test(g("u").notes), "ineligible draft suppressed, reason and prior notes kept", g("u"));
  ok(g("n").status === "draft" && g("q").status === "queued", "eligible draft and non-draft rows untouched");
}
// the 06:00 run: no outbound request, sweeps and repairs only
{
  const { db, D1 } = mkdb();
  db.exec(`INSERT INTO social_threads (slug, title, doi, status, notes) VALUES ('u','ULTRAMETRIC PHYSICS: RESEARCH PLAN','10.1000/t.1','draft','[]');`);
  fetched = 0; calls.length = 0;
  const r = await W.autoScan({ DB: D1, AI });
  ok(fetched === 0 && calls.length === 0 && r.swept === 1 && r.repair && r.repair.tried === 0 && !r.error, "scan: no outbound request, no AI call for a suppressed draft", r);
}
// REACH-REPAIR-1: one rewrite from the draft's own abstract with findings fed back; clean -> queued; held again -> rejected
{
  const { db, D1 } = mkdb();
  db.exec(`INSERT INTO social_threads (slug, title, doi, abstract, posts, status, notes) VALUES
    ('r1','Thermodynamic Trade-off Frontiers for Neuromorphic Processors','10.1000/t.2','We bound the energy of neuromorphic processors.','["old"]','draft','[{"post":1,"issue":"invented claim X"}]'),
    ('r3','Some paper','10.1000/t.5','Abstract.','["x"]','draft','checker unavailable - unverified'),
    ('r5','Energy of inference','10.1000/t.7',NULL,'["x"]','draft','[{"post":1,"issue":"y"}]');`);
  calls.length = 0; checkerReply = "[]"; fetched = 0;
  const r = await W.reachRepairDrafts({ DB: D1, AI });
  const g = (s) => db.prepare("SELECT status, flags, notes, posts FROM social_threads WHERE slug=?").get(s);
  ok(r.tried === 1 && r.queued === 1 && fetched === 0, "one held draft rewritten and queued, no outbound request", r);
  ok(g("r1").status === "queued" && /REACH-REPAIR-1: rewritten/.test(g("r1").notes) && JSON.parse(g("r1").posts).length === 5, "draft queued with the new posts", g("r1"));
  ok(g("r3").status === "draft" && g("r5").status === "draft", "a draft without checker findings, or without a stored abstract, is left alone");
  const rp = calls.find((c) => /fact checker rejected the previous draft/.test(c));
  ok(rp && /invented claim X/.test(rp) && /Previous draft/.test(rp) && /We bound the energy/.test(rp), "findings, the old draft and the stored abstract are fed back");
  db.exec(`INSERT INTO social_threads (slug, title, doi, abstract, posts, status, notes) VALUES ('r4','Energy of inference in LLMs','10.1000/t.6','We measure it.','["o"]','draft','[{"post":2,"issue":"overclaim"}]')`);
  checkerReply = '[{"post":2,"issue":"still overclaims"}]';
  const r2 = await W.reachRepairDrafts({ DB: D1, AI });
  ok(r2.rejected === 1 && g("r4").status === "rejected" && /held twice.*overclaim.*still overclaims/.test(g("r4").notes), "held again: rejected with both rounds recorded", g("r4"));
  ok((await W.reachRepairDrafts({ DB: D1, AI })).tried === 0, "nothing is retried a second time");
  checkerReply = "[]";
}
// recheck and drain carry the gate (source checks: both paths need the Bluesky stack to run)
ok(/var rel = reachEligible\(String\(row\.title \|\| ""\), abstract, row\.doi\);[\s\S]{0,200}status='suppressed'/.test(src), "recheck suppresses an ineligible held draft instead of approving it");
ok(/const rd = row\.doi \? reachDenied\(row\.title, ''\) : '';[\s\S]{0,120}released by owner card/.test(src), "drain refuses a pillar-4 thread unless the owner released it");
ok((src.match(/Write a 5-post Bluesky thread/g) || []).length === 1, "one composer prompt (no drifting copies)");

console.log(passes + " passed, " + fails + " failure(s)");
process.exit(fails ? 1 : 0);
