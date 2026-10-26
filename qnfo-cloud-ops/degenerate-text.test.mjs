// DEGENERATE-TEXT-1 (1.41.0, 2026-10-26) offline suite for qnfo-cloud-ops.
// The failure: paper qnf-d66c40b5 was public with an 8,171-token "Te Te Te" model loop and a 24,586-character wall of repeated text ahead of its
// Abstract, and the publication gate scored it 100 (ok), because the score counts characters and nothing looked for repetition. Proves: (1) the
// detector finds the failure's exact shape, its near-periodic and exact-period variants, and nothing in ordinary prose, tables, code, math or lists;
// (2) the block embedded in worker.js is byte-identical to degenerate-text.mjs; (3) the sweep withdraws a degenerate paper alone, ledgered and audited,
// never an owner paper, never more than DEGEN_WITHDRAW_MAX a run, not at all when ops_config degenerate_text_withdraw is off, and never restores
// one whose body still scans degenerate; (4) a short stutter is revise, not a withdrawal.
// Run: node qnfo-cloud-ops/degenerate-text.test.mjs   -> prints "N passed, 0 failed" (Node 22: node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { degenerateTextScan, degenerateTextStrip, preHeadingText, titleDefects, DEGEN_WITHDRAW_SPAN } from "./degenerate-text.mjs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { jobQualityScore as __job, jobQualityFresh as __fresh, JOBS as __jobs, pubGateScore as __score, pubGateVerdict as __verdict, pubGateVerdictRaw as __raw, PUB_GATE_VERSION as __gateVersion, DEGEN_WITHDRAW_MAX as __max, degenerateTextScan as __scan, VERSION as __version };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 1400) : "")); } };

// ---- fixtures -------------------------------------------------------------------------------------------------------------------------
const doc = (n) => readFileSync(new URL("../docs/" + n, import.meta.url), "utf8");
const prose = doc("ENSEMBLE-POLICY.md") + "\n" + doc("OUTPUT-QUALITY-LEDGER.md") + "\n" + doc("PAPER-LEDGER.md");
// The 2026-10-26 failure, as stored: a blank line, one 24 k-character paragraph of the reconcile model's loop, then the real paper from "## Abstract".
const LOOP_HEAD = ": 1. The paper is written in LaTe LaTeTe. 2. The paper is written in LaTeTe. The paper is written in LaTeTeTe. The paper is written in LaTeTeTe. The paper is written in LaTeTeTe. The paper is written in LaTeTeTeTe TeTeTe ";
const real = "## Abstract\n\nScalable quantum computation is presently limited by the need for active error correction cycles that require millikelvin refrigeration and extensive syndrome measurement overhead.\n\n## 1. Introduction\n\n" + prose.slice(0, 9000) + "\n\n## References\n\n1. Example (2020). A title. arXiv:2001.00001\n";
const failure = "\n" + LOOP_HEAD + "Te ".repeat(8122) + "\n\n" + real;

const good = "# T\n\n## Related work\n\n" + "x".repeat(5000) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
const thin = "# T\n\n" + "y".repeat(4400);
const withLoop = (body, unit, reps) => body + "\n\n" + (unit + " ").repeat(reps) + "\n";
const distinct = (n) => Array.from({ length: n }, (_, i) => "w" + i.toString(36) + "x").join(" ");

// ---- 1. the detector ------------------------------------------------------------------------------------------------------------------
{
  const r = degenerateTextScan(failure);
  ok(r.found && r.withdraw && r.longest >= 8000 && r.share > 0.5 && r.regions === 1, "the 2026-10-26 failure is found, long enough to withdraw, one region over half the paper", r);
  ok(/^degenerate-text /.test(r.reason) && r.reason.length < 220, "the reason names the share, the longest region and where it starts, and fits the gate-reason column", r.reason);
  const s = degenerateTextStrip(failure);
  ok(s.removedChars > 24000 && !degenerateTextScan(s.text).found && s.text.includes("## Abstract") && s.text.includes("## References"), "stripping removes the loop and leaves the real paper, which then scans clean", { removed: s.removedChars });
  ok(!/Te Te/.test(s.text) && !/LaTeTe/.test(s.text), "no fragment of the loop survives the strip");
  const ph = preHeadingText(failure);
  ok(ph.chars > 24000 && ph.hasHeading, "the text ahead of the first heading is measured (24,586 characters here)", ph);
  const cleanPh = preHeadingText(real);
  ok(cleanPh.chars === 0, "a paper that opens at its first heading has no text ahead of it", cleanPh);
  ok(preHeadingText("---\ntitle: x\n---\n# T\n\nbody").chars === 0, "front matter is not text ahead of the first heading");
}
{
  // exact single-token run, exact phrase period, and the near-periodic loop that has no period
  const base = prose.slice(0, 12000);
  const runOnly = degenerateTextScan(withLoop(base, "La", 40));
  ok(runOnly.found && runOnly.longest >= 40, "a run of 40 identical tokens is found", runOnly);
  const gram = degenerateTextScan(withLoop(base, "the paper is written in LaTeX and then", 9));
  ok(gram.found && gram.regions === 1, "an 8-token phrase repeated 9 times back to back is found", gram);
  let near = "";
  for (let i = 0; i < 40; i++) near += "The paper is written in LaTe" + "Te".repeat(1 + (i % 4)) + ". ";
  const nearR = degenerateTextScan(base + "\n\n" + near);
  ok(nearR.found && nearR.longest >= 100, "the near-periodic loop (LaTeTe, LaTeTeTe, LaTeTeTeTe) with no exact period is found by the entropy window", nearR);
  ok(!degenerateTextScan(withLoop(base, "the", 5)).found && !degenerateTextScan(withLoop(base, "very", 15)).found, "a stutter under 16 tokens is not a region");
  ok(!degenerateTextScan(base).found && !degenerateTextScan(prose).found, "ordinary prose from three policy documents scans clean", degenerateTextScan(prose));
}
{
  // legitimate repetition the detector must not read: table cells, fenced code, display and inline math, a list of identical short items under 6 repeats
  const base = prose.slice(0, 8000);
  const table = "| a | b | c |\n|---|---|---|\n" + "| yes | yes | yes |\n".repeat(40);
  const code = "```python\n" + "True ".repeat(60) + "\n```\n";
  const math = "$$ " + "\\quad ".repeat(60) + " $$\n\nand $x x x x x x x x x x x x x x x x x x x x x x$ inline.\n";
  const list = "1. See the appendix\n2. See the appendix\n3. See the appendix\n4. See the appendix\n5. See the appendix\n";
  const body = base + "\n\n" + table + "\n" + code + "\n" + math + "\n" + list;
  ok(!degenerateTextScan(body).found, "tables, fenced code, display and inline math and a short repeated list are not degenerate", degenerateTextScan(body));
  ok(!degenerateTextScan("").found && !degenerateTextScan(null).found && !degenerateTextScan("word").found, "empty, null and one-word input scan clean");
}
{
  const bad = "Passive Fault Tolerance via Bruhat-Tits Tree Codes. Claim: encoding quantum information on Bruhat-Tits trees (p-adic ultrametric geometry) y";
  ok(titleDefects(bad).join() === "claim-prefix,single-letter-tail", "the published title (an idea sentence cut at 140 characters) has both defects", titleDefects(bad));
  ok(!titleDefects("Disaggregating the Photonic-Substrate Claim: A Falsifiability-First Audit of Sub-Hypotheses about Integrated Photonic Quantum Computing Platforms").length, "a real title that contains the word Claim: is not a claim prefix");
  ok(!titleDefects("Passive Fault Tolerance via Bruhat-Tits Tree Codes").length && !titleDefects("").length && !titleDefects(null).length, "an ordinary title and empty input have no defect");
}

// ---- 2. the copy in worker.js is the copy in degenerate-text.mjs ----------------------------------------------------------------------
{
  const block = (t) => { const b = t.indexOf("// DEGENERATE-TEXT-BEGIN"), e = t.indexOf("// DEGENERATE-TEXT-END"); return b >= 0 && e > b ? t.slice(b, e + "// DEGENERATE-TEXT-END".length) : ""; };
  const lib = block(readFileSync(new URL("./degenerate-text.mjs", import.meta.url), "utf8"));
  ok(lib.length > 4000 && block(src) === lib, "the DEGENERATE-TEXT block in worker.js is byte-identical to degenerate-text.mjs", { lib: lib.length, worker: block(src).length });
  const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
  ok(mirror === src, "deployed-current.worker.js is identical to worker.js");
  ok(versionAtLeast(mod.__version, "1.41.0") && mod.__gateVersion === "pub-gate-v5-degenerate", "the worker and the gate carry the new versions", { v: mod.__version, g: mod.__gateVersion });
}

// ---- 3. verdicts ----------------------------------------------------------------------------------------------------------------------
{
  const q = mod.__score(good + "\n\n" + LOOP_HEAD + "Te ".repeat(900));
  ok(q.score >= 50 && q.flag === "degenerate-text", "a loop does not lift the score past the flag: a paper that scores well and loops is degenerate-text", { score: q.score, flag: q.flag });
  const v = mod.__verdict(q, { identifier: "qnf-x" });
  ok(v.decision === "withdraw" && v.pass === 0 && /^quality:degenerate-text /.test(v.reason) && v.severe === true, "the verdict for a pipeline paper is withdraw", v);
  const o = mod.__verdict(q, { identifier: "qnfo-2025-00-own" });
  ok(o.decision === "revise" && o.pass === 0 && /^owner-paper kept published: quality:degenerate-text /.test(o.reason), "an owner paper is never withdrawn: revise with the reason", o);
  const stutter = mod.__score(good + "\n\n" + distinct(1200) + "\n\n" + "very ".repeat(30));
  const sv = mod.__verdict(stutter, { identifier: "qnf-x" });
  ok(stutter.flag === "repetition" && sv.decision === "revise" && sv.pass === 0 && /^quality:repetition 30 of /.test(sv.reason), "a 30-token stutter in a 1,200-token paper is revise (quality:repetition), not a withdrawal", { flag: stutter.flag, v: sv });
  const mid = mod.__score(good + "\n\n" + distinct(6000) + "\n\n" + "very ".repeat(150));
  ok(mid.flag === "repetition" && mod.__verdict(mid, { identifier: "qnf-x" }).decision === "revise", "a 150-token loop in a 6,000-token paper (2.5%, under both thresholds) is revise", { flag: mid.flag, d: mid.degenerate });
  const big = mod.__score(good + "\n\n" + distinct(6000) + "\n\n" + "very ".repeat(260));
  ok(big.flag === "degenerate-text" && mod.__verdict(big, { identifier: "qnf-x" }).decision === "withdraw", "a 260-token loop in a 6,000-token paper (over 200 tokens in one region) is a withdrawal", { flag: big.flag, d: big.degenerate });
  ok(mod.__score(good).flag === "" && mod.__verdict(mod.__score(good)).pass === 1, "a clean paper still passes", mod.__score(good));
  ok(DEGEN_WITHDRAW_SPAN === 200, "the withdrawal threshold is 200 tokens in one region (or 5% of the paper)");
}

// ---- 4. the sweep ---------------------------------------------------------------------------------------------------------------------
function stmtOn(dbx, sql) {
  let args = [];
  const self = {
    sql,
    bind(...a) { args = a; return self; },
    exec() { return dbx.prepare(sql).run(...args); },
    async all() { return { results: dbx.prepare(sql).all(...args) }; },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
function d1(dbx) {
  return {
    prepare: (sql) => stmtOn(dbx, sql),
    async batch(stmts) { const out = []; dbx.exec("BEGIN"); try { for (const s of stmts) { const r = s.exec(); out.push({ success: true, meta: { changes: Number(r.changes) } }); } dbx.exec("COMMIT"); } catch (e) { dbx.exec("ROLLBACK"); throw e; } return out; }
  };
}
function freshEnv({ papers, withdrawSetting, ledger }) {
  const audit = new DatabaseSync(":memory:");
  audit.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);");
  if (withdrawSetting) audit.prepare("INSERT INTO ops_config VALUES ('degenerate_text_withdraw', ?)").run(withdrawSetting);
  const living = new DatabaseSync(":memory:");
  living.exec(`CREATE TABLE papers (identifier TEXT PRIMARY KEY, title TEXT DEFAULT '', authors TEXT DEFAULT '[]', abstract TEXT, doi TEXT, version TEXT DEFAULT '1.0.0', subtitle TEXT, license TEXT, keywords TEXT, journal TEXT, paper_type TEXT, zenodo_doi TEXT, categories TEXT, "references" TEXT,
      slug TEXT, status TEXT, body_md TEXT, updated_at TEXT, release_gate_pass INTEGER DEFAULT 0, release_gate_at TEXT, release_gate_reason TEXT);
    CREATE TABLE paper_body_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, version TEXT, status TEXT, title TEXT, body_md TEXT NOT NULL, captured_at TEXT NOT NULL, reason TEXT);
    CREATE TABLE publication_gate_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, run_at TEXT DEFAULT (datetime('now')), slug TEXT, status TEXT, mode TEXT, decision TEXT, reason TEXT, score INTEGER, quality_flag TEXT, body_len INTEGER, has_abstract INTEGER, refs INTEGER, gate_version TEXT);`);
  if (ledger) living.exec(readFileSync(new URL("../migrations/living-paper/2026-10-26-paper-change-ledger.sql", import.meta.url), "utf8"));
  else living.exec("ALTER TABLE papers ADD COLUMN change_actor TEXT; ALTER TABLE papers ADD COLUMN change_reason TEXT;");
  const ins = living.prepare("INSERT INTO papers (identifier, slug, status, body_md) VALUES (?, ?, ?, ?)");
  for (const [slug, status, body, ident] of papers) ins.run(ident || slug, slug, status, body);
  return { env: { AUDIT: d1(audit), LIVING: d1(living) }, audit, living };
}
const st = (living, slug) => living.prepare("SELECT status, release_gate_pass AS pass, release_gate_reason AS reason FROM papers WHERE slug = ?").get(slug);
const looped = (n) => withLoop(good, "Te", 900 + n);

{
  const { env, living } = freshEnv({ papers: [["loop", "published", looped(0)], ["fine", "published", good], ["thin", "published", thin], ["own-loop", "published", looped(1), "qnfo-2025-00-own"]] });
  const r = await mod.__job(env);
  ok(r.status === "ok" && r.notes.withdrawn === 1 && r.notes.quarantined === 1, "the sweep withdraws exactly the one degenerate pipeline paper", r);
  ok(st(living, "loop").status === "quarantined" && st(living, "loop").pass === 0 && /^quality:degenerate-text /.test(st(living, "loop").reason), "the paper is quarantined with the gate reason, so it leaves the public list", st(living, "loop"));
  ok(st(living, "fine").status === "published" && st(living, "fine").pass === 1 && st(living, "thin").status === "published", "a clean paper and a thin paper are untouched");
  ok(st(living, "own-loop").status === "published" && st(living, "own-loop").pass === 0 && /^owner-paper kept published: quality:degenerate-text /.test(st(living, "own-loop").reason), "an owner paper stays published and is marked for revision", st(living, "own-loop"));
  const a = living.prepare("SELECT decision, status, quality_flag, gate_version FROM publication_gate_audit WHERE slug = 'loop'").all();
  ok(a.length === 1 && a[0].decision === "demote" && a[0].status === "quarantined" && a[0].quality_flag === "degenerate-text" && a[0].gate_version === "pub-gate-v5-degenerate", "one audit row records the withdrawal", a);
  const actor = living.prepare("SELECT change_actor a, change_reason r FROM papers WHERE slug = 'loop'").get();
  ok(/^qnfo-cloud-ops:pg-/.test(actor.a) && /DEGENERATE-TEXT-1/.test(actor.r), "the write names the run and the rule (it is not unattributed)", actor);
  const r2 = await mod.__job(env);
  ok(st(living, "loop").status === "quarantined" && r2.notes.restore_held === 1 && r2.notes.restored === 0 && r2.notes.withdrawn === 0, "the next run does not restore it: its body still scans degenerate", r2.notes);
  living.prepare("UPDATE papers SET body_md = ? WHERE slug = 'loop'").run(good);
  const r3 = await mod.__job(env);
  ok(st(living, "loop").status === "published" && st(living, "loop").pass === 1 && r3.notes.restored === 1, "once the body is clean the existing restore step publishes it again", { s: st(living, "loop"), n: r3.notes });
}
{
  const { env, living } = freshEnv({ ledger: true, papers: [["loop", "published", looped(0)], ["fine", "published", good]] });
  const r = await mod.__job(env);
  const rows = living.prepare("SELECT slug, kind, actor, reason, status_before, status_after, withdrawal FROM paper_change_ledger WHERE slug = 'loop' AND kind = 'update' ORDER BY seq").all();
  ok(r.status === "ok" && r.notes.withdrawn === 1 && rows.length === 1 && rows[0].status_before === "published" && rows[0].status_after === "quarantined" && Number(rows[0].withdrawal) === 1, "with the real paper ledger installed the withdrawal is one attributed ledger row flagged as a withdrawal", { notes: r.notes, rows });
  ok(/^qnfo-cloud-ops:pg-/.test(rows[0] && rows[0].actor) && /DEGENERATE-TEXT-1/.test(rows[0] && rows[0].reason), "the ledger row names the run and the rule", rows[0]);
}
{
  const n = mod.__max + 3, papers = [];
  for (let i = 0; i < n; i++) papers.push(["l" + i, "published", looped(i)]);
  papers.push(["fine", "published", good]);
  const { env, living } = freshEnv({ papers });
  const r = await mod.__job(env);
  const gone = living.prepare("SELECT COUNT(*) n FROM papers WHERE status = 'quarantined'").get().n;
  ok(gone === mod.__max && r.notes.withdrawn === mod.__max && r.notes.withdraw_cap_held === 3 && r.status === "degraded" && /DEGENERATE-TEXT-1/.test(r.reason), "a run withdraws at most DEGEN_WITHDRAW_MAX papers and reports the rest as held, degraded", { gone, notes: r.notes, reason: r.reason });
  const held = living.prepare("SELECT status, release_gate_pass p, release_gate_reason r FROM papers WHERE status = 'published' AND slug <> 'fine'").all();
  ok(held.length === 3 && held.every((h) => h.p === 0 && /^kept published, revise: quality:degenerate-text /.test(h.r)), "the held papers stay published, marked for revision with the reason", held);
  const r2 = await mod.__job(env);
  ok(r2.notes.withdrawn === 3 && r2.status === "ok" && living.prepare("SELECT COUNT(*) n FROM papers WHERE status = 'quarantined'").get().n === n, "the next run withdraws the held ones", r2.notes);
}
{
  const { env, living } = freshEnv({ withdrawSetting: "off", papers: [["loop", "published", looped(0)], ["fine", "published", good]] });
  const r = await mod.__job(env);
  ok(r.status === "ok" && r.notes.withdrawn === 0 && r.notes.withdraw_off_held === 1 && r.notes.degenerate_text_withdraw === "off" && st(living, "loop").status === "published" && st(living, "loop").pass === 0 && /^kept published, revise: quality:degenerate-text /.test(st(living, "loop").reason), "ops_config degenerate_text_withdraw = off keeps the paper published and marks it for revision (the PUB-GATE-NO-WITHDRAW-1 posture)", { notes: r.notes, s: st(living, "loop") });
}
{
  const { env, living } = freshEnv({ papers: [["stutter", "published", good + "\n\n" + distinct(1200) + "\n\n" + "very ".repeat(30)], ["fine", "published", good]] });
  const r = await mod.__job(env);
  ok(r.status === "ok" && r.notes.withdrawn === 0 && st(living, "stutter").status === "published" && st(living, "stutter").pass === 0 && /quality:repetition/.test(st(living, "stutter").reason), "a short stutter is marked for revision and stays published", { notes: r.notes, s: st(living, "stutter") });
}
{
  // a quarantine by another cause with a clean body is restored exactly as before; a quality quarantine whose body is a loop is held
  const { env, living } = freshEnv({ papers: [["q-clean", "quarantined", good], ["q-loop", "quarantined", looped(0)], ["q-other", "quarantined", good]] });
  living.prepare("UPDATE papers SET release_gate_reason = 'quality:internal-artifact' WHERE slug IN ('q-clean', 'q-loop')").run();
  living.prepare("UPDATE papers SET release_gate_reason = 'manual hold' WHERE slug = 'q-other'").run();
  const r = await mod.__job(env);
  ok(st(living, "q-clean").status === "published" && st(living, "q-loop").status === "quarantined" && st(living, "q-other").status === "quarantined" && r.notes.restored === 1 && r.notes.restore_held === 1, "restore: the clean quality quarantine returns, the loop is held, the manual hold is not touched", { notes: r.notes, a: st(living, "q-clean"), b: st(living, "q-loop"), c: st(living, "q-other") });
}

// ---- 5. the fresh lane ----------------------------------------------------------------------------------------------------------------
{
  const { env, audit, living } = freshEnv({ papers: [["old-loop", "published", looped(0)], ["new-loop", "published", looped(1)], ["new-fine", "published", good], ["q-loop", "quarantined", looped(2)], ["q-clean", "quarantined", good]] });
  living.prepare("UPDATE papers SET updated_at = '2020-01-01 00:00:00', release_gate_at = '2026-01-01T00:00:00.000Z', release_gate_pass = 1, release_gate_reason = 'ok score=100' WHERE slug = 'old-loop'").run();
  living.prepare("UPDATE papers SET updated_at = datetime('now') WHERE slug IN ('new-loop', 'new-fine')").run();
  living.prepare("UPDATE papers SET release_gate_reason = 'quality:internal-artifact' WHERE slug IN ('q-loop', 'q-clean')").run();
  ok(typeof mod.__jobs["quality-fresh"] === "function" && mod.__jobs["quality-fresh"] === mod.__fresh, "quality-fresh is a dispatchable job");
  const r = await mod.__fresh(env);
  ok(r.status === "ok" && r.notes.withdrawn === 1 && st(living, "new-loop").status === "quarantined" && st(living, "new-fine").status === "published" && st(living, "new-fine").pass === 1, "the fresh lane withdraws a degenerate paper published just now and passes a clean one", { notes: r.notes, a: st(living, "new-loop"), b: st(living, "new-fine") });
  ok(st(living, "old-loop").status === "published" && st(living, "old-loop").pass === 1, "it does not reread a paper gated long ago and not changed since (the hourly run owns those)", st(living, "old-loop"));
  ok(st(living, "q-clean").status === "quarantined" && r.notes.restored === 0, "it never restores: that stays with the hourly run", r.notes);
  ok(audit.prepare("SELECT name FROM sqlite_master WHERE name = 'quality_scores'").all().length === 0, "it writes no daily score snapshot (the table is not even created by the lane)");
  ok(living.prepare("SELECT COUNT(*) n FROM publication_gate_audit WHERE slug = 'new-loop' AND decision = 'demote'").get().n === 1 && /^pf-/.test(living.prepare("SELECT run_id r FROM publication_gate_audit WHERE slug = 'new-loop'").get().r), "one audit row, written by a pf- run");
  ok(audit.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'quality-fresh'").get().n === 1, "a lane that changed something records one event");
  const r2 = await mod.__fresh(env);
  ok(r2.notes.withdrawn === 0 && audit.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'quality-fresh'").get().n === 1 && living.prepare("SELECT COUNT(*) n FROM publication_gate_audit WHERE slug = 'new-loop'").get().n === 1, "a quiet lane records nothing and withdraws nothing twice", r2.notes);
  // DEGENERATE-TEXT-1b: a failure before the sweep's own event (the setting read) is written to the event ledger, so the lane cannot be down in silence
  const broken = freshEnv({ papers: [["x", "published", good]] });
  const realPrepare = broken.env.AUDIT.prepare;
  broken.env.AUDIT.prepare = (sql) => { if (/publication_gate_mode/.test(sql)) throw new Error("audit read refused"); return realPrepare(sql); };
  const rb = await mod.__fresh(broken.env);
  const ev = broken.audit.prepare("SELECT kind, status, text FROM cloud_ops_events WHERE kind = 'quality-fresh'").all();
  ok(rb.status === "error" && ev.length === 1 && ev[0].status === "error" && /fresh quality lane failed: .*audit read refused/.test(ev[0].text), "a fresh lane that fails before its own event leaves one error event", { rb, ev });
  // the hourly run and the fresh lane meeting on one paper leave one audit row
  const both = freshEnv({ papers: [["dup", "published", looped(3)]] });
  const [a, b] = await Promise.all([mod.__job(both.env), mod.__fresh(both.env)]);
  const rowsDup = both.living.prepare("SELECT COUNT(*) n FROM publication_gate_audit WHERE slug = 'dup' AND decision = 'demote'").get().n;
  ok(rowsDup === 1 && (a.notes.withdrawn + b.notes.withdrawn) === 1, "when both runs see the same paper only one withdraws and audits it", { rowsDup, a: a.notes.withdrawn, b: b.notes.withdrawn });
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
