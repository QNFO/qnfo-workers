import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const code = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const runs = [], prompts = [], grounds = [];
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const claim = (probability = 0.55) => ({
  claim: "Acme will publish a successor to its flagship library.",
  probability, horizon: day(120),
  resolution: `The official Acme release page shows a successor by ${day(120)}; void if the page is unavailable.`,
  watch_query: "Acme successor release", watch_urls: [],
});
const extra = { ...claim(), alternatives: [{ claim: "Acme keeps supporting the existing library.", probability: 0.25 }], indicators: ["Acme publishes a release roadmap", "Acme opens a successor repository"], secondary_claims: [claim(0.65)] };
let draft = { text: "# Acme will publish its successor\n\nAcme will release its successor with 55 percent probability, and publish a roadmap with 65 percent probability.", model: "@cf/qwen/qwen3-30b-a3b-fp8", extra };
const make = new Function("stubs", code.replace(/^export const /gm, "const ").replace(/^export default /m, "const worker = ") + `
  compose = stubs.compose;
  forecastProblems = () => [];
  ledeProblems = () => [];
  ownerDirectives = async () => [];
  runLevels = async (env, args) => ({ ...args, rows: [] });
  verifyAndRevise = stubs.verify;
  insertRun = async (env, run) => stubs.runs.push(run);
  saveReaderTests = recordAudit = queueForDistribution = pingIndexNow = emitContentSignal = async () => {};
  return { generateForecast, persistPiece, forecastDue, pickForecastSource, groundForPublished, resolveForecasts, validateForecast, renderForecastBox, worker };
`);
const F = make({
  compose: async (env, prompt) => { prompts.push(prompt); return structuredClone(draft); },
  verify: async (env, args) => { grounds.push(args.ground); return { ok: true, piece: args.piece, vr: { judges: [] } }; },
  runs,
});
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE published_pieces (id TEXT, signal_id TEXT, slug TEXT UNIQUE, title TEXT, body_md TEXT, core_concept TEXT, signal_source TEXT, published_at TEXT, sources_json TEXT, property TEXT, reads INTEGER DEFAULT 0, feedback_score REAL);
  CREATE TABLE signal_log (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, title TEXT, url TEXT, points INTEGER, num_comments INTEGER, ratio REAL, volatility_score REAL, friction_point TEXT, signal_strength TEXT, status TEXT, processed_at TEXT);
  CREATE TABLE engine_runs (status TEXT, top_signal TEXT, ran_at TEXT);
  CREATE TABLE prompt_pool (id TEXT, piece_id TEXT, structure_md TEXT, active INTEGER, created_at TEXT DEFAULT (datetime('now')));
  CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY);
`);
const DB = {
  prepare(sql) {
    let args = [];
    const s = {
      bind(...a) { args = a; return s; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
    };
    return s;
  },
  async batch(statements) {
    db.exec("BEGIN");
    try { const out = []; for (const s of statements) out.push(await s.run()); db.exec("COMMIT"); return out; }
    catch (e) { db.exec("ROLLBACK"); throw e; }
  },
};
const env = { DB, AI: { async run() { return { response: '{"outcome":"yes","basis":"1: the official release is dated before the horizon"}' }; } } };
const essay = "The Acme flagship library needs a successor. Acme published its roadmap.";
db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, signal_source, published_at) VALUES ('seed', 'archive', 'Acme roadmap', ?, 'hn:1', ?)").run(essay, new Date(Date.now() - 25 * 864e5).toISOString());
assert.equal(await F.forecastDue(env), true, "a daily forecast is due without three fresh essays");
assert.equal(await F.pickForecastSource(env), null, "an essay without a passing audit is not a source");
db.prepare("INSERT INTO q08_audits (slug, verdict) VALUES ('archive', 'pass')").run();
assert.equal((await F.pickForecastSource(env)).slug, "archive", "a 25-day-old audited essay can seed a forecast");
db.prepare("UPDATE published_pieces SET published_at = ? WHERE slug = 'archive'").run(new Date(Date.now() - 31 * 864e5).toISOString());
assert.equal(await F.pickForecastSource(env), null, "the archive stops at 30 days");
db.prepare("UPDATE published_pieces SET published_at = ? WHERE slug = 'archive'").run(new Date(Date.now() - 25 * 864e5).toISOString());
db.prepare("UPDATE q08_audits SET verdict = 'fail' WHERE slug = 'archive'").run();
assert.equal(await F.pickForecastSource(env), null, "an unaudited or failed source cannot seed a forecast");
db.prepare("UPDATE q08_audits SET verdict = 'pass' WHERE slug = 'archive'").run();

const realFetch = globalThis.fetch;
let sourceCount = 5;
const calls = [];
globalThis.fetch = async (url) => {
  const u = String(url); calls.push(u);
  if (u.includes("hn.algolia.com")) return Response.json({ hits: Array.from({ length: Math.min(sourceCount, 5) }, (_, i) => ({ url: `https://research.example.com/${i}`, created_at: "2026-10-01" })) });
  if (u.includes("gdeltproject.org")) return Response.json({ articles: sourceCount > 5 ? [{ url: "https://research.example.org/extra", seendate: "20261002" }] : [] });
  if (u.includes("/w/api.php")) return Response.json({ query: { search: [] } });
  if (u.includes("export.arxiv.org")) return new Response("<feed></feed>");
  if (u.includes("primary.example.com")) return new Response("<p>Acme shipped four successive releases in the previous year.</p>");
  if (u.includes("research.example")) return new Response("<p>Acme released its earlier library to the public in 2025.</p>" + (sourceCount > 5 ? '<a href="https://primary.example.com/releases">Official releases</a>' : ""));
  return new Response("", { status: 404 });
};
try {
  assert.equal(await F.generateForecast(env, Date.now()), null);
  assert.equal(prompts.length, 0, "insufficient research never reaches the writer");
  assert.equal(runs.at(-1).status, "deferred", "research failure remains retryable, not a rejected essay seed");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM q08_forecasts").get().n, 0);
  sourceCount = 6;
  const saved = await F.generateForecast(env, Date.now());
  assert.equal(saved?.kind, "forecast", JSON.stringify(runs));
  const row = db.prepare("SELECT * FROM q08_forecasts WHERE slug = ?").get(saved.slug);
  const snapshot = JSON.parse(row.ground_json);
  assert.ok(snapshot.sources.length >= 6 && snapshot.sources.length <= 15);
  assert.ok(snapshot.lines.every((line) => /\[R\d+\].*https:\/\/.*\d{4}-\d{2}-\d{2}/.test(line)));
  assert.ok(snapshot.sources.some((s) => s.url === "https://primary.example.com/releases"), "primary-source links are read");
  assert.ok(calls.length < 40, "discovery and document fetches stay bounded");
  assert.ok(prompts[0].includes(snapshot.lines[0]));
  const piece = db.prepare("SELECT * FROM published_pieces WHERE slug = ?").get(saved.slug);
  const sourceUrls = JSON.parse(piece.sources_json).map((s) => s.url);
  assert.ok(snapshot.sources.every((s) => sourceUrls.includes(s.url)), "every ledger URL is published in sources_json");
  assert.equal(await F.forecastDue(env), false, "daily fallback does not override today's forecast or the ratio");
  db.prepare("UPDATE published_pieces SET body_md = 'changed since publication' WHERE slug = 'archive'").run();
  assert.equal(await F.groundForPublished(env, piece), grounds[0], "re-audit uses the exact publication snapshot");
  assert.ok(grounds[0].includes(essay));
  const child = db.prepare("SELECT * FROM q08_forecast_claims WHERE slug = ?").get(saved.slug);
  assert.equal(child.probability, 0.65);
  assert.ok(child.created_at);
  assert.ok(F.renderForecastBox({ ...row, secondary_claims: [child] }).includes("Secondary prediction (65%)"));
  assert.throws(() => db.prepare("UPDATE q08_forecast_claims SET probability = 0.4").run(), /immutable/);
  assert.throws(() => db.prepare("DELETE FROM q08_forecast_claims").run(), /never dropped/);
  const invalid = structuredClone(extra); invalid.secondary_claims[0].horizon = day(2);
  assert.ok(F.validateForecast(invalid, draft.text, Date.now()).some((p) => /secondary claim.*horizon/.test(p)));
  invalid.secondary_claims = Array(6).fill(claim());
  assert.ok(F.validateForecast(invalid, draft.text, Date.now()).some((p) => /at most five/.test(p)));

  // A failed ground/claim write rolls back the publication, not just the forecast record.
  db.exec("CREATE TRIGGER reject_research BEFORE INSERT ON q08_forecasts BEGIN SELECT RAISE(ABORT, 'fixture rejects ground'); END;");
  const before = db.prepare("SELECT COUNT(*) n FROM published_pieces").get().n;
  const signalsBefore = db.prepare("SELECT COUNT(*) n FROM signal_log").get().n;
  await assert.rejects(F.persistPiece(env, draft, { core_concept: "Acme", friction_point: "Acme roadmap", signal_strength: "Forecast" }, { source: "q08", id: "seed", slug: "archive", title: "Acme", url: "https://q08.org/p/archive", points: 0, num_comments: 0, ratio: 0, volatility_score: 0, forecastGround: snapshot }, draft.model), /fixture rejects ground/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM published_pieces").get().n, before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM signal_log").get().n, signalsBefore);
  db.exec("DROP TRIGGER reject_research");

  // Settle the child while the main claim is still open and not yet due.
  db.prepare("INSERT INTO q08_forecast_claims (forecast_id, slug, claim_index, claim, probability, horizon, resolution, watch_query, watch_urls, created_at) VALUES (?, ?, 2, ?, 0.65, ?, ?, 'Acme release', '[]', ?)").run(row.id, row.slug, claim().claim, day(-1), claim().resolution, row.created_at);
  await F.resolveForecasts(env, 2);
  const settled = db.prepare("SELECT * FROM q08_forecast_claims WHERE claim_index = 2").get();
  assert.equal(settled.status, "resolved");
  assert.equal(settled.brier, 0.1225);
  assert.equal(JSON.parse(settled.evidence_json).judges.length, 2);
  assert.equal(db.prepare("SELECT status FROM q08_forecasts WHERE id = ?").get(row.id).status, "open");
  const response = await F.worker.fetch(new Request("https://q08.org/api/forecasts"), env, { waitUntil() {} });
  const publicClaims = (await response.json()).forecasts[0].secondary_claims;
  assert.equal(publicClaims.length, 2);
  assert.ok(publicClaims.every((c) => !("evidence_json" in c) && !("forecast_id" in c) && !("id" in c)));
  const calibration = await F.worker.fetch(new Request("https://q08.org/api/forecasts/calibration"), env, { waitUntil() {} });
  assert.equal(calibration.status, 200);
  assert.ok((await calibration.json()).calibration);
  db.prepare("UPDATE q08_forecasts SET status = 'void', disposition = 'retracted' WHERE id = ?").run(row.id);
  assert.equal(db.prepare("SELECT status FROM q08_forecast_claims WHERE claim_index = 1").get().status, "void");
  assert.equal(db.prepare("SELECT status FROM q08_forecast_claims WHERE claim_index = 2").get().status, "resolved");
} finally { globalThis.fetch = realFetch; db.close(); }
console.log("forecast-research: archive, minimum research, atomic storage, snapshots and secondary settlement passed");
