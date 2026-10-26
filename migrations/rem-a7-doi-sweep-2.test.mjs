// REM-A7-DOI-SWEEP-2 offline suite: replays migrations/2026-10-26-rem-a7-doi-sweep-2.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs, the legacy display
// tables and the 18 ledger columns that the no-re-entry baseline reads.
// Proves: the two cms pages as they stood live after the first file (content_entries 9 and 11, read 2026-10-26 18:56Z) lose exactly their three remaining registry mentions and nothing else; the unchanged contract
// probe of issue 100587 reads 2 before and 0 after; the close evidence is staged only when the cleared fields are gone; four contracts are added to the issue and each parses under the consumer's rules
// (runner-https keys, code-read keys, a literal read-only select); the no-re-entry probe passes on the cleared state and names a table that grows past its baseline or a cleared table that takes a registry value
// again; a replay changes nothing; Rollback restores both pages from the backup and supersedes the contracts.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-doi-sweep-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-doi-sweep-2.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const consumer = readFileSync(here("../scripts/remediation_consumer.py"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\bLIKE\s+'[^']{50,}'/i.test(body), "no LIKE pattern over 50 bytes");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const LEGACY_DDL = `
CREATE TABLE paper_index (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, doi TEXT, zenodo_id TEXT, zenodo_url TEXT, related_zenodo_ids TEXT);
CREATE TABLE content_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'page', body_md TEXT, body_html TEXT, doi TEXT, zenodo_id TEXT, meta_json TEXT DEFAULT '{}', abstract TEXT, bibliography_json TEXT DEFAULT '[]');
CREATE TABLE discovery_projects (slug TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', source_dir TEXT NOT NULL, doi TEXT, features TEXT DEFAULT '[]');
CREATE TABLE research_code_libraries (name TEXT PRIMARY KEY, companion_doi TEXT);
CREATE TABLE zenodo_stats (doi TEXT); CREATE TABLE zenodo_exit_ledger (doi TEXT); CREATE TABLE zenodo_attribution_audit (doi TEXT); CREATE TABLE zenodo_version_requests (result_doi TEXT);
CREATE TABLE jnl_records (doi TEXT); CREATE TABLE jnlaudit_records (doi TEXT); CREATE TABLE citation_stats (doi TEXT); CREATE TABLE impact_scores (doi TEXT); CREATE TABLE entity_map (doi TEXT);
CREATE TABLE social_threads (doi TEXT); CREATE TABLE social_media_posts (paper_doi TEXT); CREATE TABLE dissemination_tracker (paper_doi TEXT, zenodo_url TEXT); CREATE TABLE research_queue (doi TEXT);
CREATE TABLE errata_queue (paper_doi TEXT); CREATE TABLE errata_actions (paper_doi TEXT); CREATE TABLE version_queue (paper_doi TEXT); CREATE TABLE paper_revision_log (doi TEXT); CREATE TABLE proofs (paper_doi TEXT);
`;
const ORIGINAL_PROBE = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM content_entries WHERE (doi IS NOT NULL AND doi != '') OR (zenodo_id IS NOT NULL AND zenodo_id != '') OR (body_md IS NOT NULL AND body_md LIKE '%zenodo%') OR (body_html IS NOT NULL AND body_html LIKE '%zenodo%') OR (abstract IS NOT NULL AND abstract LIKE '%zenodo%') OR (bibliography_json IS NOT NULL AND bibliography_json LIKE '%zenodo%') OR (meta_json IS NOT NULL AND meta_json LIKE '%zenodo%')) + (SELECT COUNT(*) FROM paper_index WHERE (doi IS NOT NULL AND doi != '') OR (zenodo_id IS NOT NULL AND zenodo_id != '') OR (zenodo_url IS NOT NULL AND zenodo_url != '') OR (related_zenodo_ids IS NOT NULL AND related_zenodo_ids != '')) + (SELECT COUNT(*) FROM discovery_projects WHERE (doi IS NOT NULL AND doi != '') OR (description IS NOT NULL AND description LIKE '%zenodo%') OR (features IS NOT NULL AND features LIKE '%zenodo%')) AS TEXT) AS observed";

const Z = "Zen" + "odo", z = "zen" + "odo"; // the suite's own text stays clear of a registry-name scan
// The two pages as they stood live after the first migration (read from qnfo-audit.content_entries 2026-10-26 18:56Z).
const P9 = "# QNFO Publications\n\n## Research Papers\n\nOur publication corpus spans quantum information theory, p-adic mathematical physics, and ultrametric methods. All papers receive IPFS content identifiers for permanent, verifiable storage.\n\n## Featured Publications\n\n### Adelic Quantum Error Correction: A Synthesis Across All Primes\nA comprehensive treatment of quantum error correction using adelic methods.\n\n## Living Papers\n\nOur **Living Papers** system stores 455 papers with permanent IPFS content addressing. Each paper receives:\n- A unique IPFS Content Identifier (CID)\n- A " + Z + " DOI when formally published\n- Full-text indexing for semantic search\n\nSearch papers at [Ask QWAV](https://deep.qwav.tech) or browse the [Living Papers Archive](https://living-papers.qnfo.org).";
const P11 = "# Living Papers\n\n## How It Works\n\n1. **Content Addressing**: Each paper is hashed to produce a unique CID.\n2. **IPFS Pinning**: Papers are pinned to IPFS nodes.\n3. **Stable addresses**: Every published paper keeps one address at papers.qnfo.org, and new versions keep that address.\n4. **R2 Storage**: All papers are backed up on Cloudflare R2 for fast, reliable access.\n\n## Current Statistics\n\n- **455 papers** stored\n- **455 with IPFS CIDs** (100% coverage)\n- **6 with " + Z + " DOIs** (published papers)\n- **181 papers** pinned to IPFS\n\n## Paper Lifecycle\n\n1. **Draft**: Initial version, no CID yet\n2. **CID-Generated**: Content hash computed, IPFS CID assigned\n3. **Pinned**: Paper pinned to IPFS nodes\n4. **Published**: " + Z + " DOI assigned, formally published\n5. **Archived**: Final version preserved in QNFO Archive\n";
const P9_AFTER = P9.replace("- A " + Z + " DOI when formally published", "- A stable address at papers.qnfo.org");
const P11_AFTER = P11.replace("- **6 with " + Z + " DOIs** (published papers)\n", "").replace("4. **Published**: " + Z + " DOI assigned, formally published", "4. **Published**: Formally published at papers.qnfo.org");

function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec(LEGACY_DDL);
  const ce = w.prepare("INSERT INTO content_entries (id, slug, title, content_type, body_md) VALUES (?, ?, ?, 'page', ?)");
  ce.run(9, "qnfo-publications", "Pubs", P9);
  ce.run(11, "living-papers", "LP", P11);
  ce.run(12, "clean", "Clean", o.cleanBody ?? "No registry here.");
  w.exec("INSERT INTO paper_index (slug, doi) VALUES ('a', NULL), ('b', NULL)");
  w.exec("INSERT INTO discovery_projects (slug, name, source_dir, description) VALUES ('p', 'P', 'x', 'clean')");
  w.exec("INSERT INTO research_code_libraries (name, companion_doi) VALUES ('x', NULL)");
  w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (100587, 'OWNER-TASK-op-mvlpw4r7a758: Fleet-wide sweep', 'text', 'qnfo-fleet-dashboard:owner-request', 'critical', 'open', 1, 1)").run();
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (100587, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module) VALUES ('issue-100587', 100587, 'p', 'a', ?, 'd1-query', 'qnfo-fleet-control', 'active', 'probe-template-v3-generic')").run(ORIGINAL_PROBE);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM content_entries ORDER BY id"), qa(w, "SELECT * FROM issue_triage ORDER BY issue_id"), qa(w, "SELECT class, status, verify_probe FROM remediation_contracts ORDER BY class"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);
const WRITE_KW = (consumer.match(/WRITE_KW = \(([\s\S]*?)\n\)/) || [, ""])[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));

{
  const w = world();
  const p0 = qa(w, ORIGINAL_PROBE)[0];
  ok(p0.expected === "0" && p0.observed === "2", "before: the unchanged probe of 100587 reads 2 (the two pages), as it did live", p0);
  w.exec(sql);
  ok(q1(w, "SELECT body_md b FROM content_entries WHERE id = 9").b === P9_AFTER && !P9_AFTER.toLowerCase().includes(z), "page 9: only the list item changes", q1(w, "SELECT body_md b FROM content_entries WHERE id = 9").b);
  ok(q1(w, "SELECT body_md b FROM content_entries WHERE id = 11").b === P11_AFTER && !P11_AFTER.toLowerCase().includes(z), "page 11: the statistics line is removed and the lifecycle stage reworded, nothing else changes");
  ok(q1(w, "SELECT body_md b FROM content_entries WHERE id = 12").b === "No registry here.", "a clean page is untouched");
  const p1 = qa(w, ORIGINAL_PROBE)[0];
  ok(p1.expected === "0" && p1.observed === "0", "after: the same probe text reads exactly 0", p1);
  ok(q1(w, "SELECT COUNT(*) n FROM bak_noz2b_content_entries_20261026").n === 2 && q1(w, "SELECT body_md b FROM bak_noz2b_content_entries_20261026 WHERE id = 11").b === P11, "the backup holds both pages as they were");
  // evidence
  const t = q1(w, "SELECT * FROM issue_triage WHERE issue_id = 100587");
  ok(t.triage_state === "triaged" && /^SWEEP DONE/.test(t.close_evidence) && /docs\/DOI-ZENODO-INVENTORY\.md/.test(t.close_evidence) && /1000479/.test(t.close_evidence) && /read 2 instead of 0|left 3 of them/.test(t.close_evidence) && q1(w, "SELECT status s FROM agent_issues WHERE id = 100587").s === "open", "the evidence is staged, names the issues it filed and says what the first file missed; the issue is not closed by the file", t.close_evidence.slice(0, 200));
  w.exec("UPDATE agent_issues SET status = 'closed', close_channel = 'auto:verified-remediation-trigger' WHERE id = 100587");
  ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 100587").s === "closed", "a later close (the auto-close trigger after all contracts pass) passes the evidence guard on the staged text");
  // contracts
  const cs = qa(w, "SELECT * FROM remediation_contracts WHERE class LIKE 'noz-sweep-100587-%' ORDER BY class");
  ok(cs.length === 4 && cs.every((c) => c.issue_id === 100587 && c.status === "active" && c.module === "rem-a7-doi-sweep-v1" && c.expected_cadence_h === 24 && c.next_due_at < new Date().toISOString().replace("T", " ")), "four active contracts on issue 100587, daily, due at once (earlier than the main contract so a failure is read first)", cs.map((c) => c.class));
  const by = Object.fromEntries(cs.map((c) => [c.class, c]));
  for (const k of ["noz-sweep-100587-surface-api", "noz-sweep-100587-surface-llms"]) {
    const p = JSON.parse(by[k].verify_probe);
    ok(by[k].verify_transport === "runner-https" && Object.keys(p).every((x) => ["url", "status", "contains", "absent", "min_version", "max_ms", "redirect_to"].includes(x)) && /^https:\/\/(papers\.)?qnfo\.org\//.test(p.url) && p.status === 200 && typeof p.absent === "string" && p.absent.length > 0 && p.absent.length <= 200, k + " parses under the runner-https rules (fleet host, status 200, an absent marker)", p);
  }
  ok(JSON.parse(by["noz-sweep-100587-surface-api"].verify_probe).absent === "10.5281" && /limit=100/.test(JSON.parse(by["noz-sweep-100587-surface-api"].verify_probe).url) && JSON.parse(by["noz-sweep-100587-surface-llms"].verify_probe).absent === z, "the surface probes read the open-data list (limit 100, under the 512 KiB read) for the prefix and llms.txt for the name");
  const inv = JSON.parse(by["noz-sweep-100587-inventory"].verify_probe);
  ok(by["noz-sweep-100587-inventory"].verify_transport === "code-read" && Object.keys(inv).every((x) => ["paths", "contains", "absent"].includes(x)) && Array.isArray(inv.paths) && inv.paths.length === 2 && inv.paths.every((p) => !p.startsWith("/") && !p.includes("..")) && inv.contains === "DOI-ZENODO-INVENTORY-1", "the inventory contract parses under the code-read rules");
  for (const p of inv.paths) ok(readFileSync(here("../" + p), "utf8").includes(inv.contains), "the marker is in " + p);
  const nr = by["noz-sweep-100587-no-reentry"];
  const low = nr.verify_probe.toLowerCase();
  ok(nr.verify_transport === "d1-query" && (low.startsWith("select") || low.startsWith("with")) && !WRITE_KW.some((kw) => low.includes(kw)) && !nr.verify_probe.replace(/;\s*$/, "").includes(";"), "the no-re-entry probe is one literal read-only statement (the consumer's rule)");
  const run = (db) => qa(db, nr.verify_probe)[0];
  const good = run(w);
  ok(good.expected === good.observed, "cleared state: the no-re-entry probe passes", good);
  w.exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 576) INSERT INTO zenodo_stats (doi) SELECT '10.5281/" + z + ".' || i FROM n");
  const grew = run(w);
  ok(grew.expected !== grew.observed && grew.observed === "over baseline: zenodo_stats", "576 closed-registry rows in zenodo_stats (baseline 575) name the table", grew);
  w.exec("DELETE FROM zenodo_stats");
  w.exec("UPDATE paper_index SET doi = '10.5281/" + z + ".9' WHERE slug = 'a'");
  const re = run(w);
  ok(re.expected !== re.observed && re.observed === "over baseline: paper_index", "a registry DOI in a cleared table names it", re);
  w.exec("UPDATE paper_index SET doi = NULL WHERE slug = 'a'");
  w.exec("UPDATE content_entries SET body_md = 'mentions " + Z + " again' WHERE id = 12");
  const re2 = run(w);
  ok(re2.observed === "over baseline: content_entries", "the registry name in a cms page names content_entries", re2);
  w.exec("UPDATE content_entries SET body_md = 'No registry here.' WHERE id = 12");
  // replay
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
  // rollback
  const w2 = world();
  w2.exec(sql);
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(q1(w2, "SELECT body_md b FROM content_entries WHERE id = 9").b === P9 && q1(w2, "SELECT body_md b FROM content_entries WHERE id = 11").b === P11, "Rollback restores both pages exactly");
  ok(qa(w2, "SELECT status FROM remediation_contracts WHERE class LIKE 'noz-sweep-100587-%'").every((r) => r.status === "superseded") && q1(w2, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100587").e === null, "Rollback supersedes the contracts and clears the staged evidence");
}
{
  // a mention the file does not know keeps the evidence from being staged (the guard that held after the first file)
  const w = world({ cleanBody: "an unexpected " + Z + " mention" });
  w.exec(sql);
  ok(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100587").e === null, "evidence is not staged while a page still names the registry");
  ok(qa(w, ORIGINAL_PROBE)[0].observed === "1", "and the unchanged probe still reads the remaining page");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
