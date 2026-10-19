// RECONCILE-TAIL-OK-1 (qnfo-research-exec 0.21.4, agent_issues 2721) offline suite. Runs the real stageReconcile against an in-memory
// SQLite qnfo-audit and a Map-backed R2. Proves: a long draft that ends mid-text with its last sections missing (the rem-* shape: a
// call stopped at 8192 tokens) is reconciled and the row moves to stage `complete` instead of being sent back to ground with
// "invalid paper contract"; a thin draft is still refused with that message and goes back for a rewrite; a complete draft is unchanged
// and logs nothing extra; reconcileDraftGate decides on bodyChars and the contract alone.
// Run: node qnfo-research-exec/reconcile-truncated-draft.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { stageReconcile as __stageReconcile, reconcileDraftGate as __gate, paperCompleteness as __pc, RECONCILE_MIN_DRAFT_CHARS as __min };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d).slice(0, 500) : "")); } };
const quiet = async (fn) => { const l = console.log, e = console.error, w = console.warn; console.log = () => {}; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; console.warn = w; } };

const word = "argument ";
const prose = (n) => (word.repeat(Math.ceil(n / word.length)).slice(0, n).trim() + ".");
const sec = (n, h, chars) => "## " + n + ". " + h + "\n\n" + prose(chars) + "\n";
const head = "# A Long Paper\n\n## Abstract\n\n" + prose(500) + "\n\n";
const refs = "\n## References\n\n[1] A work. arXiv:2401.00001.\n";
const longCut = head + sec(1, "Introduction", 2400) + "\n" + sec(2, "Background and Related Work", 2400) + "\n" + sec(3, "Methods", 2400) + "\n" + sec(4, "Analysis", 2400) + "\nTail entropy falls below one bit at generation $g =";
const thin = head + sec(1, "Introduction", 1200) + "\nIt ends here with a half sentence that";
const whole = head + [["Introduction", 1], ["Background and Related Work", 2], ["Methods", 3], ["Analysis", 4], ["Results", 5], ["Discussion", 6], ["Practical Implications and Engineering Pathways", 7], ["Conclusion", 8]].map(([h, n]) => sec(n, h, 1200)).join("\n") + refs;

const mk = (draft, rowId) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, agent_task_id TEXT, attempt INTEGER, revise_count INTEGER, context TEXT, published_at TEXT, doi TEXT, paper_url TEXT, error TEXT, recover_count INTEGER, terminal_rearms INTEGER, publish_due_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);`);
  db.prepare("INSERT INTO research_queue (id, status, stage, attempt, recover_count, context, source) VALUES (?, 'researching', 'reconcile', 0, 0, '{}', 'remediation')").run(rowId);
  const d1 = { prepare(sql) { let args = []; const self = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async first() { return db.prepare(sql).get(...args) || null; }, async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; return self; } };
  const store = new Map();
  store.set("pipeline/" + rowId + "/draft-0.md", draft);
  const MIRROR = { async get(k) { return store.has(k) ? { async text() { return store.get(k); } } : null; }, async head(k) { return store.has(k) ? {} : null; }, async put(k, v) { store.set(k, String(v)); } };
  return { db, store, env: { QNFO_AUDIT: d1, MIRROR, AI: {} }, row: db.prepare("SELECT * FROM research_queue WHERE id = ?").get(rowId) };
};
const events = (db, kind) => db.prepare("SELECT text FROM cloud_ops_events WHERE kind = ?").all(kind).map((r) => r.text);

// the contract facts the gate reads
const pcLong = mod.__pc(longCut), pcThin = mod.__pc(thin), pcWhole = mod.__pc(whole);
ok(pcLong.complete === false && pcLong.truncated === true && pcLong.bodyChars >= mod.__min && pcLong.tailMissing.length >= 3, "the fixture is a long, tail-truncated draft", { c: pcLong.complete, t: pcLong.truncated, b: pcLong.bodyChars, tm: pcLong.tailMissing });
ok(pcThin.complete === false && pcThin.bodyChars < mod.__min, "the thin fixture is under the minimum", pcThin.bodyChars);
ok(pcWhole.complete === true, "the whole fixture is complete", pcWhole.reasons);
ok(JSON.stringify(mod.__gate(pcLong)) === JSON.stringify({ proceed: true, incomplete: true }), "gate: a long incomplete draft proceeds, flagged incomplete");
ok(JSON.stringify(mod.__gate(pcThin)) === JSON.stringify({ proceed: false, incomplete: true }), "gate: a thin draft is refused");
ok(JSON.stringify(mod.__gate(pcWhole)) === JSON.stringify({ proceed: true, incomplete: false }), "gate: a complete draft proceeds unflagged");
ok(mod.__gate(null).proceed === false && mod.__gate({}).proceed === false, "gate: no contract is refused");

{ const t = mk(longCut, "rem-long00000");
  const r = await quiet(() => mod.__stageReconcile(t.env, t.row));
  const row = t.db.prepare("SELECT stage, status, error, recover_count FROM research_queue WHERE id = 'rem-long00000'").get();
  ok(r && r.ok === true && r.stage === "reconcile->complete", "a tail-truncated long draft is reconciled and handed to the complete stage", r);
  ok(row.stage === "complete" && row.status === "researching" && !row.error && Number(row.recover_count) === 0, "the row moved to stage complete with no error and no recover bump", row);
  ok(t.store.has("pipeline/rem-long00000/reconciled.md") && t.store.get("pipeline/rem-long00000/reconciled.md").includes("Tail entropy"), "reconciled.md was written from the draft");
  ok(events(t.db, "reconcile-incomplete-draft").length === 1 && /ends mid-text/.test(events(t.db, "reconcile-incomplete-draft")[0]), "the incomplete draft is logged once with its reasons", events(t.db, "reconcile-incomplete-draft")); }
{ const t = mk(thin, "rem-thin00000");
  const r = await quiet(() => mod.__stageReconcile(t.env, t.row));
  const row = t.db.prepare("SELECT stage, status, error, recover_count FROM research_queue WHERE id = 'rem-thin00000'").get();
  ok(r && r.ok === false && r.stage === "reconcile", "a thin draft is still refused", r);
  ok(/reconcile: invalid paper contract/.test(row.error || "") && Number(row.recover_count) === 1, "the refusal names the contract and goes back for a rewrite (recover bump)", row);
  ok(!t.store.has("pipeline/rem-thin00000/reconciled.md") && events(t.db, "reconcile-incomplete-draft").length === 0, "nothing is reconciled for a thin draft"); }
{ const t = mk(whole, "rem-whole0000");
  const r = await quiet(() => mod.__stageReconcile(t.env, t.row));
  const row = t.db.prepare("SELECT stage, error FROM research_queue WHERE id = 'rem-whole0000'").get();
  ok(r && r.ok === true && row.stage === "complete" && !row.error, "a complete draft is reconciled as before", { r, row });
  ok(events(t.db, "reconcile-incomplete-draft").length === 0, "a complete draft logs no incomplete-draft event"); }
{ const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src); ok(m && Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]) >= 21004, "VERSION is at least 0.21.4", m && m[0]); }
console.log(fail ? fail + " failed, " + pass + " passed" : pass + " passed, 0 failed");
process.exit(fail ? 1 : 0);
