// PROBE-NEEDED-LIVE-PATHS-1 offline suite: replays migrations/2026-10-19-probe-needed-live-paths.sql on SQLite.
// Proves: the three superseded or monitoring contracts become active d1-query@living-paper, d1-query and external-https contracts with a cleared verdict;
// the two D1 probes run and read the defect (observed != expected while it stands, equal once it is fixed) without reading the status of the issue;
// the Mastodon probe parses in the consumer's grammar (url, status, contains only); a contract that is not superseded is left alone; a second apply changes nothing;
// the Rollback line puts each contract back.
// Run: node migrations/probe-needed-live-paths.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-probe-needed-live-paths.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const fresh = () => {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, action TEXT NOT NULL DEFAULT '', verify_probe TEXT, verify_transport TEXT, status TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT, next_due_at TEXT);
    CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
    CREATE TABLE ai_model_health (model_id TEXT, status TEXT);
    CREATE TABLE papers (slug TEXT, body_md TEXT);
    INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict, attempts) VALUES
     ('issue-100140', 100140, 'old', 'd1-query', 'superseded', 'superseded:x', 3),
     ('issue-100151', 100151, 'old', 'd1-query', 'monitoring', 'monitoring:loop-owned-48h', 2),
     ('issue-2925', 2925, 'old', 'external-https', 'superseded', 'superseded:y', 4),
     ('issue-1', 1, 'keep', 'd1-query', 'superseded', 'superseded:z', 1);`);
  return d;
};
const get = (d, c) => d.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);
const d = fresh();
d.exec(sql);
const a = get(d, "issue-100140"), b = get(d, "issue-100151"), c = get(d, "issue-2925");
ok(a.status === "active" && a.verify_transport === "d1-query@living-paper" && a.last_verdict === null && a.attempts === 0, "100140 active on living-paper", a);
ok(b.status === "active" && b.verify_transport === "d1-query" && b.last_verdict === null, "100151 active on d1-query", b);
ok(c.status === "active" && c.verify_transport === "external-https", "2925 active on external-https", c);
ok(get(d, "issue-1").verify_probe === "keep" && get(d, "issue-1").status === "superseded", "an unrelated contract is untouched");
for (const k of ["issue-100140", "issue-100151"]) ok(!/agent_issues/.test(get(d, k).verify_probe), k + " probe never reads the issue status");

const probe = (k) => d.prepare(get(d, k).verify_probe).get();
d.exec(`INSERT INTO papers VALUES ('ai4metascience-ignorance-audit', 'cites (Quni-Gudzinas 2026b, https://papers.qnfo.org/papers/the-ultrametric-foundation-x). Merton, Annual Review of Sociology, 13, 1' || char(8211) || '29.')`);
ok(probe("issue-100140").observed === "3" && probe("issue-100140").expected === "0", "100140 reads 3 defects while all three stand", probe("issue-100140"));
d.exec(`UPDATE papers SET body_md = 'cites https://papers.qnfo.org/papers/qwave-qudit-advantage. Merton, 13, 1' || char(8211) || '28.'`);
ok(probe("issue-100140").observed === "0", "100140 reads 0 once corrected", probe("issue-100140"));
d.exec(`INSERT INTO ai_model_health VALUES ('kimi-k2.6','degraded'),('gpt-oss-120b','ok'),('glm-5.3','degraded')`);
ok(probe("issue-100151").observed === "1", "100151 counts only the named degraded models", probe("issue-100151"));
d.exec(`UPDATE ai_model_health SET status = 'ok'`);
ok(probe("issue-100151").observed === "0", "100151 reads 0 once none is degraded");

const p = JSON.parse(c.verify_probe);
ok(Object.keys(p).every((k) => ["url", "status", "contains", "absent", "min_version", "max_ms", "redirect_to"].includes(k)) && p.status === 200 && p.contains === '"verified_at":"20', "2925 probe is in the runner grammar", p);

const logs = d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'PROBE-NEEDED-LIVE-PATHS-1:%'").get().n;
d.exec(sql);
ok(logs === 1 && d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "one decision_log row, none added on a second apply");
ok(get(d, "issue-100140").status === "active", "a second apply leaves the active contract alone");

d.exec(rollback);
ok(get(d, "issue-100140").status === "superseded" && get(d, "issue-100151").status === "monitoring" && get(d, "issue-2925").status === "superseded" && get(d, "issue-1").verify_probe === "keep", "Rollback restores the earlier statuses");
console.log("probe-needed-live-paths: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
