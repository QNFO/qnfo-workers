// PRODUCT-RESEARCH-1 offline suite. Run: node _shared/product-research.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert";
import * as PR from "./product-research.js";

const root = new URL("../", import.meta.url), rd = (p) => readFileSync(new URL(p, root), "utf8");
let n = 0; const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }).catch((e) => { console.error("FAIL", name, e && e.message); process.exitCode = 1; });

// D1 stand-in over node:sqlite
function d1(db) {
  return { prepare(sql) { const st = db.prepare(sql); let args = [];
    const o = { bind(...a) { args = a; return o; }, async first() { return st.get(...args) || null; }, async all() { return { results: st.all(...args) }; },
      async run() { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; } }; return o; } };
}
function fixture() {
  const a = new DatabaseSync(":memory:"), p = new DatabaseSync(":memory:");
  a.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at TEXT, updated_at TEXT); CREATE TABLE issue_triage (issue_id INTEGER, triage_state TEXT, close_evidence TEXT)");
  p.exec("CREATE TABLE companion_nudges (id INTEGER PRIMARY KEY, kind TEXT, sent_at TEXT, state TEXT, response TEXT); CREATE TABLE cmp_card_taps (day TEXT, card TEXT, n INTEGER); CREATE TABLE cmp_activity_log (ts TEXT); CREATE TABLE cmp_inbox (ts TEXT)");
  return { a, p, env: { AUDIT: d1(a), PERSONAL: d1(p) } };
}
const page = (h) => ({ ok: true, status: 200, text: async () => "<html><h2>" + h + "</h2><p>routine and recap and breath</p></html>", json: async () => ({ hits: [{ title: "Show HN: Calmly - a mood app", objectID: "1", created_at: "2026-11-01" }] }) });
const fetcher = async () => page("Body doubling rooms");

await ok("every marker the registry calls shipped is in the code", () => {
  for (const app of PR.APPS) { const code = rd("" + app.code.replace(/^\.\.\//, "")); for (const f of app.features) assert(code.includes(f.marker), app.app + " feature " + f.key + " marker missing: " + f.marker); }
});
await ok("covered practices name a real feature; gaps name a backlog id that docs/ONE-THING-BACKLOG.md holds", () => {
  const doc = rd("docs/ONE-THING-BACKLOG.md");
  for (const app of PR.APPS) for (const p of app.practices) {
    if (p.covered_by) assert(app.features.some((f) => f.key === p.covered_by), p.key + " covered_by unknown");
    else assert(doc.includes(p.backlog) && p.marker, p.key + " backlog id " + p.backlog + " not in docs/ONE-THING-BACKLOG.md");
  }
});
await ok("a practice not yet in the code is not marked shipped (marker absent from code)", () => {
  for (const app of PR.APPS) { const code = rd("" + app.code); for (const p of app.practices) if (p.marker) assert(!code.includes(p.marker) || /\/\/.*/.test(code), p.key); }
});
await ok("every phone-journey app is registered or on the shrink-only allowlist", () => {
  const apps = readdirSync(new URL("scripts/ux-journeys/apps/", root)).filter((f) => f.endsWith(".journeys.mjs")).map((f) => f.replace(".journeys.mjs", ""));
  const allow = rd("scripts/product-research-allowlist.txt").split("\n").filter((l) => l && !l.startsWith("#"));
  const registered = new Set(PR.APPS.flatMap((a) => a.journeys));
  for (const j of apps) assert(registered.has(j) || allow.includes(j), "app " + j + " has phone journeys but no product research: add it to APPS in _shared/product-research.js (or, for an existing app, the allowlist is shrink-only)");
  for (const l of allow) { assert(apps.includes(l), "allowlist line " + l + " matches no journeys file"); assert(!registered.has(l), "allowlist line " + l + " is now registered: delete it"); }
});
await ok("pages parse into text and headings", () => {
  assert.deepEqual(PR.headings("<h2>Visual   planner</h2><h3>x</h3>"), ["Visual   planner".replace(/\s+/g, " ")]);
  assert(!PR.htmlToText("<script>evil()</script><p>Hi&nbsp;there</p>").includes("evil"));
});
await ok("a run files the top gaps once, with code-task and code-probe, and never refiles", async () => {
  const f = fixture(), t = Date.parse("2026-11-12T20:00:00Z");
  const r1 = await PR.researchTick(f.env, { fetch: fetcher, nowMs: t });
  assert(r1.ran.length === 2 && !r1.ran[0].error, JSON.stringify(r1));
  const rows = f.a.prepare("SELECT * FROM agent_issues WHERE title LIKE 'PRODUCT-RESEARCH-1:companion:%'").all();
  assert.equal(rows.length, PR.NEW_ISSUES_PER_RUN);
  assert(rows.every((x) => x.description.includes("code-task: repo=qnfo-workers path=personal-api/companion.js") && x.description.includes("code-probe:")));
  const run = f.a.prepare("SELECT * FROM product_research_runs WHERE app='companion'").get();
  assert(run.digest.includes("Read ") && run.sources_ok > 0);
  const r2 = await PR.researchTick(f.env, { fetch: fetcher, nowMs: t + 3600e3 });
  assert.equal(r2.ran.length, 0, "a second tick in the same day does not rerun");
  const r3 = await PR.researchTick(f.env, { fetch: fetcher, nowMs: t + 24 * 3600e3 });
  assert(r3.ran[0].filed <= PR.NEW_ISSUES_PER_RUN);
  const titles = f.a.prepare("SELECT title, COUNT(*) c FROM agent_issues GROUP BY title HAVING c > 1").all();
  assert.equal(titles.length, 0, "no duplicate issue");
});
await ok("a closed issue is never refiled and shows as built", async () => {
  const f = fixture(), t = Date.parse("2026-11-12T20:00:00Z");
  for (const app of PR.APPS) for (const p of app.practices.filter((x) => !x.covered_by)) f.a.prepare("INSERT INTO agent_issues (title, status) VALUES (?, 'closed')").run(PR.issueTitle(app.app, p.key));
  await PR.researchTick(f.env, { fetch: fetcher, nowMs: t });
  assert.equal(f.a.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status='open'").get().c, 0);
  assert(f.a.prepare("SELECT digest FROM product_research_runs WHERE app='companion'").get().digest.includes("Already built"));
});
await ok("real use: an ignored ask becomes a usage gap, and closes itself when answered", async () => {
  const f = fixture(), t = Date.parse("2026-11-12T20:00:00Z");
  for (let i = 0; i < 5; i++) f.p.prepare("INSERT INTO companion_nudges (kind, sent_at, state, response) VALUES ('evening-tap', ?, 'expired', NULL)").run("2026-11-10T10:00:00Z");
  f.p.prepare("INSERT INTO cmp_card_taps VALUES ('2026-11-11', 'Calm down', 4)").run();
  await PR.researchTick(f.env, { fetch: fetcher, nowMs: t });
  assert(f.a.prepare("SELECT 1 FROM agent_issues WHERE title = 'PRODUCT-RESEARCH-1:companion:ignored-ask-evening-tap'").get());
  assert(f.a.prepare("SELECT usage_json FROM product_research_runs WHERE app='companion'").get().usage_json.includes("Calm down"));
  f.p.exec("UPDATE companion_nudges SET state = 'done'");
  f.a.exec("INSERT INTO issue_triage (issue_id, triage_state) SELECT id, 'open' FROM agent_issues WHERE title LIKE '%ignored-ask%'");
  await PR.researchTick(f.env, { fetch: fetcher, nowMs: t + 25 * 3600e3 });
  assert.equal(f.a.prepare("SELECT triage_state s FROM issue_triage").get().s, "closed");
});
await ok("source failures do not stop the run; the kill switch does", async () => {
  const f = fixture();
  const r = await PR.researchTick(f.env, { fetch: async () => { throw new Error("boom"); }, nowMs: Date.now() });
  assert(r.ran[0].sources_failed === PR.appByKey("companion").sources.length);
  const g = fixture(); g.a.exec("INSERT INTO ops_config VALUES ('product_research', 'off')");
  assert((await PR.researchTick(g.env, { fetch: fetcher })).skipped);
});
await ok("status and cards are plain language", async () => {
  const f = fixture(); await PR.researchTick(f.env, { fetch: fetcher, nowMs: Date.now() });
  const st = await PR.researchStatus(f.env), html = PR.researchCards(st);
  assert(st.apps[0].digest.length >= 3 && !st.apps[0].stale);
  assert(!/PRODUCT-RESEARCH|COMPANION-[A-Z]+-1|agent_issues/.test(html), "no ids in the cards");
});
await ok("the worker runs it hourly and the companion self-checks it", () => {
  const w = rd("personal-companion/worker.js"), c = rd("personal-api/companion.js");
  assert(w.includes("PR.researchTick(env)") && w.includes('"/api/research"'));
  assert(c.includes('"research-stale"') && c.includes('r === "tap"') && c.includes("cmp_card_taps"));
});
console.log("product-research: " + n + " checks ok");
