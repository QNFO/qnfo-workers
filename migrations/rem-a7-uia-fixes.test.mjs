// REM-A7-UIA-FIXES-1 offline suite: replays migrations/2026-10-26-rem-a7-uia-fixes.sql (DB: living-paper) on node:sqlite over a fixture of the three Ignorance Audit papers. The fixture bodies hold the exact sentences of the live
// bodies (read 2026-10-26) around each target, with the live triggers' behaviour restated: the version archive (the prior body kept as a snapshot of the old version), the ledger row with actor and reason, and last_revised_at.
// Proves: the header opts in and the file deletes nothing; each paper gets ONE new version with change_actor and change_reason set in the same UPDATE; the targets of items 1, 3 and 5 are replaced exactly and nothing else in the
// body changes (item 2 and item 4 sentences stay byte for byte, 'independent' stays where it does not name the commissioned analyses); a paper whose text no longer carries a target, or whose version moved, is not touched;
// a replay is a no-op; Rollback restores each paper from its snapshot.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-uia-fixes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-uia-fixes.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: living-paper\s*$/.test(l)), "header opts in: APPLY-BY ci, DB living-paper");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\bLIKE\s+'[^']{50,}'/i.test(body), "no LIKE pattern over 50 bytes");
ok((body.match(/^UPDATE papers SET/gm) || []).length === 3 && !/UPDATE papers SET[^;]*\bstatus\s*=/.test(body.replace(/WHERE[\s\S]*?;/g, ";")), "three UPDATE statements, none of them changes a status");
ok((body.match(/change_actor = 'rem-a7-f4:uia-source-fidelity-100140'/g) || []).length === 3 && (body.match(/change_reason = '/g) || []).length === 3, "every UPDATE sets change_actor and change_reason in the same statement (PAPER-LEDGER-1)");

import { EN, U_OLD, U_NEW, TITLE_OLD, TITLE_NEW, AI, AI_AFTER, ITEM2, ITEM2B, SY, SY_AFTER, SIB, UN, UN_AFTER } from "./rem-a7-uia-fixture.mjs";
void U_OLD; void U_NEW; void TITLE_OLD; void TITLE_NEW;
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
  const ins = w.prepare("INSERT INTO papers (slug, status, version, title, body_md, updated_at, last_revised_at) VALUES (?, ?, ?, ?, ?, '2026-10-12 16:01:16', '2026-08-20')");
  ins.run("ai4metascience-ignorance-audit", o.aiStatus ?? "published", o.aiVersion ?? "1.0.0", "Epistemic Legibility", o.aiBody ?? AI);
  ins.run("ignorance-ai-pipeline-synthesis", "published", "v0.2", "Knowing What We Do Not Know", o.syBody ?? SY);
  ins.run("universal-ignorance-audit", "published", "v0.3", "The Universal Ignorance Audit", UN);
  ins.run("other-paper", "published", "1.0.0", "Other", "A body that mentions two independent analyses and (Whitcomb et al. 2015) but is not one of the three papers.");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const P = (w, slug) => q1(w, "SELECT * FROM papers WHERE slug = ?", slug);
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM papers ORDER BY slug"), qa(w, "SELECT slug, version FROM paper_version_history ORDER BY id"), qa(w, "SELECT slug, actor FROM paper_change_ledger ORDER BY id")]);

{
  const w = world();
  w.exec(sql);
  const ai = P(w, "ai4metascience-ignorance-audit"), sy = P(w, "ignorance-ai-pipeline-synthesis"), un = P(w, "universal-ignorance-audit"), ot = P(w, "other-paper");
  ok(ai.version === "1.0.1" && sy.version === "v0.2.1" && un.version === "v0.3.1", "one new version each: 1.0.1, v0.2.1, v0.3.1", [ai.version, sy.version, un.version]);
  ok(ai.body_md === AI_AFTER, "ai4metascience: items 1, 3 and 5 are applied exactly and nothing else changes", ai.body_md.slice(0, 120));
  ok(sy.body_md === SY_AFTER, "synthesis: item 5 is applied at the four places that name the commissioned analyses, nothing else changes");
  ok(un.body_md === UN_AFTER, "method paper: the Whitcomb record and its in-text year are corrected, nothing else changes");
  ok(sy.body_md.includes(ITEM2) && sy.body_md.includes(ITEM2B) && un.body_md.includes(SIB), "items 2 and 4 are not applied: their sentences stay byte for byte");
  ok(sy.body_md.includes("independent adversarial analysis") && sy.body_md.includes("independent validations") && sy.body_md.includes("not independent") && sy.body_md.includes("solicit independent analysis") && ai.body_md.includes("Content-independent") && ai.body_md.includes("independent evaluation"), "'independent' stays where it does not name the commissioned analyses");
  ok(!ai.body_md.includes("ultrametric-foundation") && ai.body_md.includes("papers/qwave-qudit-advantage") && !ai.body_md.includes("13, 1" + EN + "29"), "the three probe conditions of issue-100140 for the AI4MetaScience paper read clear");
  ok(ot.version === "1.0.0" && ot.body_md.includes("two independent analyses") && ot.body_md.includes("Whitcomb et al. 2015"), "another paper is untouched");
  for (const p of [ai, sy, un]) {
    ok(p.change_actor === "rem-a7-f4:uia-source-fidelity-100140" && /UIA-SOURCE-FIDELITY-1/.test(p.change_reason) && /100140/.test(p.change_reason) && p.updated_at > "2026-10-26" && p.last_revised_at === p.updated_at && p.version_count === 2, "attributed: " + p.slug, p);
  }
  ok(/Items 2 and 4 are judgement edits and are not applied/.test(ai.change_reason) && /decoder/.test(ai.change_reason) && /P_decode/.test(ai.change_reason), "the AI4MetaScience change_reason records the re-check and the discrepancy with the issue's quote");
  ok(qa(w, "SELECT slug, version, body_md FROM paper_version_history ORDER BY slug").length === 3 && q1(w, "SELECT body_md b FROM paper_version_history WHERE slug = 'ai4metascience-ignorance-audit' AND version = '1.0.0'").b === AI && q1(w, "SELECT body_md b FROM paper_version_history WHERE slug = 'universal-ignorance-audit' AND version = 'v0.3'").b === UN, "the prior body of each paper is kept as a snapshot of its old version");
  ok(qa(w, "SELECT actor FROM paper_change_ledger").length === 3 && qa(w, "SELECT actor FROM paper_change_ledger").every((r) => r.actor === "rem-a7-f4:uia-source-fidelity-100140"), "three ledger rows, all attributed");
  // replay
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing (the old version no longer matches)");
  // rollback
  const w2 = world();
  w2.exec(sql);
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(P(w2, "ai4metascience-ignorance-audit").body_md === AI && P(w2, "ai4metascience-ignorance-audit").version === "1.0.0" && P(w2, "ignorance-ai-pipeline-synthesis").body_md === SY && P(w2, "universal-ignorance-audit").body_md === UN && P(w2, "universal-ignorance-audit").version === "v0.3", "Rollback restores bodies and versions from the snapshots");
  ok(/rollback/.test(P(w2, "universal-ignorance-audit").change_actor), "the rollback is attributed too");
}
{
  // a paper whose text no longer carries any target, or whose version moved: nothing is written
  const w = world({ aiBody: "A body with none of the target sentences, long enough to be archived if it changed." });
  w.exec(sql);
  ok(P(w, "ai4metascience-ignorance-audit").version === "1.0.0" && P(w, "ai4metascience-ignorance-audit").body_md.startsWith("A body with none") && qa(w, "SELECT slug FROM paper_version_history WHERE slug = 'ai4metascience-ignorance-audit'").length === 0, "no target in the body: no version bump, no snapshot");
  const w3 = world({ aiVersion: "1.1.0" });
  w3.exec(sql);
  ok(P(w3, "ai4metascience-ignorance-audit").version === "1.1.0" && P(w3, "ai4metascience-ignorance-audit").body_md === AI, "a paper that moved to another version since is left to the revision path");
  const w4 = world({ aiStatus: "quarantined" });
  w4.exec(sql);
  ok(P(w4, "ai4metascience-ignorance-audit").version === "1.0.0", "a paper that is no longer published is not touched");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
