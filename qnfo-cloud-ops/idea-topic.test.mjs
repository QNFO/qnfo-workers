// SIGNAL-INTAKE-QEC-1 + IDEA-TOPIC-METRIC-1 (1.19.1, #1947) offline suite for qnfo-cloud-ops.
// Proves: the research-scan query admits QEC only with an energy angle and keeps every other term; the daily companion
// recomputes metric_registry idea_topic_concentration_30d from ACCEPTed idea_proposals in the last 30 days, with the
// "quantum" cluster checked first (a quantum-thermodynamics item stays quantum), and writes only that registry row.
// Run: node qnfo-cloud-ops/idea-topic.test.mjs   -> prints "N passed, 0 failed" (Node 22: node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { RESEARCH_SCAN_QUERY as __Q, ideaTopicCluster as __cluster, ideaTopicConcentration as __conc, jobIdeaTopicMetric as __job, CRON_COMPANIONS as __comp, JOBS as __jobs, AMS_SCHEDULE as __sched };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

// 1. Query: generic QEC is gone, energy-bound QEC and every other term stay.
const Q = mod.__Q;
ok(!/OR all:"quantum error correction" OR/.test(Q), "plain QEC is no longer an OR term", Q);
ok(Q.includes('(all:"quantum error correction" AND (all:energy OR all:thermodynamic OR all:Landauer))'), "QEC enters only with an energy angle");
for (const term of ['all:"ultrametric"', 'all:"p-adic"', 'all:"Bruhat-Tits"', 'all:"quantum energy"', 'all:"joules per solution"', 'all:"ZBW"', 'all:"quantum thermodynamics"', "cat:quant-ph", "cat:math-ph", "cat:hep-th", "cat:cs.ET"]) ok(Q.includes(term), "query keeps " + term);
ok((Q.match(/\(/g) || []).length === (Q.match(/\)/g) || []).length, "parentheses balance");

// 2. Classifier: quantum first, then ultrametric, energy, ai-epistemics, other.
ok(mod.__cluster("Low-Overhead Quantum Error Correction with Boundary-Connected Planar Modules") === "quantum", "QEC paper is quantum");
ok(mod.__cluster("A quantum thermal machine surpassing the classical thermodynamic limit") === "quantum", "quantum thermodynamics stays quantum (no re-labelling)");
ok(mod.__cluster("p-adic spectral zeta functions via the inverse Stieltjes transform") === "ultrametric", "p-adic is ultrametric");
ok(mod.__cluster("Landauer cost of erasure in classical CMOS") === "energy", "classical energy paper is energy");
ok(mod.__cluster("Ignorance audits for LLM-assisted science") === "ai-epistemics", "epistemics paper is ai-epistemics");
ok(mod.__cluster("Urban mobility and bus timetables") === "other", "anything else is other");
const c = mod.__conc([{ name: "auto-scan", idea: "Quantum codes" }, { name: "auto-scan", idea: "p-adic heat" }, { name: "x", idea: "plain", rationale: "about qubits" }, { name: "x", idea: "LLM audit" }]);
ok(c.accepted_30d === 4 && c.top === "quantum" && c.share === 0.5 && c.by_cluster.quantum === 2, "share is the largest cluster over all accepted items; rationale counts", c);
ok(mod.__conc([]).share === null, "no accepted items gives no value");

// 3. The job: reads only ACCEPT rows in 30 days (both created_at formats), writes only the registry row.
function stmtOn(dbx, sql) {
  let args = [];
  const self = {
    bind(...a) { args = a; return self; },
    async all() { return { results: dbx.prepare(sql).all(...args) }; },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT DEFAULT (datetime('now')), decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
  INSERT INTO metric_registry (metric, layer, kind, last_value, last_refreshed) VALUES ('idea_topic_concentration_30d', 'fleet', 'guard', '0.588', '2026-10-04T09:14:00Z'), ('other_metric', 'fleet', 'x', '7', 'then');`);
const ins = db.prepare("INSERT INTO idea_proposals (name, idea, decision, rationale, created_at) VALUES (?, ?, ?, ?, ?)");
const iso = (d) => new Date(Date.now() - d * 864e5).toISOString();
const sq = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 19).replace("T", " ");
ins.run("auto-scan", "Quantum LDPC decoders", "ACCEPT", "qec", iso(1));
ins.run("auto-scan", "Thermodynamics of continuous quantum error correction", "ACCEPT", "", sq(2));
ins.run("owner", "Ultrametric distance on tensor products", "ACCEPT", "", iso(3));
ins.run("owner", "Energy per correct answer for CMOS accelerators", "ACCEPT", "", sq(4));
ins.run("auto-scan", "Quantum memory under correlated noise", "HOLD", "", iso(1));
ins.run("auto-scan", "Old quantum paper", "ACCEPT", "", iso(40));
const env = { AUDIT: { prepare: (sql) => stmtOn(db, sql) } };
const r = await mod.__job(env);
const row = db.prepare("SELECT last_value, last_refreshed FROM metric_registry WHERE metric='idea_topic_concentration_30d'").get();
ok(r.status === "ok" && r.notes.accepted_30d === 4 && r.notes.top === "quantum" && r.notes.share === 0.5, "job counts 4 accepted in 30 days (HOLD and 40-day-old excluded), quantum 2/4", r.notes);
ok(row.last_value === "0.5" && row.last_refreshed !== "2026-10-04T09:14:00Z", "registry row updated", row);
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric='other_metric'").get().last_value === "7", "no other registry row touched");

// 4. Wiring: a companion of an existing daily slot, no new schedule entry.
ok(typeof mod.__jobs["idea-topic-metric"] === "function", "job is in the dispatch map");
ok((mod.__comp["quality-score"] || []).includes("idea-topic-metric") && mod.__sched["quality-score"].days === "*", "rides the every-day quality-score slot");
ok(!("idea-topic-metric" in mod.__sched), "no new schedule slot (no new cron)");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
