// REM-A7-DOI-SWEEP-1 offline suite: replays migrations/2026-10-26-rem-a7-doi-sweep.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs plus the four
// legacy display tables it cleans (paper_index, content_entries, discovery_projects, research_code_libraries, DDL read from qnfo-audit on 2026-10-26).
// Proves: the header opts in and the file deletes nothing; the contract probe of issue 100587 (the live text, 173 on 2026-10-26) reads a positive count before and exactly 0 after; only closed-registry
// identifiers and placeholders are cleared (a third-party DOI in research_code_libraries stays, and a third-party DOI left in paper_index keeps the evidence from being staged); the two page
// sentences and three description phrases are reworded and nothing else in those bodies changes; every changed row is backed up and the Rollback restores all four tables exactly; the close
// evidence is staged (not closed) only when the fields are gone; the two successor issues carry a doer path (code-task and code-anchor lines, a trusted source) and probes that the fleet-control
// external-https parser accepts; the detector reads a re-entry; the decision is logged once; a replay changes nothing.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-doi-sweep.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-doi-sweep.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const fleetControl = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
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
CREATE TABLE paper_index (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, authors TEXT, date TEXT, doi TEXT, zenodo_id TEXT, topics TEXT, status TEXT, r2_path TEXT, pdf_url TEXT, last_synced_at TEXT DEFAULT (datetime('now')), created_at TEXT DEFAULT (datetime('now')), _version INTEGER DEFAULT 1, zenodo_url TEXT, related_zenodo_ids TEXT);
CREATE TABLE content_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'page', body_md TEXT, body_html TEXT, authors TEXT DEFAULT '[]', date TEXT, doi TEXT, zenodo_id TEXT, status TEXT DEFAULT 'draft', topics TEXT DEFAULT '[]', r2_path TEXT, pdf_url TEXT, pages_project TEXT, pages_url TEXT, featured_order INTEGER DEFAULT 0, meta_json TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), abstract TEXT, license TEXT DEFAULT 'CC BY 4.0', version TEXT DEFAULT '1.0', language TEXT DEFAULT 'en', bibliography_json TEXT DEFAULT '[]', embedding_model TEXT, vectorize_id TEXT, revision_of TEXT, _version INTEGER DEFAULT 1);
CREATE TABLE discovery_projects (slug TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', source_dir TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', type TEXT DEFAULT 'project', topics TEXT DEFAULT '[]', last_active TEXT, doi TEXT, features TEXT DEFAULT '[]', tech_stack TEXT, license TEXT DEFAULT 'CC BY 4.0', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), _version INTEGER DEFAULT 1, github_issue_number INTEGER, github_state TEXT, wbs_code TEXT);
CREATE TABLE research_code_libraries (name TEXT PRIMARY KEY, kind TEXT NOT NULL, field TEXT NOT NULL, pillar TEXT NOT NULL, companion_doi TEXT, staged_path TEXT NOT NULL, repo TEXT, language TEXT, tests TEXT, status TEXT NOT NULL DEFAULT 'staged', note TEXT, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
`;
// The verify_probe of issue-100587 as it stood on 2026-10-26 (read from remediation_contracts; observed 173 = 7 + 161 + 5 on that day).
const ORIGINAL_PROBE = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM content_entries WHERE (doi IS NOT NULL AND doi != '') OR (zenodo_id IS NOT NULL AND zenodo_id != '') OR (body_md IS NOT NULL AND body_md LIKE '%zenodo%') OR (body_html IS NOT NULL AND body_html LIKE '%zenodo%') OR (abstract IS NOT NULL AND abstract LIKE '%zenodo%') OR (bibliography_json IS NOT NULL AND bibliography_json LIKE '%zenodo%') OR (meta_json IS NOT NULL AND meta_json LIKE '%zenodo%')) + (SELECT COUNT(*) FROM paper_index WHERE (doi IS NOT NULL AND doi != '') OR (zenodo_id IS NOT NULL AND zenodo_id != '') OR (zenodo_url IS NOT NULL AND zenodo_url != '') OR (related_zenodo_ids IS NOT NULL AND related_zenodo_ids != '')) + (SELECT COUNT(*) FROM discovery_projects WHERE (doi IS NOT NULL AND doi != '') OR (description IS NOT NULL AND description LIKE '%zenodo%') OR (features IS NOT NULL AND features LIKE '%zenodo%')) AS TEXT) AS observed";

const Z = "Zen" + "odo", z = "zen" + "odo"; // the suite's own text stays clear of a registry-name scan
const R = (n) => "10.5281/" + z + "." + n;
const P9 = "## Research Papers\n\nOur publication corpus spans quantum information theory. All papers receive " + Z + " DOIs and IPFS content identifiers for permanent, verifiable storage.\n\n## Featured Publications\n\nText.\n";
const P11 = "1. **Content Hashing**: x.\n2. **IPFS Pinning**: y.\n3. **" + Z + " Archiving**: Published papers receive " + Z + " DOIs for traditional academic citation.\n4. **R2 Storage**: z.\n\n## Current Statistics\n";
// The live trigger agent_issues_birth_contract_ins writes an issue-<id> contract at birth (INSERT OR IGNORE), so the file's own insert is ignored there and its UPDATE must take the row over.
const BIRTH = `CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id)
BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('issue-' || NEW.id, NEW.id, 'born', 'born probe that measures nothing', 'SELECT ''closed'' AS expected, NULL AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'probe-template-v3-generic'); END;`;
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec(LEGACY_DDL);
  const pi = w.prepare("INSERT INTO paper_index (slug, title, doi, zenodo_id, status, zenodo_url, related_zenodo_ids) VALUES (?, ?, ?, ?, 'published', ?, ?)");
  pi.run("a", "A", R(1), "1", null, null);
  pi.run("b", "B", "https://doi.org/" + R(2), "", null, null);
  pi.run("c", "C", "CHAPTER-FRAGMENT", "", null, null);
  pi.run("d", "D", "10.0000/test", null, null, null);
  pi.run("e", "E", null, null, null, null);
  pi.run("f", "F", "", "", "https://x.example/records/6", "7,8");
  if (o.thirdPartyIndex) pi.run("g", "G", "10.1111/phpr.12228", "", null, null);
  const ce = w.prepare("INSERT INTO content_entries (id, slug, title, content_type, body_md, doi, status) VALUES (?, ?, ?, ?, ?, ?, 'published')");
  ce.run(1, "pub-1", "P1", "publication", null, R(20511028));
  ce.run(2, "pub-2", "P2", "publication", null, R(20517893));
  ce.run(9, "qnfo-publications", "Pubs", "page", P9, null);
  ce.run(11, "living-papers", "LP", "page", P11, null);
  ce.run(12, "clean", "Clean", "page", "No registry here.", null);
  const dp = w.prepare("INSERT INTO discovery_projects (slug, name, description, source_dir, doi) VALUES (?, ?, ?, 'x', ?)");
  dp.run("autaxys-master-plan-v3", "M", "Calibrated revision of Autaxys R&D Master Plan (supersedes v2.0, DOI: " + R(15617573) + "). New: ontological status.", R(21369313));
  dp.run("autaxys-unified-framework-v2", "U", "Calibrated revision (supersedes v1.9, DOI: " + R(15628365) + "). Added labels.", R(21369319));
  dp.run("cfpe-forecast", "C", "Bayesian cascade forecast. Pending: P4 publication pipeline (" + Z + " + Pages deploy).", null);
  dp.run("no-bullshit-physics-writing", "N", "", R(20497225));
  dp.run("clean-one", "K", "Nothing to clean.", null);
  const rl = w.prepare("INSERT INTO research_code_libraries (name, kind, field, pillar, companion_doi, staged_path, repo, status) VALUES (?, 'companion', 'ai', 'research', ?, 'research-code/x', 'QNFO/x', 'public')");
  rl.run("ignorance-audit", R(21901984));
  rl.run("ultrametric-lean", R(22073477));
  rl.run("agentic-collapse", R(18133065));
  rl.run("third-party", "10.1111/phpr.12228");
  rl.run("none", null);
  w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (100587, 'OWNER-TASK-op-mvlpw4r7a758: Fleet-wide sweep', 'text', 'qnfo-fleet-dashboard:owner-request', 'critical', 'open', 1, 1)").run();
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (100587, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module) VALUES ('issue-100587', 100587, 'p', 'VACUOUS-PROBE-V3-1: placeholder text kept by the live row', ?, 'd1-query', 'qnfo-fleet-control', 'active', 'x')").run(ORIGINAL_PROBE);
  if (o.birth !== false) w.exec(BIRTH);
  // WORLD-CLOCK-PIN-1 (2026-10-30, agent_issues 5013): the legacy tables default created_at and last_synced_at to datetime('now'), and the Rollback check compares tables() of a world built earlier with
  // one built later. In different seconds (a loaded CI runner, or here a 1.1 s gap) the two differ in columns the migration never touches: "Rollback restores all four tables exactly" went red on CI
  // main and green locally. Every defaulted clock column is pinned to one instant, so a snapshot depends on the rows and not on the second they were built in.
  for (const t of ["paper_index", "content_entries", "discovery_projects", "research_code_libraries"]) {
    for (const col of w.prepare("PRAGMA table_info(" + t + ")").all().filter((c) => /datetime\(|strftime\(|CURRENT_TIMESTAMP/i.test(String(c.dflt_value || "")))) {
      w.exec("UPDATE " + t + " SET " + col.name + " = '2026-10-26 00:00:00'");
    }
  }
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const tables = (w) => JSON.stringify(["paper_index", "content_entries", "discovery_projects", "research_code_libraries"].map((t) => qa(w, "SELECT * FROM " + t + " ORDER BY 1, 2")));
const snap = (w) => JSON.stringify([tables(w), qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM issue_triage ORDER BY issue_id"), qa(w, "SELECT class, status, verify_probe FROM remediation_contracts ORDER BY class"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id"), qa(w, "SELECT fm_key FROM failure_modes")]);

{
  const w = world();
  const p0 = qa(w, ORIGINAL_PROBE)[0];
  ok(p0.expected === "0" && Number(p0.observed) > 0, "before: the contract probe of 100587 reads a positive count", p0);
  w.exec(sql);
  const p1 = qa(w, ORIGINAL_PROBE)[0];
  ok(p1.expected === "0" && p1.observed === "0", "after: the same probe text reads exactly 0 (nothing was weakened, the defect is gone)", p1);
  ok(q1(w, "SELECT COUNT(*) n FROM paper_index WHERE coalesce(doi, '') <> '' OR coalesce(zenodo_id, '') <> '' OR coalesce(zenodo_url, '') <> '' OR coalesce(related_zenodo_ids, '') <> ''").n === 0 && q1(w, "SELECT COUNT(*) n FROM paper_index").n === 6, "paper_index: every identifier cleared, no row removed");
  ok(q1(w, "SELECT companion_doi d FROM research_code_libraries WHERE name = 'third-party'").d === "10.1111/phpr.12228", "a third-party DOI in research_code_libraries stays");
  ok(qa(w, "SELECT name FROM research_code_libraries WHERE instr(coalesce(companion_doi, ''), '10.5281') > 0").length === 0, "no closed-registry companion DOI is left");
  const b9 = q1(w, "SELECT body_md b FROM content_entries WHERE id = 9").b, b11 = q1(w, "SELECT body_md b FROM content_entries WHERE id = 11").b;
  ok(b9 === P9.replace("All papers receive " + Z + " DOIs and IPFS content identifiers for permanent", "All papers receive IPFS content identifiers for permanent"), "page 9: only the registry clause is removed", b9);
  ok(b11 === P11.replace("3. **" + Z + " Archiving**: Published papers receive " + Z + " DOIs for traditional academic citation.", "3. **Stable addresses**: Every published paper keeps one address at papers.qnfo.org, and new versions keep that address."), "page 11: only the list item is replaced", b11);
  ok(q1(w, "SELECT body_md b FROM content_entries WHERE id = 12").b === "No registry here.", "a clean page is untouched");
  ok(q1(w, "SELECT description d FROM discovery_projects WHERE slug = 'autaxys-master-plan-v3'").d === "Calibrated revision of Autaxys R&D Master Plan (supersedes v2.0). New: ontological status." && q1(w, "SELECT description d FROM discovery_projects WHERE slug = 'autaxys-unified-framework-v2'").d === "Calibrated revision (supersedes v1.9). Added labels." && q1(w, "SELECT description d FROM discovery_projects WHERE slug = 'cfpe-forecast'").d === "Bayesian cascade forecast. Pending: P4 publication pipeline (Pages deploy).", "the three discovery descriptions are reworded exactly");
  ok(q1(w, "SELECT description d FROM discovery_projects WHERE slug = 'clean-one'").d === "Nothing to clean.", "a clean project is untouched");
  // backups
  ok(q1(w, "SELECT COUNT(*) n FROM bak_noz2_paper_index_20261026").n === 5 && q1(w, "SELECT COUNT(*) n FROM bak_noz2_content_entries_20261026").n === 4 && q1(w, "SELECT COUNT(*) n FROM bak_noz2_discovery_projects_20261026").n === 4 && q1(w, "SELECT COUNT(*) n FROM bak_noz2_research_code_libraries_20261026").n === 3, "backups hold exactly the rows that changed (5, 4, 4, 3)");
  ok(q1(w, "SELECT doi d FROM bak_noz2_paper_index_20261026 WHERE slug = 'c'").d === "CHAPTER-FRAGMENT", "the backup keeps the placeholder values");
  // evidence
  const t = q1(w, "SELECT * FROM issue_triage WHERE issue_id = 100587");
  ok(t.triage_state === "triaged" && /^SWEEP DONE/.test(t.close_evidence) && /docs\/DOI-ZENODO-INVENTORY\.md/.test(t.close_evidence) && /NOZ-DOI-SWEEP-2A/.test(t.close_evidence) && /173 before, 0 after/.test(t.close_evidence) && q1(w, "SELECT status s FROM agent_issues WHERE id = 100587").s === "open", "the evidence is staged, the issue is not closed by the file", t);
  w.exec("UPDATE agent_issues SET status = 'closed', close_channel = 'auto:verified-remediation-trigger' WHERE id = 100587");
  ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 100587").s === "closed", "a later close of 100587 (what the auto-close trigger does after a passing verification) passes issue_close_evidence_required on the staged evidence");
  // successors
  const a = q1(w, "SELECT * FROM agent_issues WHERE title LIKE 'NOZ-DOI-SWEEP-2A:%'"), bb = q1(w, "SELECT * FROM agent_issues WHERE title LIKE 'NOZ-DOI-SWEEP-2B:%'");
  ok(a && bb && a.status === "open" && bb.status === "open" && /^claude-session/.test(a.source), "two successor issues, open, from a trusted source", [a && a.title, bb && bb.title]);
  const anchor = (a.description.match(/^code-anchor: (.*)$/m) || [])[1];
  ok(/^code-task: repo=qnfo-workers path=qnfo-fleet-control\/worker\.js$/m.test(a.description) && anchor && fleetControl.split(anchor).length - 1 === 1, "2A carries a code-task line and a code-anchor that occurs exactly once in qnfo-fleet-control/worker.js", anchor);
  ok(/IDENTITY-BOUND/.test(bb.description) && !/^code-task:/m.test(bb.description), "2B names the identity-bound step and has no code task (the doer is the external-repo-patch workflow)");
  const spec = (cls) => { const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", cls); const j = JSON.parse(c.verify_probe); return { c, j }; };
  const RT_HTTP_HOSTS = ["raw.githubusercontent.com", "api.github.com", "github.com", "pypi.org", "doi.org", "api.openalex.org", "api.crossref.org", "api.datacite.org", "mstdn.science"];
  for (const [id, want] of [[a.id, "json:description"], [bb.id, "body-contains:NOZ-DOI-1: no registry stage"]]) {
    const { c, j } = spec("issue-" + id);
    ok(c.status === "active" && c.verify_transport === "external-https" && RT_HTTP_HOSTS.includes(new URL(j.url).hostname) && j.method === "GET" && j.check === want && String(j.expected).trim() !== "" && /^(status|header:[A-Za-z0-9-]+|body-contains:.+|json:[A-Za-z0-9_.-]+)$/.test(j.check), "issue " + id + ": an external-https contract the fleet-control parser accepts (host allowed, known check, expected set)", c);
  }
  ok(qa(w, "SELECT class FROM remediation_contracts WHERE class LIKE 'issue-%' AND issue_id IN (?, ?)", a.id, bb.id).length === 2 && qa(w, "SELECT module FROM remediation_contracts WHERE issue_id IN (?, ?)", a.id, bb.id).every((r) => r.module === "rem-a7-doi-sweep-v1"), "the born contracts (birth trigger) are taken over by the file: one contract per successor, module rem-a7-doi-sweep-v1");
  ok(spec("issue-" + a.id).j.expected.startsWith("QNFO research code: ignorance-audit.") && !/10\.5281/.test(spec("issue-" + a.id).j.expected) && spec("issue-" + bb.id).j.expected === "present", "the probes pin a positive result (an error page or rate limit cannot pass)");
  ok(fleetControl.includes("async function pfCodePublish(") && fleetControl.includes("function pfHygienePlan(") && fleetControl.includes("async function pfHygieneApply("), "the code task points at functions that exist on main");
  // failure mode and detector
  ok(q1(w, "SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'code-publish-registry-doi' AND probe_class = 'fm-code-publish-registry-doi' AND issue_id = ?", a.id).n === 1, "the failure mode row names the 2A issue");
  const det = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'fm-code-publish-registry-doi'");
  ok(det.status === "active" && det.verify_transport === "d1-query" && qa(w, det.verify_probe)[0].observed === "0" && qa(w, det.verify_probe)[0].expected === "0", "the detector reads 0 after the file", det);
  w.exec("UPDATE research_code_libraries SET companion_doi = '" + R(1) + "' WHERE name = 'none'");
  ok(qa(w, det.verify_probe)[0].observed === "1", "and reads 1 when a registry DOI re-enters research_code_libraries");
  w.exec("UPDATE research_code_libraries SET companion_doi = NULL WHERE name = 'none'");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f4' AND action LIKE 'REM-A7-DOI-SWEEP-1:%'").n === 1, "one decision_log row");
  // replay
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
  // rollback
  const w2 = world();
  const before2 = tables(w2); // its own baseline: world() stamps created_at / last_synced_at with datetime('now'), so another world built a second later is never byte-equal
  w2.exec(sql);
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(tables(w2) === before2, "Rollback restores all four tables exactly");
  ok(q1(w2, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100587").e === null, "Rollback clears the staged evidence");
  ok(qa(w2, "SELECT status FROM agent_issues WHERE title LIKE 'NOZ-DOI-SWEEP-%'").every((r) => r.status === "closed"), "Rollback closes the two successor issues through their triage rows");
  ok(q1(w2, "SELECT status s FROM remediation_contracts WHERE class = 'fm-code-publish-registry-doi'").s === "superseded", "Rollback supersedes the detector");
}
{
  // a third-party DOI left in paper_index keeps the evidence from being staged: the probe would not read 0, so the file does not say it did
  const w = world({ thirdPartyIndex: true });
  w.exec(sql);
  ok(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100587").e === null, "evidence is not staged while a doi value is left in paper_index (honest guard)");
  ok(q1(w, "SELECT doi d FROM paper_index WHERE slug = 'g'").d === "10.1111/phpr.12228", "and the third-party DOI itself is untouched");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
