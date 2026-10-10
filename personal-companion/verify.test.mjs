// COMPANION-VERIFY-1 offline suite (personal-companion 1.14.0, charter pillar: personal). Owner directive 2026-10-10: published
// content is 100% accurate and independently fact-checked; prompts carry process and style only; if a check or reviewer is
// unavailable nothing is published. Proves: an invented name, year or figure is rejected before any model reviewer sees it; two
// reviewers from families other than the writer's must both pass; a reviewer or critic outage fails closed; a critic-rejected draft
// is never force-published, even after a long silence; nothing is shown or mailed without a passing audit row; a piece with no
// recorded source is withdrawn and one that fails the audit is retracted in public; topics come from live fetches.
// Run: node personal-companion/verify.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify, W = mod.default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

// ---- the prompts carry process and style only ----------------------------------------------------------------------------------
const prompts = Object.values(V.prompts).join("\n");
ok(!/\bTOPICS\b/.test(src) && !/id: "coffeehouse-public"/.test(src), "no hard-coded topic table remains");
ok(!/coffeehouse|walking|ruins|fermentation|sourdough|kintsugi|john cage|p-adic|just intonation|musical tuning|garden|tide|clock|staircase|footnote|canal/i.test(prompts + src.slice(src.indexOf("var P_STYLE"), src.indexOf("function json("))), "no example subject noun in any prompt");
ok(!/history, music, design, language, craft, economics, biology, cities, computation/.test(prompts), "the field list is gone from the style prompt");
ok(!/a paper, a concept, a place, a piece of music/.test(prompts), "no example list of things in the notes form");
ok(/Your own memory is not a source/.test(V.prompts.P_STYLE) && !/mark the step as your inference/.test(V.prompts.P_STYLE), "the style prompt forbids facts from memory and no longer lets the model reason past its sources");
ok(/and only those/.test(V.prompts.P_ESSAY) && !/Use the specific names, dates, numbers, mechanisms and cases it contains\./.test(V.prompts.P_ESSAY), "the essay form uses only names found in the sources");
ok(/grounding/.test(V.prompts.P_CRITIQUE) && /SOURCE MATERIAL/.test(V.prompts.P_CRITIQUE), "the critic is given the sources and checks grounding");
ok(!/q\.gate = "forced"|bestRejected|forced fallback/.test(src.slice(src.indexOf("async function generate("), src.indexOf("var CRON_TABLE"))), "generate has no forced-publish path");
ok(!/\["Coffeehouse", "Walking"/.test(src), "no hard-coded fallback article list");

// ---- deterministic grounding ---------------------------------------------------------------------------------------------------
const source = "The Alpha Subject recorded 14 measurements in 1987 at the Beta Station. Surveyors at the Beta Station said the readings drifted by 2.5 percent a year. A later review by the Gamma Committee found the drift was real.";
const bad = "# What the subject shows\n\nThe Alpha Subject recorded 14 measurements in 1987. In 1863 Dr. Delmore Quill built the first Lantern Index, and 4000 readers used it.\n\n## The Objection Stands\n\nThe Gamma Committee found the drift was real.";
const probs = V.groundingProblems(bad, source);
ok(probs.some((p) => /1863/.test(p)), "an invented year is caught", probs);
ok(probs.some((p) => /Delmore|Quill/.test(p)) && probs.some((p) => /Lantern/.test(p)), "invented names are caught", probs);
ok(probs.some((p) => /4000/.test(p)), "an invented figure is caught", probs);
ok(!probs.some((p) => /Alpha|Beta|Gamma|1987|14\b|Objection/.test(p)), "what the source says, and a title-case heading, is not flagged", probs);
ok(V.groundingProblems("# Drift in the readings\n\nThe Alpha Subject recorded 14 measurements in 1987. Suppose a hypothetical station kept a ledger: the reader would see two columns.\n", source).length === 0, "a grounded piece with a labelled hypothetical has no problems");

// ---- fact-check verdicts and the two-family rule ---------------------------------------------------------------------------------
ok(V.parseFactVerdict('{"unsupported":[],"verdict":"pass"}').verdict === "pass" && V.parseFactVerdict("no json") === null && V.parseFactVerdict('{"verdict":"maybe"}') === null, "verdict parser: pass, junk, unknown verdict");
ok(V.parseFactVerdict('{"unsupported":["a -- x"],"verdict":"pass"}').verdict === "fail" && V.parseFactVerdict('{"unsupported":[],"verdict":"fail"}').unsupported.length === 1, "a pass that lists claims is a fail; a bare fail names a reason");
const fams = V.pickReviewers(["openai"], 5, 3).map(V.familyOf);
ok(fams.length >= 2 && !fams.includes("openai") && new Set(fams).size === fams.length, "reviewers come from distinct families other than the writer's", fams);
ok(!V.pickReviewers(["deepseek"], 5, 1).some((id) => /deepseek/.test(id)), "a deepseek writer is never reviewed by deepseek");

let calls = [];
let script = () => '{"unsupported":[],"verdict":"pass"}';
const goodText = "# Drift in the readings\n\nThe Alpha Subject recorded 14 measurements in 1987 at the Beta Station.";
const AI0 = { run: async (model, input) => { const c = input.messages[0].content; calls.push({ model, c }); const r = script(model, c); if (r instanceof Error) throw r; return { response: r }; } };
{
  calls = [];
  const r = await V.verifyPiece({ AI: AI0 }, bad, source, "@cf/openai/gpt-oss-120b", "s1", {});
  ok(!r.ok && r.stage === "grounding" && calls.length === 0, "a grounding failure never reaches the model reviewers", r);
}
{
  calls = []; script = () => '{"unsupported":[],"verdict":"pass"}';
  const r = await V.verifyPiece({ AI: AI0 }, goodText, source, "@cf/openai/gpt-oss-120b", "s2", {});
  const fs = new Set(calls.map((c) => V.familyOf(c.model)));
  ok(r.ok && calls.length === 2 && fs.size === 2 && !fs.has("openai"), "two reviewers, two families, neither the writer's, both pass", { ok: r.ok, n: calls.length, fs: [...fs] });
  ok(calls.every((c) => /SOURCE MATERIAL/.test(c.c) && /Alpha Subject/.test(c.c)), "reviewers see the source material and the draft");
}
{
  let n = 0; script = () => (n++ === 0 ? '{"unsupported":["The Gamma Committee -- not in source"],"verdict":"fail"}' : '{"unsupported":[],"verdict":"pass"}');
  const r = await V.factCheck({ AI: AI0 }, goodText, source, "@cf/openai/gpt-oss-120b", "s3");
  ok(!r.ok && r.unsupported.length === 1 && !r.unavailable, "one failing reviewer fails the piece and its claim is reported", r);
}
{
  script = () => new Error("model down"); calls = [];
  const r = await V.verifyPiece({ AI: AI0 }, goodText, source, "@cf/openai/gpt-oss-120b", "s4", {});
  ok(!r.ok && r.unavailable === true && /unavailable/.test(r.problems[0]), "a reviewer outage fails closed and is marked unavailable", r);
  script = (m) => /nvidia/.test(m) ? new Error("down") : '{"unsupported":[],"verdict":"pass"}';
  const r2 = await V.verifyPiece({ AI: AI0 }, goodText, source, "@cf/zzz/writer", "s5", {});
  ok(r2.unavailable === true || (r2.ok === true && r2.judges.length === 2), "one reviewer down is replaced by the next family, never waved through", r2);
}

// ---- fixtures: an in-memory personal D1 and a scripted model world -------------------------------------------------------------
const wrap = (db) => ({ prepare(sql) { const mk = (args) => ({ bind: (...a) => mk(a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); } });
function world() {
  const p = new DatabaseSync(":memory:");
  p.exec("CREATE TABLE profile (facet TEXT, label TEXT, statement TEXT, confidence REAL); CREATE TABLE activity (date TEXT, title TEXT, category TEXT, venue TEXT, city TEXT, notes TEXT, energy_label TEXT); CREATE TABLE events (start_date TEXT, title TEXT, venue TEXT, city TEXT, category TEXT); CREATE TABLE notes (ts TEXT, kind TEXT, content TEXT); CREATE TABLE companion_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, form TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, lede TEXT, body_md TEXT NOT NULL, anchor_json TEXT, quality_json TEXT, word_count INTEGER, day TEXT, created_at TEXT NOT NULL);");
  return p;
}
const sentence = "The reading at the Beta Station shows the Alpha Subject drifting, and the record of 14 measurements in 1987 keeps that pattern in view for anyone who checks it. ";
const art = (name, extra) => ("The " + name + " is the subject of this article. " + sentence.repeat(22) + (extra || "")).slice(0, 4200);
const SRC = { "Alpha Subject": art("Alpha Subject"), "Beta Station": art("Beta Station"), "Gamma Committee": art("Gamma Committee") };
function installFetch(opts) {
  opts = opts || {};
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (opts.down) throw new Error("network down");
    if (u.includes("list=random")) return new Response(JSON.stringify({ query: { random: [{ title: "Alpha Subject" }, { title: "Other Thing" }] } }), { status: 200 });
    if (u.includes("prop=links")) return new Response(JSON.stringify({ query: { pages: { 1: { title: "Alpha Subject", links: [{ title: "Beta Station" }, { title: "Gamma Committee" }, { title: "1987" }] } } } }), { status: 200 });
    if (u.includes("prop=extracts")) {
      const t = decodeURIComponent((u.match(/titles=([^&]*)/) || [])[1] || "");
      return new Response(JSON.stringify({ query: { pages: { 1: { title: t, extract: SRC[t] || "" } } } }), { status: 200 });
    }
    if (u.includes("export.arxiv.org")) return new Response("<feed><entry><id>http://arxiv.org/abs/1</id><title>A paper on drift</title><summary>" + ("The Alpha Subject drifts when measured at the Beta Station. ").repeat(8) + "</summary></entry></feed>", { status: 200 });
    return new Response("{}", { status: 404 });
  };
}
// a 2200-word essay built only from the source sentence plus an objection section
const paras = (n) => Array.from({ length: n }, () => sentence.repeat(10).trim()).join("\n\n");
const LEDE = "The Alpha Subject drifts when it is read at the Beta Station.";
const goodBody = (lede) => "# Drift in the readings\n\n" + (lede || LEDE) + "\n\n" + paras(4) + "\n\n## What would falsify this\n\nIf the record of 14 measurements in 1987 were re-run and the drift vanished, the claim would fail.\n\n## The objection\n\nThe strongest objection is that fourteen readings are too few to separate drift from noise, and the record cannot settle that.\n\n" + paras(4);
function modelWorld(o) {
  const log = { writer: 0, critic: 0, review: 0 };
  const AI = { run: async (model, input) => {
    const sys = (input.messages && input.messages[0] && input.messages[0].content) || "";
    if (input.text) return { data: [] };
    if (/strict fact-checker/.test(sys)) { log.review++; if (o.reviewDown) throw new Error("reviewer down"); return { response: o.review ? o.review(model, sys) : '{"unsupported":[],"verdict":"pass"}' }; }
    if (/adversarial reader/.test(sys)) { log.critic++; if (o.criticDown) throw new Error("critic down"); return { response: o.critic || '{"specificity":8,"argument":8,"objection":8,"voice":8,"grounding":9,"verdict":"accept","why":"ok"}' }; }
    log.writer++; return { response: typeof o.draft === "function" ? o.draft(log.writer, input) : (o.draft || goodBody()) };
  } };
  return { AI, log };
}
function makeEnv(p, mw) { return { PERSONAL: wrap(p), AI: mw.AI }; }
const count = (p, t) => p.prepare("SELECT COUNT(*) n FROM " + t).get().n;

// ---- end to end: a grounded piece is published only after both checks --------------------------------------------------------
{
  installFetch();
  const p = world(), mw = modelWorld({}), env = makeEnv(p, mw);
  const out = await V.generate(env, "essay", {});
  if (!out.ok) console.log(JSON.stringify(p.prepare("SELECT status, detail FROM companion_runs").all()).slice(0, 1500));
  ok(out.ok === true && count(p, "companion_pieces") === 1, "a grounded, reviewed essay is published", out);
  const row = p.prepare("SELECT * FROM companion_pieces").get(), au = p.prepare("SELECT * FROM companion_audits").get();
  ok(au && au.verdict === "pass" && au.slug === row.slug && /,/.test(au.models), "it carries a passing audit row naming two reviewer models", au);
  ok(row.ground_text && /Alpha Subject/.test(row.ground_text) && /Beta Station/.test(row.ground_text), "the source material is stored with the piece for later audits");
  ok(mw.log.review >= 2 && mw.log.critic === 1, "two fact-check calls and one critic call were made", mw.log);
  const list = await (await W.fetch(new Request("https://x.test/api/pieces"), env, { waitUntil() {} })).json();
  ok(list.count === 1, "the verified piece is served by the API", list);
  const idx = await (await W.fetch(new Request("https://x.test/"), env, { waitUntil() {} })).text();
  ok(/Drift in the readings/.test(idx), "and listed on the index");
  const topicRow = p.prepare("SELECT topic FROM companion_runs WHERE status = 'ok'").get();
  ok(topicRow && topicRow.topic === "wiki:Alpha Subject", "the topic came from the live fetch", topicRow);
}

// ---- an invented name or year never publishes --------------------------------------------------------------------------------
{
  installFetch();
  const p = world(), mw = modelWorld({ draft: () => goodBody(LEDE + " Dr. Delmore Quill showed this in 1863.") });
  const out = await V.generate(makeEnv(p, mw), "essay", {});
  ok(out.ok === false && count(p, "companion_pieces") === 0, "a draft with an invented name and year is not published", out);
  ok(mw.log.review === 0, "the deterministic check rejected it before any model reviewer was called", mw.log);
  const rj = p.prepare("SELECT detail FROM companion_runs WHERE status = 'rejected' LIMIT 1").get();
  ok(rj && /grounding/.test(rj.detail) && /1863/.test(rj.detail), "the run log names the ungrounded year", rj);
}

// ---- reviewers reject, or are unavailable: nothing is published ---------------------------------------------------------------
{
  installFetch();
  const p = world(), mw = modelWorld({ review: () => '{"unsupported":["the readings drifted -- source says surveyors said"],"verdict":"fail"}' });
  const out = await V.generate(makeEnv(p, mw), "essay", {});
  ok(out.ok === false && count(p, "companion_pieces") === 0, "reviewers that find an unsupported claim stop publication", out);
}
{
  installFetch();
  const p = world(), mw = modelWorld({ reviewDown: true }), env = makeEnv(p, mw);
  const out = await V.generate(env, "essay", {});
  ok(out.ok === false && count(p, "companion_pieces") === 0 && /fact-check unavailable/.test(out.error), "a reviewer outage fails closed: nothing is published", out);
}
{
  installFetch();
  const p = world(), mw = modelWorld({ criticDown: true }), env = makeEnv(p, mw);
  const out = await V.generate(env, "essay", {});
  ok(out.ok === false && count(p, "companion_pieces") === 0, "a critic outage fails closed (it used to score a neutral 5 and pass)", out);
}
{
  installFetch();
  const p = world(), mw = modelWorld({ critic: '{"specificity":3,"argument":3,"objection":3,"voice":3,"verdict":"reject","why":"flat"}' }), env = makeEnv(p, mw);
  p.exec("CREATE TABLE IF NOT EXISTS companion_pieces (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, form TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, lede TEXT, body_md TEXT NOT NULL, anchor_json TEXT, quality_json TEXT, word_count INTEGER, day TEXT, created_at TEXT NOT NULL)");
  p.prepare("INSERT INTO companion_pieces (slug, form, title, body_md, day, created_at) VALUES ('old','essay','Old piece','x','2026-09-01','2026-09-01T00:00:00Z')").run();
  const out = await V.generate(env, "essay", {});
  ok(out.ok === false && count(p, "companion_pieces") === 1, "after weeks of silence a critic-rejected draft is still not force-published", out);
}
{
  installFetch({ down: true });
  const p = world(), mw = modelWorld({}), env = makeEnv(p, mw);
  const out = await V.generate(env, "essay", {});
  ok(out.ok === false && count(p, "companion_pieces") === 0 && mw.log.writer === 0, "when the live sources cannot be fetched the run is blocked and nothing is written", out);
}

// ---- one corrective revision rescues a draft whose only fault is an unsupported claim ---------------------------------------------
{
  installFetch();
  const p = world(); let reviews = 0;
  const mw = modelWorld({ review: () => (++reviews <= 2 ? '{"unsupported":["the record keeps that pattern -- overstated"],"verdict":"fail"}' : '{"unsupported":[],"verdict":"pass"}') });
  const out = await V.generate(makeEnv(p, mw), "essay", {});
  ok(out.ok === true && mw.log.writer === 2 && count(p, "companion_pieces") === 1, "a fact-check failure triggers one revision that is re-verified before publishing", { out, log: mw.log });
}

// ---- nothing is mailed without a passing audit --------------------------------------------------------------------------------
{
  const p = world(); let sent = 0;
  const env = { PERSONAL: wrap(p), SEND_EMAIL: { send: async () => { sent++; } } };
  await V.pieceVerified(env, "none");
  p.prepare("INSERT INTO companion_pieces (slug, form, title, body_md, day, created_at) VALUES ('u1','essay','Unaudited','body','2026-10-10','2026-10-10T00:00:00Z')").run();
  const r1 = await V.sendMail(env, { title: "Unaudited", body_md: "body", form: "essay", link: "x" }, "u1", "2026-10-10");
  ok(r1.ok === false && sent === 0, "an unaudited piece is not mailed", r1);
  await V.recordAudit(env, "u1", "pass", "pass", { judges: [], problems: [] });
  const r2 = await V.sendMail(env, { title: "Audited", body_md: "body", form: "essay", link: "x" }, "u1", "2026-10-10");
  ok(r2.ok === true && sent === 1, "an audited piece is mailed", r2);
  await V.retractPiece(env, "u1", "test", []);
  const r3 = await V.sendMail(env, { title: "Audited", body_md: "body", form: "essay", link: "x" }, "u1", "2026-10-10");
  ok(r3.ok === false && sent === 1, "a retracted piece is not mailed", r3);
}

// ---- the audit and the public retraction path ------------------------------------------------------------------------------------
{
  installFetch();
  const p = world(), mw = modelWorld({}), env = makeEnv(p, mw);
  await V.pieceVerified(env, "x");
  const ins = p.prepare("INSERT INTO companion_pieces (slug, form, title, body_md, day, created_at, ground_text) VALUES (?,?,?,?,'2026-10-09','2026-10-09T00:00:00Z',?)");
  ins.run("legacy", "essay", "Legacy piece", "Some earlier text from a model's memory.", null);
  ins.run("stored-bad", "essay", "Stored bad", "The Alpha Subject recorded 14 measurements, and in 1863 Dr. Delmore Quill disagreed.", SRC["Alpha Subject"]);
  ins.run("stored-good", "essay", "Stored good", "The Alpha Subject recorded 14 measurements in 1987 at the Beta Station.", SRC["Alpha Subject"]);
  const down = modelWorld({ reviewDown: true });
  const rDown = await V.auditPublished({ PERSONAL: wrap(p), AI: down.AI }, 10);
  ok(rDown.withdrawn === 1 && rDown.retracted === 1 && rDown.deferred === 1 && count(p, "companion_audits") === 2, "with the reviewers down the audit withdraws and retracts without a model, and defers the rest (no pass written)", rDown);
  const r = await V.auditPublished(env, 10);
  ok(r.passed === 1 && p.prepare("SELECT verdict FROM companion_audits WHERE slug='stored-good'").get().verdict === "pass", "the sourced piece passes once the reviewers are back", r);
  ok(p.prepare("SELECT verdict, stage FROM companion_audits WHERE slug='stored-bad'").get().stage === "grounding", "the piece with an invented name and year failed at the grounding stage");
  ok(count(p, "companion_retractions") === 2, "the withdrawn and the failed pieces are both retracted", p.prepare("SELECT slug, reason FROM companion_retractions").all());
  const ctx = { waitUntil() {} };
  const list = await (await W.fetch(new Request("https://x.test/api/pieces"), env, ctx)).json();
  ok(list.count === 1 && list.pieces[0].slug === "stored-good", "only the verified piece is served", list.pieces.map((x) => x.slug));
  const page = await W.fetch(new Request("https://x.test/p/stored-bad"), env, ctx), t = await page.text();
  ok(page.status === 410 && /Retracted: Stored bad/.test(t) && /noindex/.test(t) && !/Dr\. Delmore Quill disagreed/.test(t) && /could not be verified/.test(t), "a retracted piece answers 410 with a public notice, not its text", t.slice(0, 200));
  const lg = await W.fetch(new Request("https://x.test/p/legacy"), env, ctx);
  ok(lg.status === 410, "a withdrawn piece answers 410 too");
  const idx = await (await W.fetch(new Request("https://x.test/"), env, ctx)).text();
  ok(!/Stored bad|Legacy piece/.test(idx) && /Stored good/.test(idx), "retracted pieces are gone from the index");
  const feed = await (await W.fetch(new Request("https://x.test/feed.xml"), env, ctx)).text();
  ok(!/stored-bad|legacy/.test(feed) && /stored-good/.test(feed), "and from the feed");
  const ra = await (await W.fetch(new Request("https://x.test/api/retractions"), env, ctx)).json();
  ok(ra.count === 2 && ra.retractions.some((x) => x.slug === "stored-bad"), "the retractions API lists them", ra);
  const rp = await (await W.fetch(new Request("https://x.test/retractions"), env, ctx)).text();
  ok(/Stored bad/.test(rp) && /Legacy piece/.test(rp), "and so does the retractions page");
  const again = await V.auditPublished(env, 10);
  ok((again.checked || 0) === 0 && (again.withdrawn || 0) === 0, "an audited piece is not audited again", again);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
