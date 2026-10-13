// CITE-FULLTEXT-3 / ABSTRACT-BACKFILL-1 offline suite (qnfo-research-exec 0.17.0; node:sqlite as the D1 shim). Proves:
//  1. the daily sweep queues a remediation rewrite for a complete pipeline paper whose text describes its inputs, and
//     leaves a clean one and a hand-written one (no queue row) alone;
//  2. a NULL abstract is filled from the body's Abstract section, a stored abstract is never replaced, and a hand-written
//     paper's abstract is filled too;
//  3. a sweep logged under an older rule set does not count, so the first tick after the deploy runs the new sweep.
// Run: node qnfo-research-exec/sweep-source-voice.test.mjs
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { completenessSweep, completenessSweepDue, paperCompleteness, cleanAbstract } from "./worker.js";

const d1 = (db) => ({ prepare(sql) {
  let args = [];
  const o = { bind(...a) { args = a; return o; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; } };
  return o;
} });
const sec = (h, t) => "## " + h + "\n\n" + (t + " ").repeat(30) + "\n\n";
const body = (bg) => "# A Paper\n\n" + sec("Abstract", "We derive a bound of 3 on the carry depth.") + sec("1. Introduction", "Carry depth limits adders.") + sec("2. Background and Related Work", bg) + sec("3. Methods", "We count carries.") + sec("4. Analysis", "The count is 3.") + sec("5. Results", "The bound is 3.") + sec("6. Discussion", "The bound is tight.") + sec("7. Practical Implications and Engineering Pathways", "Adders use it.") + sec("8. Conclusion", "The bound holds.") + "## References\n\n[1] arXiv:2501.00001 A work.\n";
const META = body("[4] proves the lemma. Because the supplied bibliography entry is truncated, we cite [5] only for its scope.");
const CLEAN = body("[4] proves the lemma and [5] bounds the depth by 4.");
assert.ok(paperCompleteness(META, { legacy: true }).complete, "the fixture is a complete paper");

const lp = new DatabaseSync(":memory:");
lp.exec("CREATE TABLE papers (slug TEXT, title TEXT, abstract TEXT, body_md TEXT, status TEXT)");
const ins = lp.prepare("INSERT INTO papers VALUES (?,?,?,?, 'published')");
ins.run("meta-paper", "Meta", null, META);
ins.run("clean-paper", "Clean", "A stored abstract that is long enough to keep as it is.", CLEAN);
ins.run("hand-written", "Hand", null, META);
ins.run("raw-prefix", "Raw", "A Paper ## Abstract **Author:** Rowan Brad Quni-Gudzinas We derive a bound", META);
const audit = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, attempt INTEGER, revise_count INTEGER, recover_count INTEGER);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
INSERT INTO research_queue (id, source, idea, status, paper_slug, created_at) VALUES ('q1','proposal','idea one','published','meta-paper','2026-10-01'), ('q2','proposal','idea two','published','clean-paper','2026-10-01');`);
const env = { LIVING_PAPER: d1(lp), QNFO_AUDIT: d1(audit) };

const out = await completenessSweep(env);
assert.match(out.rules, /cite-fulltext-3/);
assert.equal(out.queued, 1, "only the pipeline paper with input commentary is queued");
assert.deepEqual(out.slugs, ["meta-paper"]);
const rem = audit.prepare("SELECT * FROM research_queue WHERE source = 'remediation'").get();
assert.equal(rem.paper_slug, "meta-paper"); assert.equal(rem.stage, "ground");
assert.match(rem.summary, /CITE-FULLTEXT-1 cites a work from its summary alone: «.*supplied bibliography entry is truncated/);
assert.ok(!/incomplete:/.test(rem.summary), "a complete paper is not called incomplete");
const ab = (slug) => lp.prepare("SELECT abstract FROM papers WHERE slug = ?").get(slug).abstract;
assert.match(ab("meta-paper"), /^We derive a bound of 3 on the carry depth\./, "a NULL abstract is filled from the body's Abstract section");
assert.match(ab("hand-written"), /^We derive a bound of 3/, "a hand-written paper's abstract is filled too");
assert.equal(ab("clean-paper"), "A stored abstract that is long enough to keep as it is.", "a stored abstract is never replaced");
assert.match(ab("raw-prefix"), /^We derive a bound of 3/, "ABSTRACT-CLEAN-1: a raw-prefix abstract is repaired");
const bak = lp.prepare("SELECT slug, old_abstract, new_abstract FROM abstract_repair_bak").all();
assert.equal(bak.length, 1, "only the replaced (non-empty) abstract is backed up");
assert.equal(bak[0].slug, "raw-prefix"); assert.match(bak[0].old_abstract, /\*\*Author:\*\*/);
assert.equal(out.abstractsFilled, 3); assert.deepEqual(out.abstractSlugs.sort(), ["hand-written", "meta-paper", "raw-prefix"]);
const again = await completenessSweep(env);
assert.equal(again.queued, 0, "an open remediation row is not queued twice"); assert.equal(again.abstractsFilled, 0, "a filled abstract is not rewritten");

// 3. due logic: an old-rules sweep 1 h ago does not count; a current-rules sweep does.
const at = Date.parse("2026-10-13T12:00:00Z");
audit.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('e1', ?, 'completeness-sweep', ?, 'qnfo-research-exec', 'ok')").run(new Date(at - 3600e3).toISOString(), JSON.stringify({ scanned: 3 }));
assert.equal(await completenessSweepDue(env, at), true, "a sweep under the old rules leaves the new sweep due");
audit.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('e2', ?, 'completeness-sweep', ?, 'qnfo-research-exec', 'ok')").run(new Date(at - 1800e3).toISOString(), JSON.stringify({ rules: out.rules, scanned: 3 }));
assert.equal(await completenessSweepDue(env, at), false, "a sweep under the current rules counts");
// 4. cleanAbstract stops at the next heading (the old 2000-char slice ran into the Introduction).
const ca = cleanAbstract(META);
assert.ok(ca.startsWith("We derive a bound of 3") && !/Introduction|Carry depth/.test(ca), ca.slice(0, 120));
assert.equal(cleanAbstract("# T\n\n## Abstract\n\nshort\n\n## 1. Intro\n\nx"), "", "an abstract under 60 characters is not taken");
console.log("sweep-source-voice tests passed");
