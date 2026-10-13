// IDEA-NOVELTY-1 (idea-hub 1.9.0, agent_issues 2409) offline suite. Runs the worker's own triageProposals in a vm against
// an in-memory SQLite D1 (qnfo-audit and living-paper), a PAPER_VZ stub, an arXiv Atom stub and a Workers AI stub whose
// scorecard always answers ACCEPT and whose novelty labeller answers what each case sets.
// Proves: a duplicate neighbour holds the proposal (not queued; the neighbour is named); substantial overlap holds it
// unless the idea states a delta; a low practical payoff holds it unless it is foundational and the foundational quota has
// room (tag foundational-quota, counted toward the quota); a clean screen accepts with a tag that adds no topic word (the
// diversity classifier reads the same cluster); the labeller is from another family than the scorecard models; owner rows
// are never screened; with no neighbours or no labeller answer the proposal passes unscreened and the run counts it.
// Run: node --no-warnings idea-hub/novelty-screen.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const src = readFileSync(join(here, "worker.js"), "utf8").replace(/export default\s*\{/, "var __default = {");
ok(src.includes("IDEA-NOVELTY-1"), "the worker names IDEA-NOVELTY-1 (the issue's code probe)");

const fetches = [];
let arxivUp = true;
const atom = '<feed><entry><id>http://arxiv.org/abs/2401.00001v1</id><title>Prior work on decoder thresholds</title><summary>We bound decoder thresholds.</summary></entry>' +
  '<entry><id>http://arxiv.org/abs/2402.00002v2</id><title>Second neighbour</title><summary>Related idea.</summary></entry></feed>';
const sb = { console: { log() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto,
  fetch: async (u) => { fetches.push(String(u)); if (!arxivUp) throw new Error("arXiv down"); return new Response(atom, { status: 200 }); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { triageProposals, proposalCluster, noveltyTerms, T_MODELS, T_CHAIN, NOVELTY_MODELS, NOVELTY_FOUNDATIONAL_QUOTA };", sb);
const api = sb.__x;

const mk = (ddl) => { const db = new DatabaseSync(":memory:"); db.exec(ddl); return db; };
const wrap = (db) => ({ prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(q).all(...a) }; }, async first() { return db.prepare(q).get(...a) ?? null; }, async run() { const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; } });
const db = mk(`CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, created_at TEXT, UNIQUE(source, source_id));`);
const lp = mk(`CREATE TABLE papers (slug TEXT PRIMARY KEY, title TEXT, abstract TEXT, body_md TEXT);`);
lp.prepare("INSERT INTO papers VALUES ('qnfo-prior-1', 'A QNFO paper on decoders', NULL, 'The body holds the abstract of this paper.')").run();
const card = { novelty: 0.9, technical_merit: 0.9, impact_potential: 0.8, exposure_potential: 0.8, feasibility: 0.9, risk: 0.1, rationale: "solid", hook: "h" };
let label = null, labellerUp = true;
const calls = [];
const AI = { async run(model, input) {
  const nov = /overlapping element/.test(JSON.stringify(input));
  calls.push(nov ? "NOVELTY " + model : model);
  if (/bge/.test(model)) return { data: [[0.1, 0.2, 0.3]] };
  if (nov) { if (!labellerUp) throw new Error("model down"); return { response: JSON.stringify(label) }; }
  return { response: JSON.stringify(card) };
} };
const PAPER_VZ = { async query() { return { matches: [{ metadata: { slug: "qnfo-prior-1" } }, { metadata: { slug: "qnfo-prior-1" } }] }; } };
const env = { QNFO_AUDIT: wrap(db), LIVING_PAPER: wrap(lp), PAPER_VZ, AI };
db.prepare("INSERT INTO fleet_budget (node_class, cap, current) VALUES ('ai_spend:total', 150, 10)").run();
const add = (name, idea, contact) => Number(db.prepare("INSERT INTO idea_proposals (name, idea, contact, status, created_at) VALUES (?, ?, ?, 'new', ?)").run(name, idea, contact || "", new Date().toISOString()).lastInsertRowid);
const row = (id) => db.prepare("SELECT * FROM idea_proposals WHERE id = ?").get(id);
const queued = (id) => db.prepare("SELECT COUNT(*) n FROM research_queue WHERE source = 'proposal' AND source_id = ?").get(String(id)).n;
const L = (overlaps, extra) => Object.assign({ neighbours: overlaps.map((o, i) => ({ n: i + 1, overlap: o, element: "decoder threshold bound" })), delta: "", payoff: 4, foundational: false }, extra || {});
const run = async (id) => { const out = await api.triageProposals(env); return { out, r: row(id) }; };

// 0. Model families: the labeller shares no family with the scorecard models.
const fam = (m) => String(m).split("/")[1];
const scorers = [api.T_MODELS.a, api.T_MODELS.b, api.T_MODELS.tiebreak].concat(api.T_CHAIN).map(fam);
ok(api.NOVELTY_MODELS.length >= 2 && api.NOVELTY_MODELS.every((m) => !scorers.includes(fam(m))), "the novelty labellers share no family with any scorecard model", api.NOVELTY_MODELS);
ok(api.noveltyTerms("Bounding surface-code decoder thresholds under biased noise").length >= 2, "query terms are drawn from the idea text");

// 1. Duplicate: held, not queued, the neighbour named.
label = L(["none", "duplicate", "partial"]);
let id = add("auto-scan", "Bounding surface-code decoder thresholds under biased noise");
let { out, r } = await run(id);
ok(r.status === "triaged_hold" && r.decision === "HOLD" && queued(id) === 0, "a duplicate neighbour holds the proposal", r);
ok(/HOLD duplicate of arXiv 2401\.00001v1 \(decoder threshold bound\)/.test(r.rationale) && /solid$/.test(r.rationale), "the hold names the neighbour and the element and keeps the scorecard rationale", r.rationale);
ok(out.novelty && out.novelty.held === 1 && out.novelty.screened === 1, "the run counts the screen and the hold", out.novelty);
ok(fetches.some((u) => /export\.arxiv\.org\/api\/query/.test(u)) && calls.some((m) => /bge/.test(m)), "both the QNFO corpus (PAPER_VZ) and arXiv were searched");
ok(calls.some((m) => m === "NOVELTY " + api.NOVELTY_MODELS[0]), "caps clear: the first labeller answers", calls);

// 2. Substantial with no stated delta: held; with a stated delta: accepted.
label = L(["substantial", "partial", "none"]);
id = add("auto-scan", "Decoder thresholds for biased noise in rotated codes");
({ r } = await run(id));
ok(r.status === "triaged_hold" && /substantial overlap with QNFO qnfo-prior-1 .* no stated delta/.test(r.rationale), "substantial overlap and no stated delta holds it", r.rationale);
label = L(["substantial", "partial", "none"], { delta: "uses a measured noise bias, not an assumed one" });
id = add("auto-scan", "Decoder thresholds for measured biased noise in rotated codes");
({ r } = await run(id));
ok(r.status === "triaged_accepted" && queued(id) === 1 && /delta stated\] solid$/.test(r.rationale), "substantial overlap with a stated delta is accepted", r.rationale);

// 3. Low practical payoff: held unless foundational with quota room.
label = L(["partial", "none", "none"], { payoff: 2 });
id = add("auto-scan", "A taxonomy of decoder diagrams");
({ r } = await run(id));
ok(r.status === "triaged_hold" && /practical payoff below 3\]/.test(r.rationale), "payoff 2, not foundational: held", r.rationale);
label = L(["partial", "none", "none"], { payoff: 1, foundational: true });
id = add("auto-scan", "Axioms for a theory of distinctions");
({ r, out } = await run(id));
ok(r.status === "triaged_accepted" && /foundational-quota\] solid$/.test(r.rationale), "payoff 1 but foundational with quota room: accepted under the foundational quota", r.rationale);
const accN = () => db.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE decision = 'ACCEPT'").get().n;
// Fill the quota: foundational-quota accepts are now 1 of 2; a second would be 2 of 3 > 0.3.
id = add("auto-scan", "Axioms for a second theory of distinctions");
({ r } = await run(id));
ok(r.status === "triaged_hold" && /foundational quota full\]/.test(r.rationale), "the foundational quota is enforced over the 30-day accepts", { r: r.rationale, accepted: accN(), quota: api.NOVELTY_FOUNDATIONAL_QUOTA });

// 4. Clean screen: accepted; the tag adds no topic word (same cluster with and without it).
label = L(["none", "partial", "none"]);
id = add("auto-scan", "Graph colouring bounds for sparse expanders");
({ r } = await run(id));
ok(r.status === "triaged_accepted" && /^\[novelty 3 neighbours none\/partial\/substantial\/duplicate 2\/1\/0\/0; payoff 4\] solid$/.test(r.rationale), "a clean screen accepts with a numbers-only tag", r.rationale);
ok(api.proposalCluster(r.name, r.idea, r.rationale) === api.proposalCluster(r.name, r.idea, "solid"), "the tag does not move the topic cluster the diversity cap and metric read");

// 5. Owner rows are never screened.
label = L(["duplicate"]);
calls.length = 0;
id = add("owner-chat", "Owner idea that duplicates prior work", "owner");
({ r } = await run(id));
ok(r.status === "triaged_accepted" && !/novelty/.test(r.rationale) && !calls.some((m) => /^NOVELTY|bge/.test(m)), "an owner-authored idea is accepted and not screened", { r: r.rationale, calls });

// 6. Screen unavailable: passes unscreened, counted.
arxivUp = false; labellerUp = false;
label = L(["duplicate"]);
id = add("auto-scan", "Sparse expander colouring under random deletions");
({ r, out } = await run(id));
ok(r.status === "triaged_accepted" && r.rationale === "solid" && out.novelty.unscreened === 1 && out.novelty.held === 0, "no labeller answer: accepted unscreened and counted", { r: r.rationale, n: out.novelty });
const ev = JSON.parse(db.prepare("SELECT meta FROM cloud_ops_events WHERE id = 'idea-triage-budget'").get().meta);
ok(ev.novelty && ev.novelty.unscreened === 1 && /arxiv: arXiv down/.test(ev.novelty.last_error || ""), "the run publishes the screen counts and the last error", ev.novelty);
env.PAPER_VZ = undefined; arxivUp = false; labellerUp = true;
id = add("auto-scan", "Sparse expander colouring under adversarial deletions");
({ r, out } = await run(id));
ok(r.status === "triaged_accepted" && out.novelty.unscreened === 1, "no neighbour readable: accepted unscreened and counted", out.novelty);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
