// COMPANION-SOURCES-1 offline suite (personal-companion 1.15.0). Failure mode proven live: after 1.14.1 every generation run ended
// status=blocked "insufficient anchors" (topic "none"), with no reason recorded, so reading.q08.org stayed empty. Now: source fetches
// carry a descriptive User-Agent, retry, and record why they failed; Wikipedia and arXiv are independent providers (one down, the
// other carries the piece through the unchanged accuracy gate); both down blocks with the reason logged; unpublished fetched material
// is cached and reused during an outage; a blocked run is retried at the next hourly tick; the steward collapse alert resolves itself.
// Run: node personal-companion/sources.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const load = async () => { const m = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64")); m.__verify.fetchCfg.backoff = [0, 0]; return m.__verify; };
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const wrap = (db) => ({ prepare(sql) { const mk = (args) => ({ bind: (...a) => mk(a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
function world() {
  const p = new DatabaseSync(":memory:");
  p.exec("CREATE TABLE profile (facet TEXT, label TEXT, statement TEXT, confidence REAL); CREATE TABLE activity (date TEXT, title TEXT, category TEXT, venue TEXT, city TEXT, notes TEXT, energy_label TEXT); CREATE TABLE events (start_date TEXT, title TEXT, venue TEXT, city TEXT, category TEXT); CREATE TABLE notes (ts TEXT, kind TEXT, content TEXT);");
  return p;
}
const sentence = "The reading at the Beta Station shows the Alpha Subject drifting, and the record of 14 measurements in 1987 keeps that pattern in view for anyone who checks it. ";
const art = (name) => ("The " + name + " is the subject of this article. " + sentence.repeat(22)).slice(0, 4200);
const SRC = { "Alpha Subject": art("Alpha Subject"), "Beta Station": art("Beta Station"), "Gamma Committee": art("Gamma Committee") };
const entry = (n) => "<entry><id>http://arxiv.org/abs/" + n + "</id><title>Paper " + n + " on drift</title><summary>" + sentence.repeat(3) + "</summary></entry>";
// state: wiki / arxiv are "up" or an HTTP status number or "throw"
const net = { wiki: "up", arxiv: "up", uas: [] };
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)), host = u.hostname, s = String(url);
  net.uas.push(init && init.headers && init.headers["User-Agent"]);
  const mode = host === "en.wikipedia.org" ? net.wiki : host === "export.arxiv.org" ? net.arxiv : "up";
  if (mode === "throw") throw new Error("network down");
  if (typeof mode === "number") return new Response("denied", { status: mode });
  if (host === "en.wikipedia.org") {
    if (s.includes("list=random")) return new Response(JSON.stringify({ query: { random: [{ title: "Alpha Subject" }] } }), { status: 200 });
    if (s.includes("prop=links")) return new Response(JSON.stringify({ query: { pages: { 1: { title: "Alpha Subject", links: [{ title: "Beta Station" }, { title: "Gamma Committee" }] } } } }), { status: 200 });
    const t = decodeURIComponent((s.match(/titles=([^&]*)/) || [])[1] || "");
    return new Response(JSON.stringify({ query: { pages: { 1: { title: t, extract: SRC[t] || "" } } } }), { status: 200 });
  }
  if (host === "export.arxiv.org") return new Response("<feed>" + entry(1) + entry(2) + entry(3) + "</feed>", { status: 200 });
  return new Response("{}", { status: 404 });
};
const LEDE = "The Alpha Subject drifts when it is read at the Beta Station.";
const paras = (n) => Array.from({ length: n }, () => sentence.repeat(10).trim()).join("\n\n");
const draft = () => "# Drift in the readings\n\n" + LEDE + "\n\n" + paras(4) + "\n\n## What would falsify this\n\nIf the record of 14 measurements in 1987 were re-run and the drift vanished, the claim would fail.\n\n## The objection\n\nThe strongest objection is that fourteen readings are too few to separate drift from noise, and the record cannot settle that.\n\n" + paras(4);
function models(o) {
  o = o || {};
  return { run: async (model, input) => {
    const sys = (input.messages && input.messages[0] && input.messages[0].content) || "";
    if (input.text) return { data: [] };
    if (/strict fact-checker/.test(sys)) { if (o.reviewDown) throw new Error("reviewer down"); return { response: '{"unsupported":[],"verdict":"pass"}' }; }
    if (/adversarial reader/.test(sys)) return { response: '{"specificity":8,"argument":8,"objection":8,"voice":8,"grounding":9,"verdict":"accept","why":"ok"}' };
    return { response: draft() };
  } };
}
const count = (p, t) => p.prepare("SELECT COUNT(*) n FROM " + t).get().n;
const lastRun = (p, st) => p.prepare("SELECT detail, topic FROM companion_runs WHERE status = ? ORDER BY id DESC LIMIT 1").get(st);

// ---- the User-Agent is descriptive and the contact style matches the fleet ----------------------------------------------------
{
  const V = await load();
  ok(/^qnfo-personal-companion\/\d+\.\d+\.\d+ \(https:\/\/reading\.q08\.org; mailto:[^)]+@qnfo\.org\)$/.test(V.fetchUA()), "descriptive Wikimedia-style User-Agent", V.fetchUA());
}
// ---- Wikipedia refuses (429, then 403): arXiv alone carries the piece through the full gate ---------------------------------------
for (const status of [429, 403]) {
  const V = await load(); net.wiki = status; net.arxiv = "up"; net.uas = [];
  const p = world(), env = { PERSONAL: wrap(p), AI: models() };
  const out = await V.generate(env, "essay", {});
  ok(out.ok === true && count(p, "companion_pieces") === 1, "Wikipedia " + status + ": an arXiv-only topic publishes", out);
  const row = p.prepare("SELECT ground_text FROM companion_pieces").get(), au = p.prepare("SELECT verdict, models FROM companion_audits").get();
  ok(out.topic && /^arxiv:/.test(out.topic) && row && /Paper 1 on drift/.test(row.ground_text) && /Paper 2 on drift/.test(row.ground_text), "its ground is at least two recent papers' text", out.topic);
  ok(au && au.verdict === "pass" && /,/.test(au.models), "it passed the two-reviewer audit like any other piece", au);
  ok(net.uas.every((x) => /^qnfo-personal-companion\//.test(String(x))), "every source request carried the descriptive User-Agent");
}
// ---- arXiv down: Wikipedia alone -------------------------------------------------------------------------------------------------
{
  const V = await load(); net.wiki = "up"; net.arxiv = 503;
  const p = world(), env = { PERSONAL: wrap(p), AI: models() };
  const out = await V.generate(env, "essay", {});
  const gt = p.prepare("SELECT ground_text FROM companion_pieces").get();
  ok(out.ok === true && /^wiki:/.test(out.topic) && gt && !/Paper 1 on drift/.test(gt.ground_text), "arXiv down: a Wikipedia-only topic publishes", out);
}
// ---- both down: blocked, with the reason on record; then recovery publishes ----------------------------------------------------
{
  const V = await load(); net.wiki = 429; net.arxiv = "throw";
  const p = world(), env = { PERSONAL: wrap(p), AI: models() };
  const out = await V.generate(env, "essay", {});
  const b = lastRun(p, "blocked");
  ok(out.ok === false && count(p, "companion_pieces") === 0, "both providers down: nothing is published", out);
  ok(b && /insufficient anchors/.test(b.detail) && /HTTP 429/.test(b.detail) && /network down/.test(b.detail), "the blocked run records each provider's HTTP status or error", b);
  ok(await V.blockedRetryDue(env) === true, "a blocked run is due for a retry at the next hourly tick");
  net.wiki = "up"; net.arxiv = "up";
  const again = await V.generate(env, "essay", {});
  ok(again.ok === true && count(p, "companion_pieces") === 1, "recovery: the next run publishes", again);
  ok(await V.blockedRetryDue(env) === false, "an accepted piece ends the retry");
}
// ---- a cached unpublished topic is reused during an outage ---------------------------------------------------------------------------
{
  const V = await load(); net.wiki = "up"; net.arxiv = "up";
  const p = world(), down = { PERSONAL: wrap(p), AI: models({ reviewDown: true }) };
  const first = await V.generate(down, "essay", {});
  ok(first.ok === false && p.prepare("SELECT done FROM companion_anchor_cache").get().done === 0, "fetched material that did not become a piece stays in the cache", first);
  net.wiki = "throw"; net.arxiv = 500;
  const env = { PERSONAL: wrap(p), AI: models() };
  const out = await V.generate(env, "essay", {});
  ok(out.ok === true && count(p, "companion_pieces") === 1 && p.prepare("SELECT done FROM companion_anchor_cache").get().done === 1, "with both providers down the cached material is reused and the piece passes the full gate", out);
  net.wiki = "up"; net.arxiv = "up";
}
// ---- the steward alert resolves itself --------------------------------------------------------------------------------------------------
{
  const V = await load();
  const p = world(); p.exec("CREATE TABLE companion_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at TEXT NOT NULL, form TEXT, model TEXT, topic TEXT, status TEXT, detail TEXT, ms INTEGER); CREATE TABLE companion_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, form TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, lede TEXT, body_md TEXT NOT NULL, anchor_json TEXT, quality_json TEXT, word_count INTEGER, day TEXT, created_at TEXT NOT NULL);");
  const env = { PERSONAL: wrap(p) };
  const ins = p.prepare("INSERT INTO companion_runs (run_at, form, status, detail) VALUES (datetime('now', ?), 'essay', ?, 'x')");
  ins.run("-30 hours", "ok");
  for (let i = 0; i < 12; i++) ins.run("-" + (i + 1) + " hours", "rejected");
  await V.steward(env);
  ok(p.prepare("SELECT status, detail FROM companion_runs WHERE form = 'steward' ORDER BY id DESC LIMIT 1").get().status === "alert", "a collapse raises the steward alert");
  ins.run("-0 hours", "ok");
  await V.steward(env);
  const last = p.prepare("SELECT status, detail FROM companion_runs WHERE form = 'steward' ORDER BY id DESC LIMIT 1").get();
  ok(last.status === "resolved" && /recovered/.test(last.detail), "an accepted piece resolves it", last);
  await V.steward(env);
  ok(count(p, "companion_runs") === 15 + 0 || p.prepare("SELECT COUNT(*) n FROM companion_runs WHERE form = 'steward'").get().n === 2, "and it is not re-raised or re-resolved", p.prepare("SELECT status FROM companion_runs WHERE form = 'steward'").all());
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
