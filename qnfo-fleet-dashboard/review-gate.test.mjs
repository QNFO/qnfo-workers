// REVIEW-GATE-1 offline suite (CI-TEST-CLOCKS-1, 2026-10-20): the owner card "Decide: continue or stop (review gate due)" with the clock
// pinned on either side of the review gate (REVIEW_GATE_DATE, read from the worker's own decision.gate.due so a moved gate moves the test).
// Before this suite nothing covered that branch: decideInvestment with days <= 0 and no attested return evidence, and the card humanView adds
// for it. The rt-api, area-pages and fleet-cmd fixtures attest one credibility event for exactly this reason (from the gate date an
// unattested fixture's queue holds one card more than their counts say), so they exercise neither the unattested nor the gate-due path;
// this suite does, and also proves that attested evidence gives the same verdict (CONTINUE) and no card on either side.
// Proves: (A) the gate date is published and well formed; (B) unattested: no gate card before the gate, exactly one at and after it (verdict
// UNKNOWN, risk gate_due, urgent, one card more than the rest of the queue); (C) attested: no gate card and the verdict CONTINUE before and
// after, both for credibility events and for secured funding; (D) the edge is the gate's own midnight (one second before is not due); (E) with no spend reading the verdict is UNKNOWN too, and the card still waits for the gate.
// Run: node --no-warnings qnfo-fleet-dashboard/review-gate.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });

const DAY = 864e5;
const GATE_TITLE = "Decide: continue or stop (review gate due)";
const OTHER_TITLE = "Top up the AI credit";
const STATE = (at) => JSON.stringify({ schema_version: "fleet-state/v1", generated_at: new Date(at).toISOString(), version: "t", verdict: "HEALTHY", window: {}, fleet: { workers: 30 }, totals: {}, scheduled: [], audits: [], probes: [] });

// One world per call, every timestamp taken from the pinned instant `at` (the money snapshot is fresh, so humanView starts no background
// re-measure). `facts` are invest_facts rows: [key, value]; `cost` replaces the snapshot's money reading (spend within the cap by default).
function mk(at, facts, cost) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER);
  CREATE TABLE fleet_loop_meta (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE invest_facts (key TEXT PRIMARY KEY, value TEXT, evidence TEXT, updated_at TEXT);
  CREATE TABLE llm_gateway_log (ts TEXT, status INTEGER, error TEXT);`);
  db.prepare("INSERT INTO fleet_dashboard_state VALUES (1,?,?,1)").run(new Date(at).toISOString(), STATE(at));
  db.prepare("INSERT INTO fleet_loop_meta (k,v) VALUES ('human_gov_snapshot', ?)").run(JSON.stringify({
    at: new Date(at).toISOString(),
    cost: cost || { spend30: 120, cap: 150, balance: 40, metered30: 130, metered_top: [], total_est30: 130 },
    ret: { subs_confirmed: 3, subs_total: 5, subs_new30: 1 }, early_trigger: null, trend: null
  }));
  db.prepare("INSERT INTO human_actions (slug,title,why,action,due,source) VALUES ('rg-one',?,'why it is yours','act','','billing')").run(OTHER_TITLE);
  for (const [k, v] of facts || []) db.prepare("INSERT INTO invest_facts (key,value,evidence,updated_at) VALUES (?,?,?,?)").run(k, v, "fixture: attested", new Date(at).toISOString());
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  return { AUDIT: { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } } };
}
const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughOnException() {} };

// GET /api/human with Date.now pinned to `at` (restored even when the call throws).
async function humanAt(at, facts, cost) {
  const realNow = Date.now;
  Date.now = () => at;
  try {
    const r = await worker.fetch(new Request("https://fleet.qnfo.org/api/human"), mk(at, facts, cost), ctx);
    return { status: r.status, j: await r.json() };
  } finally { Date.now = realNow; }
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const titles = (j) => (j.items || []).map((i) => i.title);
const gateCards = (j) => (j.items || []).filter((i) => i.title === GATE_TITLE);

// A. the gate date the worker judges against
const FIXED = Date.parse("2026-10-20T12:00:00Z");
const probe = await humanAt(FIXED, []);
const due = probe.j.decision && probe.j.decision.gate && probe.j.decision.gate.due;
ok(probe.status === 200 && /^\d{4}-\d{2}-\d{2}$/.test(String(due)), "A1 /api/human publishes the review gate date as YYYY-MM-DD", due);
const G = Date.parse(due + "T00:00:00Z");
ok(Number.isFinite(G), "A2 the gate date parses as a UTC midnight", due);

// The instants either side of the gate: a day and a half before, one second before, the gate's own midnight, two and a half days after, 400 days after.
const BEFORE = [["1.5 days before", G - 1.5 * DAY], ["1 second before", G - 1000]];
const AFTER = [["at the gate midnight", G], ["2.5 days after", G + 2.5 * DAY], ["400 days after", G + 400 * DAY]];

// B. no return evidence attested: the gate is a decision for the owner, once, from its date
for (const [label, at] of BEFORE) {
  const { status, j } = await humanAt(at, []);
  ok(status === 200 && gateCards(j).length === 0, "B1 unattested, " + label + ": no gate-due card", titles(j));
  ok(j.count === 1 && titles(j)[0] === OTHER_TITLE, "B2 unattested, " + label + ": the queue is the one fixture card", titles(j));
  ok(j.decision.gate.days > 0 && j.decision.verdict !== "UNKNOWN", "B3 unattested, " + label + ": the gate is not due (days " + j.decision.gate.days + ") and the verdict is " + j.decision.verdict, j.decision.gate);
}
for (const [label, at] of AFTER) {
  const { status, j } = await humanAt(at, []);
  const cards = gateCards(j);
  ok(status === 200 && cards.length === 1, "B4 unattested, " + label + ": exactly one gate-due card", titles(j));
  ok(j.count === 2 && titles(j).includes(OTHER_TITLE), "B5 unattested, " + label + ": it is one card more than the rest of the queue", titles(j));
  ok(j.decision.verdict === "UNKNOWN" && j.decision.risk === "gate_due" && j.decision.gate.days <= 0, "B6 unattested, " + label + ": verdict UNKNOWN, risk gate_due, days " + j.decision.gate.days, j.decision);
  ok(cards[0] && cards[0].key === "decision" && cards[0].sev === "urgent", "B7 unattested, " + label + ": the card is the urgent owner decision", cards[0]);
}

// C. return evidence attested: the same verdict on either side of the gate and no card (the fixtures of rt-api, area-pages and fleet-cmd rely on it)
for (const [name, facts] of [["credibility events", [["credibility_events", "2"]]], ["secured funding", [["funding_secured", "true"]]]]) {
  for (const [label, at] of BEFORE.concat(AFTER)) {
    const { status, j } = await humanAt(at, facts);
    ok(status === 200 && gateCards(j).length === 0 && j.count === 1, "C1 attested " + name + ", " + label + ": no gate-due card, the queue is the one fixture card", titles(j));
    ok(j.decision.verdict === "CONTINUE", "C2 attested " + name + ", " + label + ": verdict CONTINUE", j.decision);
  }
}

// D. the edge: the gate is due from its own midnight, not a second before
{
  const before = await humanAt(G - 1000, []), at = await humanAt(G, []);
  ok(gateCards(before.j).length === 0 && gateCards(at.j).length === 1, "D1 one second before the gate midnight no card, at it one card", { before: titles(before.j), at: titles(at.j) });
  ok(before.j.decision.gate.days === 1 && at.j.decision.gate.days === 0, "D2 gate.days reads 1 and then 0", { before: before.j.decision.gate.days, at: at.j.decision.gate.days });
}

// E. no spend reading at all (the other way to an UNKNOWN verdict): the card follows the same date, whatever the evidence says
{
  const noSpend = { cap: 150, balance: 40 };
  for (const [label, at] of BEFORE) {
    const { j } = await humanAt(at, [], noSpend);
    ok(j.decision.verdict === "UNKNOWN" && j.decision.gate.days > 0 && gateCards(j).length === 0, "E1 no spend reading, " + label + ": verdict UNKNOWN but the gate is not due, so no card", { v: j.decision.verdict, days: j.decision.gate.days, titles: titles(j) });
  }
  for (const [label, at] of AFTER) {
    const { j } = await humanAt(at, [["credibility_events", "2"]], noSpend);
    ok(j.decision.verdict === "UNKNOWN" && j.decision.gate.days <= 0 && gateCards(j).length === 1, "E2 no spend reading, " + label + ": verdict UNKNOWN and the gate is due, so one card", { v: j.decision.verdict, days: j.decision.gate.days, titles: titles(j) });
  }
}

console.log("review-gate: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
