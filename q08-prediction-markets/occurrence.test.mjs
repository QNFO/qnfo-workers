import test from "node:test"; import assert from "node:assert/strict";
import { detectOccurrence, occurrenceClass, mistakeCause, simulateBook } from "./forecast-engine.mjs";
const q = { title: "Jensen Huang announced resignation or removal by November 12, 2026?" };
const sig = (title, url) => ({ title, url, source: "news", created_at: "2026-11-12 10:00:00" });
test("two outlets, past tense, no hedge: occurred", () => {
  const r = detectOccurrence(q, [sig("Jensen Huang resigns as Nvidia CEO", "https://a.com/1"), sig("Nvidia: Jensen Huang has resigned", "https://b.com/2")]);
  assert.equal(r.class, "leader-exit"); assert.equal(r.hosts, 2);
});
test("one outlet, a hedge, or a denial never settles", () => {
  assert.equal(detectOccurrence(q, [sig("Jensen Huang resigns as Nvidia CEO", "https://a.com/1")]), null);
  assert.equal(detectOccurrence(q, [sig("Jensen Huang may resign", "https://a.com/1"), sig("Jensen Huang resigns? Board weighs", "https://b.com/2")]), null);
  assert.equal(detectOccurrence(q, [sig("Jensen Huang denies he resigned", "https://a.com/1"), sig("Jensen Huang refuses to step down", "https://b.com/2")]), null);
  assert.equal(detectOccurrence(q, [sig("Nvidia Board Is Investigating Jensen Huang", "https://a.com/1"), sig("Jensen Huang affair report", "https://b.com/2")]), null);
});
test("a question that is not about a single event has no class", () => { assert.equal(occurrenceClass("Will the Fed hold rates steady?"), null); });
test("causes are assigned by rule", () => {
  assert.equal(mistakeCause({ p: 0.3, prior: 0.5, outcome: 1 }).key, "overshift");
  assert.equal(mistakeCause({ p: 0.5, prior: 0.5, outcome: 1 }).key, "no-edge");
  assert.equal(mistakeCause({ p: 0.5, prior: 0.5, outcome: 1 }, { confirmed: 0 }).key, "detector-miss");
});
test("a position states its edge and its exits", () => {
  const rows = [{ slug: "a", title: "A", category: "tech", created_at: "x", deadline: "2027-01-01", prior: 0.4, p: 0.5, outcome: null }];
  const b = simulateBook(rows, {});
  const x = b.positions[0];
  assert.equal(x.edge_pts, 10); assert.equal(x.actionable, true); assert.equal(x.take_profit_at, 0.5); assert.ok(x.wrong_if_crowd_below < x.entry);
  assert.equal(b.totals.actionable.positions, 1);
});
import { DatabaseSync } from "node:sqlite";
import { ensureSchema, occurrenceLane, mistakesData } from "./forecast-engine.mjs";
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const mk = (sql, args = []) => ({ bind: (...a) => mk(sql, a), run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
  return { prepare: (s) => mk(s), _raw: db };
}
test("the lane settles the leg and its later legs, then the market's final price confirms or reverses", async () => {
  const db = fakeD1(); await ensureSchema(db);
  db._raw.exec("CREATE TABLE pt_market (slug TEXT PRIMARY KEY, title TEXT, yes REAL, closed INTEGER, updated_at TEXT)");
  const ins = (slug, title, dl) => db._raw.prepare("INSERT INTO fe_forecast (created_at, slug, title, deadline, prior, p, hash) VALUES ('2026-11-10T00:00:00Z', ?, ?, ?, 0.45, 0.5, ?)").run(slug, title, dl, slug);
  ins("jh-12", "Jensen Huang announced resignation or removal by November 12, 2026?", "2026-11-12");
  ins("jh-13", "Jensen Huang announced resignation or removal by November 13, 2026?", "2026-11-13");
  const signals = [sig("Jensen Huang resigns as Nvidia CEO", "https://a.com/1"), sig("Nvidia: Jensen Huang has resigned", "https://b.com/2")];
  const r = await occurrenceLane({ TRADES_DB: db }, [], signals, Date.parse("2026-11-13T09:00:00Z"));
  assert.equal(r.settled.length, 2);
  assert.equal(db._raw.prepare("SELECT count(*) n FROM fe_forecast WHERE outcome = 1").get().n, 2);
  db._raw.prepare("INSERT INTO pt_market VALUES ('jh-12','x',0.0,1,'x')").run();
  const r2 = await occurrenceLane({ TRADES_DB: db }, [], [], Date.parse("2026-11-13T10:00:00Z"));
  assert.deepEqual(r2.reversed, ["jh-12"]);
  const d = await mistakesData({ TRADES_DB: db });
  assert.equal(d.causes["detector-miss"], 1);
});
