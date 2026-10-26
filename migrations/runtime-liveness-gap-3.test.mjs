// RUNTIME-LIVENESS-GAP-3 offline suite: replays migrations/2026-10-26-runtime-liveness-gap-3.sql on node:sqlite.
// Proves: the header opts in; the superseded birth-template contract of the open IDEAS-HUB-SLOW-RSS-1 issue becomes an active hourly runner-https contract on the feed, whose probe equals the
// issue's own runtime-probe line and is accepted by the real parser of scripts/remediation_consumer.py; contracts of other issues, a closed IDEAS-HUB-SLOW-RSS-1 issue and a contract that is
// already runner-https are untouched; a replay changes nothing; the Rollback line supersedes it again.
// Output MUST contain "0 failed" on success.   node migrations/runtime-liveness-gap-3.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-runtime-liveness-gap-3.sql"), "utf8");
const gap2 = readFileSync(here("./2026-10-26-runtime-liveness-gap-2.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const BORN = "SELECT 'closed' AS expected, NULL AS observed";
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER DEFAULT 6, status TEXT DEFAULT 'active', module TEXT, next_due_at TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT);`);
  const title = "IDEAS-HUB-SLOW-RSS-1: ideas.qnfo.org/rss.xml hangs one read in four and /api/sessions takes 3 to 5 s";
  const probeLine = (gap2.match(/runtime-probe: (\{[^\n]*\})',/) || [])[1];
  w.prepare("INSERT INTO agent_issues VALUES (1000460, ?, ?, ?)").run(title, "text\nruntime-probe: " + probeLine, o.issueStatus ?? "open");
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict) VALUES ('issue-1000460', 1000460, 'born', 'x', ?, ?, 'qnfo-fleet-control', ?, ?, ?)")
    .run(o.alreadyHttps ? '{"url": "https://ideas.qnfo.org/rss.xml", "status": 200, "contains": "<rss"}' : BORN, o.alreadyHttps ? "runner-https" : "d1-query", o.alreadyHttps ? "active" : "superseded", o.alreadyHttps ? "runtime-probe-line-v1" : "probe-template-v3-generic", "superseded:closure-observing-probe-at-birth");
  w.prepare("INSERT INTO agent_issues VALUES (7, 'other issue', 'text', 'open')").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module) VALUES ('issue-7', 7, 'born', 'x', ?, 'd1-query', 'qnfo-fleet-control', 'superseded', 'probe-template-v3-generic')").run(BORN);
  return { w, probeLine };
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const c = (w, cls) => q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", cls);

{
  const { w, probeLine } = world();
  ok(!!probeLine && JSON.parse(probeLine).url === "https://ideas.qnfo.org/rss.xml", "the issue text of the second file carries the feed's runtime-probe line", probeLine);
  w.exec(sql);
  const r = c(w, "issue-1000460");
  ok(r.verify_transport === "runner-https" && r.status === "active" && r.module === "runtime-probe-line-v1" && r.expected_cadence_h === 1 && r.max_attempts === 3 && r.attempts === 0 && r.last_verdict === null, "the contract is active, runner-https, hourly, with a clean history", r);
  ok(JSON.stringify(JSON.parse(r.verify_probe)) === JSON.stringify(JSON.parse(probeLine)), "its probe equals the issue's own runtime-probe line", r.verify_probe);
  const other = c(w, "issue-7");
  ok(other.status === "superseded" && other.verify_transport === "d1-query" && other.verify_probe === BORN, "another issue's contract is untouched");
  const PY = (() => { for (const x of ["python3", "python"]) { const t = spawnSync(x, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (t.status === 0 && String(t.stdout).trim() === "3") return x; } return null; })();
  if (!PY) console.log("note: no python 3 on this host, the consumer parser check is skipped");
  else {
    const prog = "import sys, json\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\np, why = r.parse_https_probe(sys.stdin.read())\nprint(json.dumps([p is not None and p['status'] == 200 and bool(p['contains']), why]))";
    const run = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: r.verify_probe, encoding: "utf8" });
    ok(run.status === 0 && String(run.stdout).trim().split("\n").pop() === '[true, null]', "the consumer's own parse_https_probe accepts it", { out: run.stdout, err: String(run.stderr).slice(0, 200) });
  }
  const snap = () => JSON.stringify(w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all());
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing");
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(c(w, "issue-1000460").status === "superseded" && c(w, "issue-1000460").verify_transport === "d1-query" && c(w, "issue-1000460").module === "probe-template-v3-generic", "Rollback supersedes it again");
}
{
  const { w } = world({ issueStatus: "closed" });
  w.exec(sql);
  ok(c(w, "issue-1000460").status === "superseded", "a closed IDEAS-HUB-SLOW-RSS-1 issue is left alone");
}
{
  const { w } = world({ alreadyHttps: true });
  const before = JSON.stringify(c(w, "issue-1000460"));
  w.exec(sql);
  ok(JSON.stringify(c(w, "issue-1000460")) === before, "a contract that is already runner-https is not rewritten");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
