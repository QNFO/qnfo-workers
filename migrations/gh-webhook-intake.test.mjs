// GH-WEBHOOK-INTAKE-1 / GH-APP-FLEET-2 offline suite: applies migrations/2026-10-20-gh-webhook-intake.sql on SQLite (node:sqlite) over fixtures of the three tables it touches.
// Proves: the file opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, a BACKUP table it creates first, a spof-review answer for the new route and broker), deletes nothing in its body,
// adds two standing runner-https slice contracts with no issue_id (so a pass can never close issue 2582 or 2596 early) whose probe JSON names a marker the shipped worker really answers with,
// appends one PROGRESS note to each issue (the remainder and its doer), leaves both issues open on their own closing probes, is re-runnable, and its Rollback restores both issue
// descriptions text for text.
// Run: node migrations/gh-webhook-intake.test.mjs        (GW_SKIP_MIGRATION=1 runs the same assertions on the pre-change state and must fail)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "2026-10-20-gh-webhook-intake.sql"), "utf8");
const worker = readFileSync(join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const SKIP = process.env.GW_SKIP_MIGRATION === "1";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
const rollback = hdr("Rollback");
ok(rollback.length > 500 && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1, "one single-line Rollback");
ok(hdr("BACKUP") === "bak_20261020_gh_webhook_issues", "BACKUP names the table the file creates first");
ok(/^CREATE TABLE IF NOT EXISTS bak_20261020_gh_webhook_issues AS SELECT /.test(body.trim()), "the backup copy of the two issues is the first statement");
ok(!/\b(DELETE\s+FROM|DROP)\b/i.test(body), "the body deletes and drops nothing");
ok(/^-- spof-review: .{40,}/m.test(sql), "a spof-review answer names the second path of the webhook and of the broker");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/GH_WEBHOOK_SECRET\s*[=:]\s*\S{8,}/.test(sql) && !/ghs_|ghp_|github_pat_/.test(sql), "no secret value in the file");

const D2582 = "GH-WEBHOOK-INTAKE-1: receive GitHub events in a fleet worker instead of polling.\nrunner-probe: kept.";
const D2596 = "GH-APP-FLEET-2: move the other GitHub-token workers onto the App token.\nruntime-probe: {\"url\": \"https://qnfo-ops.q08.workers.dev/health\", \"status\": 200, \"contains\": \"\\\"gh_app\\\":\\\"ok\\\"\"}";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  w.prepare("INSERT INTO agent_issues VALUES (2582, 'GH-WEBHOOK-INTAKE-1', ?, 'open', 1792249106000)").run(D2582);
  w.prepare("INSERT INTO agent_issues VALUES (2596, 'GH-APP-FLEET-2', ?, 'open', 1792249106000)").run(D2596);
  return w;
}
const applied = () => { const w = world(); if (!SKIP) w.exec(body); return w; };

{
  const w = applied();
  const cs = w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all();
  ok(cs.length === 2 && cs.map((c) => c.class).join() === "slice-gh-app-broker-live,slice-gh-webhook-route-live", "two slice contracts", cs.map((c) => c.class));
  for (const c of cs) {
    ok(c.issue_id === null && c.verify_transport === "runner-https" && c.status === "active" && c.max_attempts === 3, c.class + ": standing, runner-https, no issue_id (a pass cannot close an issue)");
    let p = null; try { p = JSON.parse(c.verify_probe); } catch (e) { p = null; }
    ok(p && /^https:\/\/qnfo-fleet-control\.q08\.workers\.dev\/(gh\/webhook|gh-app)$/.test(p.url) && p.status === 200 && typeof p.contains === "string" && Object.keys(p).sort().join() === "contains,max_ms,status,url", c.class + ": the probe is {url, status, contains, max_ms} only", p);
  }
  const pw = JSON.parse(cs.find((c) => c.class === "slice-gh-webhook-route-live").verify_probe), pb = JSON.parse(cs.find((c) => c.class === "slice-gh-app-broker-live").verify_probe);
  ok(JSON.stringify({ ok: true, route: "gh-webhook-intake", worker_version: "x" }).includes(pw.contains) && /route: "gh-webhook-intake"/.test(worker), "the webhook marker is what the shipped GET /gh/webhook answers (JSON.stringify of the status object contains it)", pw.contains);
  ok(JSON.stringify({ ok: true, worker_version: "x", broker: "service-binding", broker_callers: 13 }).includes(pb.contains) && /broker: "service-binding"/.test(worker), "the broker marker is what the shipped GET /gh-app answers", pb.contains);
  ok(!JSON.stringify({ ok: false, error: "not found" }).includes(pw.contains) && !JSON.stringify({ ok: true, worker_version: "0.42.0" }).includes(pb.contains), "neither marker passes on the old worker (the probes measure the slice, not a string that already passes)");
  const i1 = w.prepare("SELECT description, status FROM agent_issues WHERE id = 2582").get(), i2 = w.prepare("SELECT description, status FROM agent_issues WHERE id = 2596").get();
  ok(i1.description.startsWith(D2582 + "\n") && /PROGRESS 2026-10-20 .*GH-WEBHOOK-INTAKE-1 route/.test(i1.description) && /GH_WEBHOOK_SECRET/.test(i1.description) && /github-settings-actions/.test(i1.description) && /IDENTITY-BOUND/.test(i1.description), "issue 2582 keeps its text and gains the progress note with the remainder and its doer", i1.description.slice(-300));
  ok(i2.description.startsWith(D2596 + "\n") && /GH-APP-FLEET-2 broker route/.test(i2.description) && /qnfo-ops first/.test(i2.description) && /gh_app ok/.test(i2.description), "issue 2596 keeps its text (including its runtime-probe line) and gains the progress note", i2.description.slice(-300));
  ok(i1.status === "open" && i2.status === "open", "both issues stay open on their own closing probes");
  ok(w.prepare("SELECT updated_at FROM agent_issues WHERE id = 2582").get().updated_at > 1792249106000, "updated_at moves forward (milliseconds)");
  ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "one decision_log row");
  ok(w.prepare("SELECT COUNT(*) n FROM bak_20261020_gh_webhook_issues").get().n === 2, "the backup holds both pre-change descriptions");
}

if (!SKIP) {
  const w = applied();
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM agent_issues").all(), w.prepare("SELECT class FROM remediation_contracts ORDER BY class").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get(), w.prepare("SELECT COUNT(*) n FROM bak_20261020_gh_webhook_issues").get()]);
  const once = snap();
  w.exec(body);
  ok(snap() === once, "a second apply changes nothing (guarded UPDATEs, INSERT OR IGNORE, decision_log guarded by text)");
  const pre = world();
  const preDesc = JSON.stringify(pre.prepare("SELECT id, description, status FROM agent_issues ORDER BY id").all());
  w.exec(rollback);
  ok(JSON.stringify(w.prepare("SELECT id, description, status FROM agent_issues ORDER BY id").all()) === preDesc, "the Rollback restores both issue descriptions text for text");
  ok(w.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 0, "the Rollback removes both contracts");
}
console.log(`gh-webhook-intake (migration): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
