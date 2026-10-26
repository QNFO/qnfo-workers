// REM-A5-OPS-200-ONLY-1 offline suite: replays migrations/2026-10-26-rem-a5-ops-200-only-issue.sql on node:sqlite.
// Proves: the header opts in (nothing deleted or dropped); one open issue is filed from a session source with a pillar, a measurement, an edit, a definition of done, a code-task line, a code-anchor that occurs
// exactly once in qnfo-ops/worker.js on this checkout, and a code-probe that the repository's own parser accepts and that FAILS on this checkout (the violation is still there) and would pass without it;
// the text trips neither PLAN_DENY_TEXT nor a phrase v_blocker_claims counts; the dedupe is against open issues only; one decision row; a replay changes nothing; Rollback closes the issue.
// Output MUST contain "0 failed" on success.   node migrations/rem-a5-ops-200-only-issue.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, root), "utf8");
const sql = rd("migrations/2026-10-26-rem-a5-ops-200-only-issue.sql");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const countOf = (text, needle) => { let n = 0, i = 0; while ((i = text.indexOf(needle, i)) >= 0) { n++; i += needle.length; } return n; };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link");
ok(Array.from(body.matchAll(/LIKE\s+'((?:[^']|'')*)'/gi)).every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues (lower(trim(title))) WHERE status = 'open';
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const w = world();
w.exec(sql);
const i = q1(w, "SELECT * FROM agent_issues WHERE title LIKE 'WORKERS-STANDARDS-200-ONLY-1:%'");
ok(!!i && i.status === "open" && i.priority === "medium" && i.category === "reliability" && /^session/.test(i.source), "filed open, medium, reliability, from a session source the planner may take", i && { s: i.status, src: i.source });
ok(/Charter pillar: autonomy/.test(i.description) && /Measured 2026-10-26/.test(i.description) && /Edit \(one file\)/.test(i.description) && /Definition of done:/.test(i.description), "it carries a pillar, a measurement, the edit and a definition of done");
const lines = i.description.split("\n");
const task = lines.find((l) => /^code-task: /.test(l)), anchor = (lines.find((l) => /^code-anchor: /.test(l)) || "").replace(/^code-anchor: /, ""), probe = (lines.find((l) => /^code-probe: /.test(l)) || "").replace(/^code-probe: /, "");
ok(/^code-task: repo=qnfo-workers path=qnfo-ops\/worker\.js$/.test(task), "one code-task line naming qnfo-ops/worker.js", task);
const file = rd("qnfo-ops/worker.js");
ok(anchor.length > 0 && anchor.length <= 300 && countOf(file, anchor) === 1, "the code-anchor occurs exactly once in qnfo-ops/worker.js on this checkout", { n: countOf(file, anchor), anchor: anchor.slice(0, 100) });
let p = null; try { p = JSON.parse(probe); } catch (e) { p = null; }
ok(!!p && Array.isArray(p.paths) && p.paths.join() === "qnfo-ops/worker.js" && typeof p.absent === "string" && p.absent.length > 5, "the code-probe is JSON with the path and an absent text", p);
ok(!!p && countOf(file, p.absent) === 1, "the probe is falsifiable: the text it wants gone is on this checkout (the probe fails now) and one edit removes it", p && countOf(file, p.absent));
ok(!/\b(UPDATE|DELETE|INSERT)\b\s/.test(probe), "the probe text holds none of the words the write-keyword guard scans for");
const orch = rd("qnfo-code-orchestrator/worker.js");
const denyText = new Function("return " + /const PLAN_DENY_TEXT = (\/.*\/[a-z]*);/.exec(orch)[1])();
ok(!denyText.test(i.title + "\n" + i.description), "no word the code orchestrator PLAN_DENY_TEXT refuses", (i.title + i.description).match(denyText));
ok(!["owner only", "owner-only", "needs a token", "no token", "needs the owner", "cannot be done", "blocked", "session-task:"].some((x) => (i.title + " " + i.description).toLowerCase().includes(x)), "no phrase that v_blocker_claims counts");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A5-OPS-200-ONLY-1:%'").get().n === 1, "one decision row");
{ const s1 = JSON.stringify([w.prepare("SELECT title, status FROM agent_issues").all(), w.prepare("SELECT action FROM decision_log").all()]); w.exec(sql); ok(JSON.stringify([w.prepare("SELECT title, status FROM agent_issues").all(), w.prepare("SELECT action FROM decision_log").all()]) === s1, "a second apply changes nothing"); }
{ w.prepare("UPDATE agent_issues SET status = 'closed'").run(); w.exec(sql); ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open'").n === 1, "once the issue is closed a replay files a fresh open one (the dedupe is against open issues only)"); }
{
  const r = world();
  r.exec(sql);
  r.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(q1(r, "SELECT status s FROM agent_issues WHERE title LIKE 'WORKERS-STANDARDS-200-ONLY-1:%'").s === "closed", "Rollback closes the issue");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
