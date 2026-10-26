// ERRATA-REMEDIATION-MERGE-1 offline suite: replays migrations/2026-10-26-errata-remediation-merge.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, BACKUP, one Rollback line, nothing deleted or dropped); the unclaimed errata remediation rows of a paper are merged into the oldest one (its idea lists
// every erratum, within 6,000 characters), the others are wontfix/parked with the carrying id and nothing else changes (claimed rows, revision rows, proposals, papers with one row, rows of other statuses);
// a tie on created_at is broken by id; PAPER-LEARN-1 rejections with a window reason and a quotation return to internal-open in both tables with their earlier verdict kept and a marker, and a rejection with
// no quotation, an anchored claim, another reason or a marked row stays rejected; a replay changes nothing and never reopens a marked row twice; the Rollback line restores both sets.
// Output MUST contain "0 failed" on success.   node migrations/errata-remediation-merge.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-errata-remediation-merge.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1 && header.filter((l) => /^-- BACKUP: /.test(l)).length === 1, "one Rollback line, one BACKUP line");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body) && !/fleet_tick|claude\.ai|anthropic\.com/i.test(sql), "decision_log is only inserted into; no fleet_tick, no claude.ai");
ok([...sql.matchAll(/LIKE\s+'([^']*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "LIKE patterns stay under 50 bytes");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, status TEXT DEFAULT 'queued', paper_slug TEXT, stage TEXT, claimed_at TEXT, created_at TEXT, error TEXT, UNIQUE(source, source_id));
CREATE TABLE errata_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, subject TEXT, claim TEXT, status TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE internal_errata (id TEXT PRIMARY KEY, status TEXT DEFAULT 'open', remediation TEXT, updated_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
let n = 0;
const rem = (w, id, slug, created, o = {}) => w.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, paper_slug, stage, claimed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, o.source || "remediation", o.sid || "errata:" + (++n), o.idea || ("Correct the published paper '" + slug + "' for erratum e-" + id + ": claim text of " + id), o.status || "queued", slug, o.stage === undefined ? "ground" : o.stage, o.claimed || null, created);
const get = (w, id) => q1(w, "SELECT * FROM research_queue WHERE id = ?", id);

const w = world();
// paper A: three unclaimed rows (oldest a1), paper B: one row, paper C: one claimed + one unclaimed, paper D: two rows with the same created_at, paper E: a revision row + one errata row, others
rem(w, "a2", "pa", "2026-10-19T10:00:00.000Z"); rem(w, "a1", "pa", "2026-10-18T09:00:00.000Z"); rem(w, "a3", "pa", "2026-10-20T11:00:00.000Z", { status: "deferred" });
rem(w, "b1", "pb", "2026-10-18T09:30:00.000Z");
rem(w, "c1", "pc", "2026-10-18T09:40:00.000Z", { status: "researching", claimed: "2026-10-26T01:00:00.000Z", stage: "ensemble" }); rem(w, "c2", "pc", "2026-10-19T09:40:00.000Z");
rem(w, "d2", "pd", "2026-10-19T12:00:00.000Z"); rem(w, "d1", "pd", "2026-10-19T12:00:00.000Z");
rem(w, "e1", "pe", "2026-10-18T09:50:00.000Z"); rem(w, "e-rev", "pe", "2026-10-18T09:00:00.000Z", { sid: "revision:pe@1.0.0#1" });
rem(w, "f1", "pf", "2026-10-18T09:55:00.000Z", { status: "published", stage: "done" }); rem(w, "f2", "pf", "2026-10-19T09:55:00.000Z");
rem(w, "p1", "pg", "2026-10-18T10:00:00.000Z", { source: "proposal", sid: "p-1" }); rem(w, "p2", "pg", "2026-10-18T11:00:00.000Z", { source: "proposal", sid: "p-2" });
w.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, paper_slug, stage, created_at) VALUES ('n1', 'remediation', 'errata:900', 'no slug', 'queued', NULL, 'ground', '2026-10-18T09:00:00.000Z'), ('n2', 'remediation', 'errata:901', 'no slug 2', 'queued', NULL, 'ground', '2026-10-18T09:01:00.000Z')").run();

// errata for the reopen part
const er = (subj, claim, status, remediation, o = {}) => {
  w.prepare("INSERT INTO internal_errata (id, status, remediation, updated_at) VALUES (?, ?, ?, '2026-10-25T00:00:00Z')").run(subj, o.istatus || (status === "rejected" ? "rejected" : "open"), remediation);
  return Number(w.prepare("INSERT INTO errata_queue (source, subject, claim, status, created_at, updated_at) VALUES ('internal_audit', ?, ?, ?, '2026-10-20 00:00:00', '2026-10-25 12:00:00')").run(subj, claim, status).lastInsertRowid);
};
const NOTE = (why) => "base remediation\nERRATA-INTERNAL-CONFIRM-1 2026-10-25T08:01:05.968Z (rejected): not confirmed by @cf/moonshotai/kimi-k2.6 against some-paper: " + why;
const r1 = er("pl-a-1.0.0-0", "Section 5.1: 'the viscosity term scales linearly with the Hubble parameter' is not derived.", "rejected", NOTE("The paper text does not contain Section 5.1 in the excerpt provided."));
const r2 = er("pl-b-1.0.0-0", "The claim says \"counting 3 + 3 + 2 + 0 = 8 leaf nodes for the variable powers\" in Section 4.5.", "rejected", NOTE("The excerpt only shows sections up to 3.2."));
const r3 = er("pl-c-1.0.0-0", "A number in the abstract does not match its inputs in the body.", "rejected", NOTE("The paper text does not contain the stated number in the excerpt provided."));
const r4 = er("pl-d-1.0.0-0", "Section 2: 'the lattice constant is fixed at one by assumption' contradicts Section 6. At: \"the lattice constant is fixed at one\"", "rejected", NOTE("The excerpt provided has no Section 6."));
const r5 = er("pl-e-1.0.0-0", "Equation 7: 'the sum equals forty-two for all N' is wrong.", "rejected", NOTE("The paper states the sum correctly in Section 3 and the claim misreads it."));
const r6 = er("pl-f-1.0.0-0", "Table 2: 'the baseline reaches ninety percent' is overstated.", "rejected", NOTE("Not present in the excerpt.") + "\nPAPER-CONFIRM-FALLBACK-1 2026-10-26T10:00:00Z (reopened): earlier");
const o1 = er("pl-g-1.0.0-0", "A quoted 'passage that is open and not rejected at all' here.", "internal-open", "base");
const before = qa(w, "SELECT id, source_id, status, stage, idea, error FROM research_queue ORDER BY id");

w.exec(sql);

// ---- 1. the merge
const a1 = get(w, "a1");
ok(a1.status === "queued" && a1.stage === "ground" && a1.error === null, "paper A: the oldest row keeps its place", a1);
ok(a1.idea.startsWith("Correct the published paper 'pa' for erratum e-a1") && a1.idea.includes("ERRATA-ROUTE-PER-PAPER-1 merged errata of the same paper") && a1.idea.includes("erratum e-a2") && a1.idea.includes("erratum e-a3") && a1.idea.length <= 6000, "and its idea lists the errata of the other two", a1.idea);
for (const id of ["a2", "a3"]) {
  const r = get(w, id);
  ok(r.status === "wontfix" && r.stage === "parked" && r.claimed_at === null && /^ERRATA-ROUTE-PER-PAPER-1: merged into a1 \(same paper/.test(r.error) && /Revert:/.test(r.error), id + " is parked with the carrying id and a revert line", r);
  ok(r.idea === before.find((b) => b.id === id).idea, id + " keeps its own idea text (nothing is lost)");
}
ok(["b1", "c1", "c2", "e1", "e-rev", "f1", "f2", "p1", "p2", "n1", "n2"].every((id) => { const a = get(w, id), b = before.find((x) => x.id === id); return a.status === b.status && a.stage === b.stage && a.idea === b.idea && a.error === b.error; }), "a paper with one unclaimed row, a claimed row, a revision row, a published row, proposals and rows without a slug are untouched");
const d1 = get(w, "d1"), d2 = get(w, "d2");
ok(d1.status === "queued" && d1.idea.includes("merged errata") && d1.idea.includes("erratum e-d2") && d2.status === "wontfix" && /merged into d1/.test(d2.error), "a tie on created_at keeps the lower id", { d1: d1.status, d2: d2.status, err: d2.error });
ok(qa(w, "SELECT COUNT(*) n FROM research_queue WHERE status = 'wontfix' AND error LIKE 'ERRATA-ROUTE-PER-PAPER-1:%'")[0].n === 3, "three rows are parked in all (a2, a3, d2)");
ok(qa(w, "SELECT paper_slug, COUNT(*) n FROM research_queue WHERE source = 'remediation' AND source_id LIKE 'errata:%' AND paper_slug IS NOT NULL AND status IN ('queued', 'deferred') AND claimed_at IS NULL GROUP BY paper_slug HAVING COUNT(*) > 1").length === 0, "no paper has two unclaimed errata rows afterwards (paper C keeps its claimed row and one unclaimed row: a row in flight is never merged into)");
{
  // a long list stays inside 6000 characters
  const w2 = world();
  for (let i = 0; i < 12; i++) rem(w2, "L" + String(i).padStart(2, "0"), "plong", "2026-10-18T09:" + String(10 + i).padStart(2, "0") + ":00.000Z", { idea: "Correct the published paper 'plong' for erratum e" + i + ": " + "x".repeat(900) });
  w2.exec(sql);
  const k = q1(w2, "SELECT idea FROM research_queue WHERE id = 'L00'");
  ok(k.idea.length <= 6000 && k.idea.includes("merged errata") && qa(w2, "SELECT id FROM research_queue WHERE status = 'wontfix'").length === 11, "twelve long errata still fit one idea of at most 6000 characters and park eleven rows", k.idea.length);
}

// ---- 2. the reopen
const eq = (id) => q1(w, "SELECT status, updated_at, created_at FROM errata_queue WHERE id = ?", id);
const ie = (id) => q1(w, "SELECT status, remediation FROM internal_errata WHERE id = ?", id);
for (const [id, subj] of [[r1, "pl-a-1.0.0-0"], [r2, "pl-b-1.0.0-0"]]) {
  ok(eq(id).status === "internal-open" && eq(id).updated_at === eq(id).created_at, subj + ": back in internal-open, updated_at = created_at (oldest first)", eq(id));
  ok(ie(subj).status === "open" && ie(subj).remediation.includes("not confirmed by @cf/moonshotai/kimi-k2.6") && /PAPER-CONFIRM-FALLBACK-1 \d{4}-\d\d-\d\dT[\d:]+Z \(reopened\)/.test(ie(subj).remediation), subj + ": internal_errata is open again with the earlier verdict kept and a marker", ie(subj).remediation.slice(-260));
}
ok(eq(r3).status === "rejected" && ie("pl-c-1.0.0-0").status === "rejected", "a window reason without a quotation stays rejected (the new window could not help)");
ok(eq(r4).status === "rejected", "an anchored claim stays rejected (it was already read on its own passage)");
ok(eq(r5).status === "rejected", "a rejection for another reason stays rejected");
ok(eq(r6).status === "rejected" && ie("pl-f-1.0.0-0").status === "rejected", "a row that was reopened once is never reopened again");
ok(eq(o1).status === "internal-open", "an internal-open row is not touched");
ok(qa(w, "SELECT COUNT(*) n FROM bak_20261026_errata_reopen")[0].n === 2, "the reopen backup holds exactly the two rows");
ok(qa(w, "SELECT COUNT(*) n FROM bak_20261026_errata_rem_merge")[0].n === 9, "the merge backup holds the 9 unclaimed errata rows with a slug as they were (a1 a2 a3 b1 c2 d1 d2 e1 f2; not the claimed, published, revision, proposal and slug-less rows)", qa(w, "SELECT id FROM bak_20261026_errata_rem_merge ORDER BY id").map((r) => r.id));
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'ERRATA-REMEDIATION-MERGE-1:%'").n === 1, "one decision_log row");

// ---- replay (with a re-rejected row)
{
  w.prepare("UPDATE errata_queue SET status = 'rejected' WHERE id = ?").run(r1);
  w.prepare("UPDATE internal_errata SET status = 'rejected', remediation = remediation || char(10) || 'ERRATA-INTERNAL-CONFIRM-1 2026-10-26T20:00:00Z (rejected): again' WHERE id = 'pl-a-1.0.0-0'").run();
  const snap = JSON.stringify(qa(w, "SELECT id, status, stage, idea, error FROM research_queue ORDER BY id"));
  w.exec(sql);
  ok(JSON.stringify(qa(w, "SELECT id, status, stage, idea, error FROM research_queue ORDER BY id")) === snap, "a replay changes no research_queue row");
  ok(eq(r1).status === "rejected" && ie("pl-a-1.0.0-0").status === "rejected", "a marked row that was rejected again is not reopened by a replay");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log").n === 1, "a replay adds no decision_log row");
  const rb = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
  w.exec(rb);
  const back = qa(w, "SELECT id, source_id, status, stage, idea, error FROM research_queue ORDER BY id");
  ok(JSON.stringify(back) === JSON.stringify(before), "the Rollback line restores every research_queue row to its first state");
  ok(eq(r2).status === "rejected" && ie("pl-b-1.0.0-0").status === "rejected" && ie("pl-b-1.0.0-0").remediation === NOTE("The excerpt only shows sections up to 3.2."), "and the reopened errata to rejected with their first note");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
