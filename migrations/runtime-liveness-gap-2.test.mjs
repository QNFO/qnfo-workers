// RUNTIME-LIVENESS-GAP-2 offline suite: replays migrations/2026-10-26-runtime-liveness-gap-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); the two ideas-hub contracts are superseded and nothing else changes state; the two
// sitemap contracts are active hourly runner-https contracts of module runtime-liveness-v1 whose specs the REAL parser of scripts/remediation_consumer.py accepts; the issue
// IDEAS-HUB-SLOW-RSS-1 is filed once, from a source the code loop trusts (session*), with a runtime-probe line that the same parser accepts and a definition of done; the issue text holds none of
// the words the planner refuses; a replay changes nothing; the Rollback line puts it back.
// Output MUST contain "0 failed" on success.   node migrations/runtime-liveness-gap-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-runtime-liveness-gap-2.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER DEFAULT 1, status TEXT DEFAULT 'active', module TEXT, budget_ms INTEGER, max_items INTEGER, next_due_at TEXT, last_verdict TEXT, last_attempt_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues (lower(trim(title))) WHERE status = 'open';
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  const c = (cls, url, st = "active", mod = "runtime-liveness-v1") => w.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status, module, escalate_to) VALUES (?, ?, 'runner-https', ?, ?, 'qnfo-ops')").run(cls, JSON.stringify({ url, status: 200, contains: "x" }), st, mod);
  c("rt-page-ideas-feed", "https://ideas.qnfo.org/rss.xml");
  c("rt-page-ideas-sessions", "https://ideas.qnfo.org/api/sessions");
  c("rt-page-ideas", "https://ideas.qnfo.org/");
  c("rt-page-ideas-sitemap", "https://ideas.qnfo.org/sitemap.xml");
  c("rt-q08", "https://q08.org/");
  c("rt-page-q08-feed", "https://q08.org/feed.xml");
  c("fm-other", "https://ideas.qnfo.org/rss.xml", "active", "failure-mode");   // same URL, other module: not touched
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const st = (w, cls) => (q1(w, "SELECT status s FROM remediation_contracts WHERE class = ?", cls) || {}).s;

const w = world();
w.exec(sql);
ok(st(w, "rt-page-ideas-feed") === "superseded" && st(w, "rt-page-ideas-sessions") === "superseded", "the two ideas-hub contracts are superseded");
ok(/^superseded:RUNTIME-LIVENESS-GAP-2/.test(q1(w, "SELECT last_verdict v FROM remediation_contracts WHERE class = 'rt-page-ideas-feed'").v), "with the reason on the row");
ok(["rt-page-ideas", "rt-page-ideas-sitemap", "rt-q08", "rt-page-q08-feed", "fm-other"].every((c) => st(w, c) === "active"), "no other contract changed state, including a failure-mode contract on the same URL");
const created = qa(w, "SELECT * FROM remediation_contracts WHERE class IN ('rt-page-q08-sitemap', 'rt-page-qwav-sitemap') ORDER BY class");
ok(created.length === 2 && created.every((r) => r.verify_transport === "runner-https" && r.status === "active" && r.module === "runtime-liveness-v1" && r.issue_id === null && r.expected_cadence_h === 1 && r.max_attempts === 3 && r.escalate_to === "qnfo-ops"), "two active hourly runner-https contracts of module runtime-liveness-v1 with no issue", created.map((r) => r.class));
const urls = created.map((r) => JSON.parse(r.verify_probe).url);
ok(urls.join() === "https://q08.org/sitemap.xml,https://qwav.org/sitemap.xml", "the sitemaps of q08.org and qwav.org", urls);

const issue = q1(w, "SELECT * FROM agent_issues WHERE title LIKE 'IDEAS-HUB-SLOW-RSS-1:%'");
ok(issue && issue.status === "open" && issue.priority === "medium" && issue.category === "reliability", "the issue is filed open, medium, reliability");
ok(/^session/.test(issue.source), "its source matches the session* pattern of code_merge_trusted_sources, so the planner may take it", issue.source);
ok(/Definition of done:/.test(issue.description) && /Charter pillar: reach/.test(issue.description) && /idea-hub\/worker\.js/.test(issue.description), "it carries a pillar, a place to look and a definition of done");
const rp = (issue.description.split("\n").find((l) => l.startsWith("runtime-probe: ")) || "").slice("runtime-probe: ".length);
ok(!!rp && JSON.parse(rp).url === "https://ideas.qnfo.org/rss.xml" && JSON.parse(rp).max_ms === 10000, "its closing probe is a runtime-probe line on the feed with a 10 s ceiling", rp);
ok(!/\b(secret|credential|password|api[ _-]?key|private key|rotate|revoke|drop table)\b/i.test(issue.description + issue.title), "no text trips the planner's deny words");
ok(issue.description.split("\n").filter((l) => l.startsWith("runtime-probe: ")).length === 1, "exactly one runtime-probe line");
{
  const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
  if (!PY) console.log("note: no python 3 on this host, the consumer parser check is skipped");
  else {
    const specs = created.map((r) => r.verify_probe).concat([rp]);
    const prog = "import sys, json\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\nout = []\nfor s in json.loads(sys.stdin.read()):\n    p, why = r.parse_https_probe(s)\n    out.append([p is not None and p['status'] == 200 and bool(p['contains']), why])\nprint(json.dumps(out))";
    const run = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: JSON.stringify(specs), encoding: "utf8" });
    let parsed = null;
    try { parsed = JSON.parse(String(run.stdout).trim().split("\n").pop()); } catch (e) { parsed = null; }
    ok(run.status === 0 && Array.isArray(parsed) && parsed.length === 3 && parsed.every((x) => x[0] === true), "the consumer's own parse_https_probe accepts both contracts and the issue's runtime-probe", { status: run.status, parsed, err: String(run.stderr).slice(0, 200) });
  }
}
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'RUNTIME-LIVENESS-GAP-2:%'").n === 1, "one decision_log row");

// replay
{
  const snap = () => JSON.stringify([qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT title, status FROM agent_issues"), qa(w, "SELECT action FROM decision_log")]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing (contracts, issue, decision_log)");
  w.prepare("UPDATE agent_issues SET status = 'closed'").run();
  w.exec(sql);
  ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open'").n === 1, "and once the issue is closed a replay files a fresh open one (the dedupe is against open issues only)");
}
// rollback
{
  const r = world();
  r.exec(sql);
  r.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(st(r, "rt-page-ideas-feed") === "active" && st(r, "rt-page-ideas-sessions") === "active" && st(r, "rt-page-q08-sitemap") === "superseded" && st(r, "rt-page-qwav-sitemap") === "superseded", "Rollback re-arms the ideas contracts and supersedes the sitemaps");
  ok(q1(r, "SELECT status s FROM agent_issues WHERE title LIKE 'IDEAS-HUB-SLOW-RSS-1:%'").s === "closed", "and closes the issue");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
