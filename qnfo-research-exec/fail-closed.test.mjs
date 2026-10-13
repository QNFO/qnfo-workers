// qnfo-research-exec 0.18.0 offline suite (agent_issues 2500, 2502, 2473, 2494, 2399, 2105). No network, synthetic data,
// in-memory SQLite for the member tables. Proves:
//   REVISER-REREAD-1 (2500): a reviser revision whose re-review returns a HARD finding, or no readable verdict, is not queued
//     (fail closed); a passing re-review queues it; the verdict is logged in paper_revision_log.audit_summary on every path,
//     and the re-reader is a model of another family than the auditor.
//   VERIFY-EXTRACT-FAIL-CLOSED-1 (2502): an empty or unreadable claim extraction never reaches stage publish; it waits
//     (verifyUnrunAt) and the third failure fails the pass; an extractor that answers "[]" still takes the qualitative path.
//   RERUN-ROUTE-1 / REVIEW-UNRESOLVED-PARK-1 (2473): a review or revise failure re-enters once at revise with its findings, a
//     second one parks the row with its revert line, other failures re-run from ground, and each decision is a rerun-route event.
//   ERRATA-INTERNAL-CONFIRM-1 (2494): an internal-open erratum older than 30 minutes moves to detected when a second model of
//     another family confirms it and to rejected otherwise; RENDER-HEALTH needs no model; a missing paper is no-paper; a failed
//     call or a fresh row stays internal-open.
//   AI-TOKEN-BUDGET-RESEARCH-EXEC-1 (2399) and PUB-GATE-AT-PUBLISH-1 (2105): source and verdict checks.
// Run: node qnfo-research-exec/fail-closed.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { reviserMod as __reviser, errataMod as __errata, REVISER_VERSION as __rv, ERRATA_VERSION as __ev };\n").toString("base64"));
const { stageVerify, markError, parseExtractedClaims, rerunRoute, releaseGateVerdict, finalGates, paperCompleteness } = mod;

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d).slice(0, 700) : "")); } };
const quiet = async (fn) => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };

function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const self = {
        bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
      };
      return self;
    }
  };
}
// A capturing D1 for the pipeline stages (first() and all() read nothing).
function capDb() {
  const sqls = [];
  return { sqls, prepare(sql) { let args = []; const q = { bind(...x) { args = x; return q; }, async run() { sqls.push({ sql, args }); return { meta: { changes: 1 } }; }, async first() { return null; }, async all() { return { results: [] }; } }; return q; } };
}
const events = (db, kind) => db.sqls.filter((s) => /INSERT INTO cloud_ops_events/.test(s.sql) && s.args[2] === kind).map((s) => s.args[3]);
const updates = (db) => db.sqls.filter((s) => /UPDATE research_queue/.test(s.sql));

ok(versionAtLeast((src.match(/var VERSION = "([^"]+)"/) || [])[1] || "0", "0.18.0") && versionAtLeast(mod.__rv, "1.4.0") && versionAtLeast(mod.__ev, "1.6.0"), "host 0.18.0+, reviser member 1.4.0+, errata member 1.6.0+", [mod.__rv, mod.__ev]);

// ---- 2502 VERIFY-EXTRACT-FAIL-CLOSED-1 ---------------------------------------------------------------------------------
{
  const p = parseExtractedClaims;
  ok(p("").answered === false && p("").reason === "empty-reply" && p(null).answered === false, "an empty reply is not an answer");
  ok(p("[]").answered === true && p("[]").claims.length === 0 && p("[]").reason === "empty-list", "an empty list is an answer (a qualitative paper)");
  ok(p('```json\n[{"id":"Q1","statement":"x is 2"}]\n```').claims.length === 1 && p('Here: [{"id":"Q1","statement":"s"}] done').answered, "a fenced or embedded list is read");
  ok(p('{"claims":[{"id":"Q1","statement":"s"}]}').claims.length === 1, "an object holding a claims list is read");
  ok(p('{"verdict":"pass","hard":[],"soft":[]}').answered === false, "a review-shaped object (the old regex read its \"[]\" as no claims) is not an answer");
  ok(p("I could not find any claims in this paper.").answered === false && p("[{bad json").answered === false, "prose and broken JSON are not answers");
  ok(p('[{"id":"Q1"}]').answered === false && p('[{"id":"Q1"},{"x":2}]').answered === false,"a list whose entries carry no statement is not an answer");
  ok(p("<think>[1,2]</think>[]").answered === true, "a reasoning block is dropped before reading");

  const SENT = "The derivation in this paragraph restates an input value with its source and shows the arithmetic step that follows from it. ";
  const sec = (h, n) => "## " + h + "\n\n" + SENT.repeat(n) + "\n\n";
  const PAPER = "# A paper about a plant\n\n## Abstract\n\nContext, gap, approach, result and practice are stated here in order.\n\n"
    + sec("1. Introduction", 24) + sec("2. Background and Related Work", 24) + sec("3. Methods", 24) + sec("4. Analysis", 24)
    + sec("5. Results", 24) + sec("6. Discussion", 24) + sec("7. Practical Implications and Engineering Pathways", 24) + sec("8. Conclusion", 8)
    + "## References\n\n" + Array.from({ length: 8 }, (_, i) => "[" + (i + 1) + "] Work " + (i + 1) + ". arXiv:2401.0000" + i).join("\n") + "\n";
  ok(paperCompleteness(PAPER).complete && finalGates(PAPER, { bibCount: 8, minChars: 20000, structure: true }).ok, "fixture: a complete paper that passes the publish gates");
  const mk = (extract) => {
    const store = { "pipeline/x1/reconciled.md": PAPER, "pipeline/x1/grounding.md": "" };
    const db = capDb();
    const env = { QNFO_AUDIT: db, MIRROR: { async get(k) { const v = store[k]; return v == null ? null : { text: async () => v }; }, async put(k, v) { store[k] = v; } },
      AI: { async run(model, input) { const c = input.messages[0].content; return { response: c.includes("=== TASK: VERIFY_EXTRACT ===") ? extract : "" }; } } };
    return { env, db, store };
  };
  const row = (ctx, extra) => Object.assign({ id: "x1", context: JSON.stringify(ctx || {}), recover_count: 0, source: "idea-hub", stage: "verify", status: "researching" }, extra || {});
  const toPublish = (db) => updates(db).some((s) => /stage='publish'/.test(s.sql));

  let t = mk("");
  let res = await quiet(() => stageVerify(t.env, row({})));
  ok(res.ok === false && res.extractFailed === 1 && res.cause === "empty-reply" && !toPublish(t.db), "an empty extractor reply does not reach stage publish", { res, sql: updates(t.db).map((s) => s.sql) });
  const ctxW = updates(t.db).map((s) => s.args[0]).find((a) => /verifyExtractFail/.test(String(a)));
  ok(ctxW && JSON.parse(ctxW).verifyExtractFail === 1 && JSON.parse(ctxW).verifyUnrunAt, "the row waits with verifyUnrunAt and the attempt count", ctxW);
  ok(!t.store["pipeline/x1/verification.md"], "no 'qualitative' verification report is written");
  ok(events(t.db, "verify-extract-fail").some((e) => /attempt=1 reason=empty-reply/.test(e)), "the failure is logged as verify-extract-fail", events(t.db, "verify-extract-fail"));

  t = mk('{"verdict":"pass","hard":[],"soft":[]}');
  res = await quiet(() => stageVerify(t.env, row({ verifyExtractFail: 1 })));
  ok(res.extractFailed === 2 && !toPublish(t.db), "an unreadable extraction (attempt 2) waits again, no publish", res);

  t = mk("no list here");
  res = await quiet(() => stageVerify(t.env, row({ verifyExtractFail: 2 })));
  ok(res.ok === false && res.extractFailed === 3 && !toPublish(t.db) && updates(t.db).some((s) => /status='queued', stage='ground'/.test(s.sql) && /claim extraction gave no readable claim list in 3 attempts/.test(s.args[0])), "the third failed extraction fails the pass into markError (re-run from ground)", updates(t.db).map((s) => [s.sql, s.args[0]]));

  t = mk("[]");
  res = await quiet(() => stageVerify(t.env, row({})));
  ok(res.ok === true && res.stage === "verify->publish" && res.claims === 0 && /No quantitative claims were found/.test(t.store["pipeline/x1/verification.md"] || ""), "an extractor that answers [] still publishes as qualitative", res);

  t = mk("");
  res = await quiet(() => stageVerify(t.env, row({ verifyExtractFail: 1, verifyUnrunAt: new Date().toISOString() })));
  ok(res.deferred && !t.db.sqls.length, "within the wait the stage makes no call and writes nothing", res);
}

// ---- 2473 RERUN-ROUTE-1 / REVIEW-UNRESOLVED-PARK-1 ---------------------------------------------------------------------
{
  ok(rerunRoute({}, "review: 2 HARD findings unresolved").stage === "revise" && rerunRoute({}, "revise: output too short").stage === "revise", "a review or revise failure routes to revise");
  ok(rerunRoute({ error: "RERUN-ROUTE-1 revise-once: review: x" }, "review: 1 HARD").stage === "parked", "a second review/revise failure after the re-entry parks");
  ok(["verify: mismatch", "ground: arXiv down", "ensemble: timeout", "publish: x", "paper row missing"].every((m) => rerunRoute({ error: "RERUN-ROUTE-1 revise-once: review: x" }, m).stage === "ground"), "infrastructure and content failures keep the full re-run from ground");

  let db = capDb();
  await markError({ QNFO_AUDIT: db }, { id: "r1", recover_count: 0, context: JSON.stringify({ cycles: 2, verifyPass: 1, hardLeft: 2 }) }, "review: 2 HARD findings unresolved after 2 revise cycles (H1,H2)");
  let u = updates(db);
  ok(u.length === 1 && /status='researching', stage='revise'/.test(u[0].sql) && /recover_count=recover_count\+1/.test(u[0].sql) && /^RERUN-ROUTE-1 revise-once: review: 2 HARD/.test(u[0].args[0]) && JSON.parse(u[0].args[1]).cycles === 2 && JSON.parse(u[0].args[1]).verifyPass === 1 && u[0].args[3] === "r1", "the first review failure re-enters at revise with its cycle count and the mark", u.map((s) => [s.sql, s.args]));
  ok(!/stage='ground'/.test(u[0].sql), "the paper is not re-grounded");
  ok(events(db, "rerun-route").some((e) => /route=revise prior=review/.test(e)), "the decision is a rerun-route event", events(db, "rerun-route"));

  db = capDb();
  await markError({ QNFO_AUDIT: db }, { id: "r1", recover_count: 1, error: "RERUN-ROUTE-1 revise-once: review: 2 HARD findings unresolved", context: "{}" }, "review: 1 HARD findings unresolved after 3 revise cycles (H1)");
  u = updates(db);
  ok(u.length === 1 && /status='wontfix', stage='parked'/.test(u[0].sql) && /^REVIEW-UNRESOLVED-PARK-1: prior stage review; review: 1 HARD/.test(u[0].args[0]) && /Revert: status queued, stage ground/.test(u[0].args[0]) && u[0].args[0].length <= 300, "the second failure parks the row with the prior stage, the findings and the revert line", u.map((s) => s.args));
  ok(events(db, "rerun-route").some((e) => /route=parked/.test(e)), "the park is a rerun-route event");

  db = capDb();
  await markError({ QNFO_AUDIT: db }, { id: "r2", recover_count: 0 }, "verify: unresolved after revision - gates=gate-refs");
  u = updates(db);
  ok(u.length === 1 && /status='queued', stage='ground'/.test(u[0].sql) && u[0].args[0] === "verify: unresolved after revision - gates=gate-refs" && events(db, "rerun-route").some((e) => /route=ground/.test(e)), "a verify failure keeps the re-run from ground and logs it", u.map((s) => s.sql));

  db = capDb();
  await markError({ QNFO_AUDIT: db }, { id: "r3", recover_count: 3 }, "review: 1 HARD");
  ok(updates(db).some((s) => /stage='parked'/.test(s.sql) && /PARKED-POISON-1/.test(s.args[0])), "an exhausted recover_count still parks as PARKED-POISON-1");
}

// ---- 2500 REVISER-REREAD-1 ---------------------------------------------------------------------------------------------
{
  const freshDbs = () => {
    const audit = new DatabaseSync(":memory:");
    audit.exec(`CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, doi TEXT, title TEXT, version_from TEXT, version_to TEXT, audit_summary TEXT, findings_json TEXT, status TEXT DEFAULT 'queued', changelog TEXT, new_doi TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE version_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, paper_doi TEXT, slug TEXT, title TEXT, version_from TEXT, version_to TEXT, corrected_md TEXT, status TEXT, references_bib TEXT, citation_audit TEXT, due_diligence TEXT, project_plan TEXT, readme_md TEXT, verify_script TEXT, verify_output TEXT, license_md TEXT, created_at TEXT, updated_at TEXT);`);
    const papers = new DatabaseSync(":memory:");
    papers.exec("CREATE TABLE papers (slug TEXT PRIMARY KEY, doi TEXT, zenodo_doi TEXT, title TEXT, version TEXT, body_md TEXT, paper_type TEXT, status TEXT, created_at TEXT)");
    papers.prepare("INSERT INTO papers (slug, title, version, body_md, paper_type, status, created_at) VALUES ('p1', 'A Paper', '1.0.0', ?, 'paper', 'published', datetime('now'))").run("# A Paper\n\n## Abstract\n\nThis sentense has a typo in the abstract.\n\n## 1. Body\n\n" + "The body states its argument in plain words. ".repeat(260));
    return { audit, papers };
  };
  const audit = JSON.stringify({ issues: [{ severity: "low", category: "spelling", location: "This sentense has a typo", fix: "This sentence has a typo", reason: "spelling", confidence: 0.9 }] });
  const run = async (rereadReply) => {
    const { audit: a, papers } = freshDbs();
    const calls = [];
    const AI = { async run(model, input) { const c = input.messages[0].content; calls.push({ model, c }); if (c.includes("second, independent reader")) { if (rereadReply instanceof Error) throw rereadReply; return { response: rereadReply }; } return { response: audit }; } };
    await quiet(() => mod.__reviser.scheduled({ cron: "37 */4 * * *" }, { AI, PAPERS_DB: d1(papers), WATCH_DB: d1(a) }, { waitUntil() {} }));
    const log = a.prepare("SELECT status, audit_summary, error FROM paper_revision_log").all();
    return { calls, log, queued: a.prepare("SELECT * FROM version_queue").all(), summary: log[0] ? JSON.parse(log[0].audit_summary || "{}") : {} };
  };
  let r = await run('{"verdict":"fail","hard":[{"change":1,"reason":"the change alters the stated result"}]}');
  const rr = r.calls.find((c) => c.c.includes("second, independent reader"));
  ok(rr && rr.model !== r.calls[0].model && /gpt-oss/.test(rr.model), "the re-reader is another model family than the auditor", r.calls.map((c) => c.model));
  ok(rr && rr.c.includes("BEFORE: This sentense has a typo") && rr.c.includes("AFTER: This sentence has a typo") && rr.c.includes("This sentence has a typo in the abstract."), "the re-reader sees each change and the revised text around it");
  ok(r.queued.length === 0 && r.log.length === 1 && r.log[0].status === "needs-substantive-revision" && /REVISER-REREAD-1: 1 HARD finding/.test(r.log[0].error), "a revision whose re-review fails is not queued", r);
  ok(r.summary.reread && r.summary.reread.verdict === "fail" && r.summary.reread.hard === 1 && /alters the stated result/.test(r.summary.reread.reasons[0]), "the failing verdict is logged in audit_summary", r.summary);
  r = await run("I think it is fine.");
  ok(r.queued.length === 0 && r.log[0].status === "reread-unjudged" && r.summary.reread.verdict === null, "no readable verdict fails closed (not queued, left for the next scan)", r.log);
  r = await run(new Error("3046 timeout"));
  ok(r.queued.length === 0 && r.log[0].status === "reread-unjudged" && /model call failed/.test(r.summary.reread.error), "a failed re-review call fails closed", r.summary);
  r = await run('{"verdict":"pass","hard":[{"change":1,"reason":"x"}]}');
  ok(r.queued.length === 0 && r.log[0].status === "needs-substantive-revision", "a 'pass' that lists a HARD finding is a fail", r.log);
  r = await run('{"verdict":"pass","hard":[]}');
  ok(r.queued.length === 1 && /This sentence has a typo/.test(r.queued[0].corrected_md) && r.log[0].status === "queued" && r.summary.reread.verdict === "pass", "a passing re-review queues the revision and logs the verdict", r.log);
}

// REVISER-REREAD-1 also covers the gate-blocked enrichment: its Prior Work section comes only from the revision's own
// bibliography, never from an unjudged arXiv keyword search with summaries.
{
  const s = src.indexOf("async function enrichGateBlocked("), e = src.indexOf("async function drainV2(");
  const body = src.slice(s, e);
  ok(s > 0 && e > s && !/fetch\(/.test(body) && !/export\.arxiv\.org/.test(body) && /bibBlocks/.test(body), "enrichGateBlocked inserts no arXiv search hits");
}

// ---- 2494 ERRATA-INTERNAL-CONFIRM-1-------------------------------------------------------------------------------------
{
  const audit = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE internal_errata (id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_ref TEXT NOT NULL, detected_at TEXT NOT NULL, detected_by TEXT, severity TEXT DEFAULT 'high', claim_text TEXT, falsification TEXT, evidence TEXT, remediation TEXT, status TEXT DEFAULT 'open', owner TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE "errata_queue" (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER UNIQUE, source TEXT NOT NULL DEFAULT 'inbound-email', sender TEXT, subject TEXT, paper_doi TEXT, claim TEXT, confidence REAL, status TEXT DEFAULT 'detected', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE errata_watch (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, classification TEXT DEFAULT 'general', received_at TEXT DEFAULT (datetime('now')));
CREATE TABLE email_suppression (email TEXT PRIMARY KEY, reason TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')));`);
  const papers = new DatabaseSync(":memory:");
  papers.exec("CREATE TABLE papers (slug TEXT PRIMARY KEY, title TEXT, version TEXT, doi TEXT, zenodo_doi TEXT, body_md TEXT)");
  papers.prepare("INSERT INTO papers (slug, title, version, body_md) VALUES ('true-paper', 'True Paper', '1.0.0', 'The value is stated as measured in section 2.'), ('false-paper', 'False Paper', '1.0.0', 'Smith (2020) defines the term.'), ('render-paper', 'Render Paper', '1.0.0', 'x')").run();
  const OLD = "2026-10-01 00:00:00";
  const addQ = (id, sender, doi, claim, created) => {
    audit.prepare("INSERT INTO internal_errata (id, target_kind, target_ref, detected_at, detected_by, claim_text, status) VALUES (?1, 'paper', ?2, ?3, ?4, ?5, 'open')").run(id, doi || "none", OLD, sender, claim);
    audit.prepare("INSERT INTO errata_queue (email_id, source, sender, subject, paper_doi, claim, confidence, status, created_at) VALUES (NULL, 'internal_audit', ?1, ?2, ?3, ?4, 1.0, 'internal-open', ?5)").run(sender, id, doi, claim, created || OLD);
  };
  addQ("rev-true", "qnfo-paper-reviser/1.3.2-folded", "true-paper", '[quantitative-justification] stated as measured with no measurement. At: "The value is stated as measured"');
  addQ("ops-false", "qnfo-ops", "false-paper", "the paper misattributes the definition to Jones");
  addQ("render-1", "qnfo-gateway RENDER-HEALTH-1 (render sweep)", "render-paper", "151 plain-text formulas");
  addQ("gone-1", "research-code/agentic-collapse", "10.9999/dead.1", "trajectory inconsistent");
  addQ("fresh-1", "qnfo-ops", "true-paper", "a fresh finding", new Date().toISOString().slice(0, 19).replace("T", " "));
  const calls = [];
  let mode = "ok";
  const AI = { async run(model, input) {
    const c = input.messages[0].content; calls.push({ model, input });
    if (mode === "throw") throw new Error("upstream 503");
    if (c.includes("Smith (2020)")) return { choices: [{ message: { content: '{"confirmed": false, "why": "The text says Smith (2020) defines it, not Jones."}' } }] };
    return { response: '{"confirmed": true, "why": "The text says \\"The value is stated as measured\\"."}' };
  } };
  globalThis.fetch = async () => new Response("{}", { status: 404 });
  const env = { AI, WATCH_DB: d1(audit), AUDIT_DB: d1(audit), PAPERS_DB: d1(papers) };
  const tick = () => quiet(() => mod.__errata.scheduled({ cron: "0 * * * *", scheduledTime: Date.now(), tickEntry: true }, env, { waitUntil() {}, passThroughOnException() {} }));
  const q = (id) => audit.prepare("SELECT status FROM errata_queue WHERE subject = ?").get(id).status;
  const ie = (id) => audit.prepare("SELECT status, remediation FROM internal_errata WHERE id = ?").get(id);
  await tick();
  ok(q("rev-true") === "detected" && q("ops-false") === "rejected" && q("render-1") === "detected", "the first tick confirms, rejects and confirms the three oldest rows (at most 3)", ["rev-true", "ops-false", "render-1"].map(q));
  ok(q("gone-1") === "internal-open" && q("fresh-1") === "internal-open", "the fourth row waits for the next tick and a fresh row is untouched");
  ok(calls.length === 2, "RENDER-HEALTH is confirmed without a model call", calls.map((c) => c.model));
  ok(/gpt-oss-120b/.test(calls[0].model) && calls[0].input.max_tokens > 0, "a reviser finding is checked by gpt-oss-120b (another family than the reviser's model)", calls[0].model);
  ok(/kimi-k2\.6/.test(calls[1].model) && calls[1].input.chat_template_kwargs && calls[1].input.chat_template_kwargs.thinking === false, "any other finding is checked by kimi-k2.6 with thinking off", calls[1]);
  ok(calls[0].input.messages[0].content.includes("The value is stated as measured in section 2.") && calls[0].input.messages[0].content.includes("CLAIM: [quantitative-justification]"), "the checker reads the claim and the paper text");
  ok(ie("ops-false").status === "rejected" && /not confirmed by .*kimi.*Jones/.test(ie("ops-false").remediation), "a rejected finding is rejected in internal_errata with the reason", ie("ops-false"));
  ok(ie("rev-true").status === "open" && /confirmed by .*gpt-oss/.test(ie("rev-true").remediation) && /RENDER-HEALTH/.test(ie("render-1").remediation), "a confirmed finding records who confirmed it");
  const w = JSON.parse(audit.prepare("SELECT value FROM errata_watch WHERE key = 'tick:errata-watch'").get().value);
  ok(w.internal_confirm && w.internal_confirm.candidates === 3 && w.internal_confirm.confirmed === 2 && w.internal_confirm.rejected === 1, "tick:errata-watch records internal_confirm", w.internal_confirm);
  mode = "throw";
  addQ("throw-1", "qnfo-ops", "true-paper", "a finding the checker cannot answer now");
  await tick();
  ok(q("gone-1") === "no-paper" && /no paper in the corpus matches 10\.9999\/dead\.1/.test(ie("gone-1").remediation), "a finding whose paper is not in the corpus becomes no-paper", q("gone-1"));
  ok(q("throw-1") === "internal-open", "a failed model call leaves the row internal-open for the next tick");
  mode = "ok";
  await tick();
  ok(q("throw-1") === "detected" && q("fresh-1") === "internal-open", "the next tick confirms it; the fresh row still waits");
  // The respond member now sees the confirmed rows.
  ok(audit.prepare("SELECT COUNT(*) n FROM errata_queue WHERE status = 'detected'").get().n === 3, "three rows reach errata-respond as detected");
  // The issue-2494 probe, verbatim, on this database.
  ok(audit.prepare("SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM errata_queue WHERE status = 'internal-open' AND datetime(created_at) < datetime('now', '-24 hours')) AS TEXT) AS observed").get().observed === "0", "the issue-2494 probe reads 0");
  const h = await (await mod.default.fetch(new Request("https://qnfo-research-exec.q08.workers.dev/errata-hub/health"), {}, {})).json();
  ok(h.internal_confirm === true && h.capabilities.includes("internal-errata-confirm") && /ERRATA-INTERNAL-CONFIRM-1/.test(h.limitations.join(" ")) && versionAtLeast(h.version, "1.6.0"), "/errata-hub/health states the confirmation step", h.version);
}

// ---- 2399 and 2105 -----------------------------------------------------------------------------------------------------
{
  const runs = src.match(/env\.AI\.run\(MODEL, \{ messages: \[\{ role: "user", content: prompt \}\][^)]*\)/g) || [];
  ok(runs.length === 2 && runs.every((r) => /max_tokens: 4096, temperature: 0 \}, \{ gateway/.test(r)), "both errata env.AI.run calls carry an explicit token budget", runs);
  // The verdict is the qnfo-cloud-ops PUB-GATE-LOOP-1 gate, function for function.
  const ops = readFileSync(new URL("../qnfo-cloud-ops/worker.js", import.meta.url), "utf8");
  const fnText = (name) => { const s = ops.indexOf("function " + name + "("); let d = 0; for (let i = ops.indexOf("{", s); i < ops.length; i++) { if (ops[i] === "{") d++; else if (ops[i] === "}" && --d === 0) return ops.slice(s, i + 1); } return ""; };
  const opsGate = new Function(fnText("pubGateScore") + "\n" + fnText("pubGateVerdict") + "\nreturn function (md) { return pubGateVerdict(pubGateScore(md)); };")();
  const bodies = ["", "short", "x".repeat(3000), "# T\n\n## Prior Work\n\n" + "word ".repeat(3000), "y".repeat(5000) + " arXiv:2401.00001 arXiv:2401.00002 10.1000/abc", "z".repeat(4500) + "\n| a | b |\n|---|---|\n| 1 | 2 |\n```py\nx\n```\n## Related Work\n" + " arxiv.org/abs/2401.00001".repeat(12)];
  ok(bodies.every((b) => { const a = releaseGateVerdict(b), o = opsGate(b); return a.pass === o.pass && a.reason === o.reason; }), "releaseGateVerdict equals the qnfo-cloud-ops verdict on every sample", bodies.map((b) => [releaseGateVerdict(b).reason, opsGate(b).reason]));
  const pubs = src.split("\n").filter((l) => /UPDATE papers SET [^"]*status='published',/.test(l));
  ok(pubs.length === 3 && pubs.filter((l) => /release_gate_pass=\?2, release_gate_at=\?3, release_gate_reason=\?4/.test(l)).length === 2, "the two research publish stages write the gate verdict with the published status", pubs.map((l) => l.trim().slice(0, 120)));
  ok(/UPDATE papers SET release_gate_pass=\?2, release_gate_at=\?3, release_gate_reason=\?4 WHERE slug=\?1 AND status='published'"\)\.bind\(vSlug/.test(src), "the version-queue publish writes the verdict of the body it publishes");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
