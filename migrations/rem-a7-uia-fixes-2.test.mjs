// REM-A7-UIA-FIXES-2 offline suite: replays migrations/2026-10-26-rem-a7-uia-fixes-2.sql (DB: living-paper) on node:sqlite over the shared fixture of the three Ignorance Audit papers as they stand after the first file
// (rem-a7-uia-fixture.mjs, the exact sentences of the live bodies read 2026-10-26), with the live triggers' behaviour restated (version archive, ledger row, last_revised_at).
// Proves: item 2 (the synthesis' Section 2) and item 4 (the method paper's sibling list) are applied as ONE new version each with change_actor and change_reason set in the same UPDATE; the contradictory sentences ('added entire missing dimensions',
// 'omitted') are gone and nothing else changes ('co-produced', the Author contributions and Use of AI statements, the 'several of which were incorporated' sentence stay byte for byte); willful ignorance enters the list in the synthesis' order;
// a paper that moved on or lost the text is not touched; a replay is a no-op; Rollback restores both papers; the widened probe of agent_issues 100140 (read from the first probes file) reads 0 on the final state.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-uia-fixes-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { AI_AFTER, SY_AFTER, UN_AFTER, ITEM2, ITEM2B, SIB } from "./rem-a7-uia-fixture.mjs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-uia-fixes-2.sql"), "utf8");
const probesSql = readFileSync(here("./2026-10-26-rem-a7-uia-probes.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: living-paper\s*$/.test(l)), "header opts in: APPLY-BY ci, DB living-paper");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok((body.match(/^UPDATE papers SET/gm) || []).length === 2 && (body.match(/change_actor = 'rem-a7-f4:uia-source-fidelity-100140'/g) || []).length === 2 && (body.match(/change_reason = '/g) || []).length === 2, "two UPDATEs, each sets change_actor and change_reason in the same statement (PAPER-LEDGER-1)");

const NEW_A = "The human researcher then supplied twelve sharper questions that sharpened four dimensions the first extraction had already named: power analysis, the somatic/tacit dimension, the protected-ignorance probe, and the wobble.";
const NEW_B = "the human contributed sharper questions on power, body and taboo.";
const SY2 = SY_AFTER.replace(ITEM2, NEW_A).replace(ITEM2B, NEW_B);
const SIB2 = SIB.replace("discernment between generative and harmful ignorance, the gift of not-knowing)", "discernment between generative and harmful ignorance, willful ignorance, the gift of not-knowing)");
const UN2 = UN_AFTER.replace(SIB, SIB2);

const DDL = `
CREATE TABLE papers (slug TEXT PRIMARY KEY, status TEXT, version TEXT, title TEXT, abstract TEXT, body_md TEXT, updated_at TEXT, last_revised_at TEXT, version_count INTEGER DEFAULT 1, change_actor TEXT, change_reason TEXT);
CREATE TABLE paper_version_history (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, version TEXT, title TEXT, abstract TEXT, body_md TEXT, archived_at TEXT NOT NULL, superseded_by TEXT);
CREATE UNIQUE INDEX idx_pvh ON paper_version_history(slug, version);
CREATE TABLE paper_change_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, fields_changed TEXT, actor TEXT, reason TEXT, version_before TEXT, version_after TEXT, body_len_before INTEGER, body_len_after INTEGER);
CREATE TRIGGER papers_version_archive_upd AFTER UPDATE OF body_md ON papers WHEN OLD.body_md IS NOT NULL AND length(trim(OLD.body_md)) >= 40 AND NEW.body_md IS NOT OLD.body_md
BEGIN INSERT INTO paper_version_history(slug, version, title, abstract, body_md, archived_at, superseded_by) SELECT OLD.slug, OLD.version, OLD.title, OLD.abstract, OLD.body_md, datetime('now'), NEW.version
  WHERE OLD.slug IS NOT NULL AND NOT EXISTS (SELECT 1 FROM paper_version_history h WHERE h.slug = OLD.slug AND h.version IS OLD.version); END;
CREATE TRIGGER paper_ledger_au AFTER UPDATE ON papers WHEN OLD.body_md IS NOT NEW.body_md OR OLD.version IS NOT NEW.version
BEGIN INSERT INTO paper_change_ledger (slug, fields_changed, actor, reason, version_before, version_after, body_len_before, body_len_after)
  VALUES (NEW.slug, rtrim(CASE WHEN OLD.body_md IS NOT NEW.body_md THEN 'body_md,' ELSE '' END || CASE WHEN OLD.version IS NOT NEW.version THEN 'version,' ELSE '' END, ','), COALESCE(NULLIF(NEW.change_actor, ''), 'unattributed'), NEW.change_reason, OLD.version, NEW.version, length(OLD.body_md), length(NEW.body_md)); END;
CREATE TRIGGER papers_revision_meta AFTER UPDATE OF version ON papers WHEN NEW.version IS NOT OLD.version
BEGIN UPDATE papers SET last_revised_at = COALESCE(NEW.updated_at, datetime('now')), version_count = COALESCE(version_count, 1) + 1 WHERE slug = NEW.slug; END;
`;
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(DDL);
  const ins = w.prepare("INSERT INTO papers (slug, status, version, title, body_md, updated_at, last_revised_at) VALUES (?, ?, ?, ?, ?, '2026-10-26 19:17:06', '2026-10-26 19:17:06')");
  ins.run("ai4metascience-ignorance-audit", "published", "1.0.1", "AI4MetaScience", AI_AFTER);
  ins.run("ignorance-ai-pipeline-synthesis", "published", o.syVersion ?? "v0.2.1", "Knowing What We Do Not Know", o.syBody ?? SY_AFTER);
  ins.run("universal-ignorance-audit", o.unStatus ?? "published", "v0.3.1", "The Universal Ignorance Audit", UN_AFTER);
  ins.run("other-paper", "published", "1.0.0", "Other", "A body that says the human contributed the dimensions the AI's own frame omitted (power, body, taboo) but is not one of the papers.");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const P = (w, slug) => q1(w, "SELECT * FROM papers WHERE slug = ?", slug);
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM papers ORDER BY slug"), qa(w, "SELECT slug, version FROM paper_version_history ORDER BY id"), qa(w, "SELECT slug, actor FROM paper_change_ledger ORDER BY id")]);

{
  const w = world();
  w.exec(sql);
  const sy = P(w, "ignorance-ai-pipeline-synthesis"), un = P(w, "universal-ignorance-audit"), ai = P(w, "ai4metascience-ignorance-audit"), ot = P(w, "other-paper");
  ok(sy.version === "v0.2.2" && un.version === "v0.3.2" && ai.version === "1.0.1", "one new version each: v0.2.2 and v0.3.2; the AI4MetaScience paper is not touched", [sy.version, un.version, ai.version]);
  ok(sy.body_md === SY2, "synthesis: exactly the two sentences of item 2 change");
  ok(!sy.body_md.includes("added entire missing dimensions") && !sy.body_md.includes("frame omitted") && sy.body_md.includes("co-produced") && sy.body_md.includes("commissioned the forensic analyses") && sy.body_md.includes("independent adversarial analysis"), "the contradictory phrases are gone; co-production, Author contributions and the other sentences stay");
  ok(un.body_md === UN2, "method paper: exactly the sibling list changes");
  ok(un.body_md.includes("discernment between generative and harmful ignorance, willful ignorance, the gift of not-knowing)") && un.body_md.includes("several of which were incorporated into the final fifteen-question instrument"), "willful ignorance enters the list in the synthesis' order and the sentence stays at 'several'");
  ok(ot.version === "1.0.0" && ot.body_md.includes("frame omitted"), "another paper that carries the old sentence is untouched");
  for (const p of [sy, un]) ok(p.change_actor === "rem-a7-f4:uia-source-fidelity-100140" && p.updated_at > "2026-10-26 19:30" && p.last_revised_at === p.updated_at && p.version_count === 2, "attributed: " + p.slug, p);
  ok(/narrowest statement/.test(sy.change_reason) && /three sentences/.test(sy.change_reason) && /no contribution fact is added/.test(sy.change_reason) && /item 2/.test(sy.change_reason), "the synthesis change_reason names the choice and the three sentences it reconciles");
  ok(/item 4/.test(un.change_reason) && /stays at 'several'/.test(un.change_reason) && /uia-meta-audit-origin/.test(un.change_reason), "the method paper change_reason names the choice and the owner card");
  ok(q1(w, "SELECT body_md b FROM paper_version_history WHERE slug = 'ignorance-ai-pipeline-synthesis' AND version = 'v0.2.1'").b === SY_AFTER && q1(w, "SELECT body_md b FROM paper_version_history WHERE slug = 'universal-ignorance-audit' AND version = 'v0.3.1'").b === UN_AFTER, "the prior bodies are kept as snapshots of v0.2.1 and v0.3.1");
  ok(qa(w, "SELECT actor FROM paper_change_ledger").length === 2, "two ledger rows");
  // the widened probe of agent_issues 100140, as stored by the first probes file, on the final state
  const m = /SET verify_probe = '((?:[^']|'')*)', last_verdict = NULL, attempts = 0, deferred_since = NULL, module = 'rem-a7-uia-v1'/.exec(probesSql);
  const probe = m[1].replace(/''/g, "'");
  const l = new DatabaseSync(":memory:");
  l.exec("CREATE TABLE papers (slug TEXT, status TEXT, body_md TEXT)");
  const li = l.prepare("INSERT INTO papers VALUES (?, 'published', ?)");
  li.run("ai4metascience-ignorance-audit", ai.body_md); li.run("ignorance-ai-pipeline-synthesis", sy.body_md); li.run("universal-ignorance-audit", un.body_md);
  const r = qa(l, probe)[0];
  ok(r.expected === "0" && r.observed === "0", "the widened probe of 100140 reads 0 on the final state of the three papers (it read 2 before this file)", r);
  const l0 = new DatabaseSync(":memory:");
  l0.exec("CREATE TABLE papers (slug TEXT, status TEXT, body_md TEXT)");
  const l0i = l0.prepare("INSERT INTO papers VALUES (?, 'published', ?)");
  l0i.run("ai4metascience-ignorance-audit", AI_AFTER); l0i.run("ignorance-ai-pipeline-synthesis", SY_AFTER); l0i.run("universal-ignorance-audit", UN_AFTER);
  ok(qa(l0, probe)[0].observed === "2", "and read 2 on the state before this file");
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
  const w2 = world();
  w2.exec(sql);
  w2.exec(sql.split("\n").find((x) => x.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(P(w2, "ignorance-ai-pipeline-synthesis").body_md === SY_AFTER && P(w2, "ignorance-ai-pipeline-synthesis").version === "v0.2.1" && P(w2, "universal-ignorance-audit").body_md === UN_AFTER && P(w2, "universal-ignorance-audit").version === "v0.3.1", "Rollback restores both papers and versions from the snapshots");
}
{
  const w = world({ syVersion: "v0.3.0" });
  w.exec(sql);
  ok(P(w, "ignorance-ai-pipeline-synthesis").version === "v0.3.0" && P(w, "ignorance-ai-pipeline-synthesis").body_md === SY_AFTER, "a synthesis that moved to another version is left to the revision path");
  const w2 = world({ syBody: "A body without the sentences, long enough to be archived if it changed at all." });
  w2.exec(sql);
  ok(P(w2, "ignorance-ai-pipeline-synthesis").version === "v0.2.1", "a body without the target is not versioned");
  const w3 = world({ unStatus: "quarantined" });
  w3.exec(sql);
  ok(P(w3, "universal-ignorance-audit").version === "v0.3.1", "a paper that is no longer published is not touched");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
