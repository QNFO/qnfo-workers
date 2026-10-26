// RUNTIME-LIVENESS-GAP-4 offline suite: replays migrations/2026-10-26-runtime-liveness-gap-4.sql on node:sqlite.
// Proves: the header opts in; six active hourly runner-https contracts of module runtime-liveness-v1 with no issue are created, with distinct classes and URLs, every spec accepted by the REAL
// parser and host allowlist of scripts/remediation_consumer.py (https, status 200, a marker, a ceiling); an existing contract with the same class is left as it is (INSERT OR IGNORE); one
// decision_log row; a replay changes nothing; the Rollback line supersedes exactly the six.
// Output MUST contain "0 failed" on success.   node migrations/runtime-liveness-gap-4.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(here("./2026-10-26-runtime-liveness-gap-4.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");

function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER DEFAULT 1, status TEXT DEFAULT 'active', module TEXT, budget_ms INTEGER, max_items INTEGER, next_due_at TEXT, last_verdict TEXT, last_attempt_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  w.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status, module, escalate_to) VALUES ('rt-live-qnfo-ops', '{\"url\": \"https://ops.qnfo.org/health\", \"status\": 200, \"contains\": \"version\"}', 'runner-https', 'active', 'runtime-liveness-v1', 'qnfo-ops')").run();
  w.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status, module, escalate_to) VALUES ('rt-live-ai-models', '{\"url\": \"https://example.invalid/kept\", \"status\": 200, \"contains\": \"kept\"}', 'runner-https', 'monitoring', 'runtime-liveness-v1', 'qnfo-ops')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const w = world();
w.exec(sql);
const added = qa(w, "SELECT * FROM remediation_contracts WHERE class <> 'rt-live-qnfo-ops' ORDER BY class");
ok(added.length === 6, "six contracts (one of the same class already existed and is kept)", added.map((r) => r.class));
const fresh = added.filter((r) => r.class !== "rt-live-ai-models");
ok(fresh.length === 5 && fresh.every((r) => r.verify_transport === "runner-https" && r.status === "active" && r.module === "runtime-liveness-v1" && r.issue_id === null && r.expected_cadence_h === 1 && r.max_attempts === 3 && r.escalate_to === "qnfo-ops" && /^rt-(live|page)-/.test(r.class)), "the new ones are active hourly runner-https contracts of module runtime-liveness-v1, no issue, 3 attempts, escalating to qnfo-ops");
const kept = q1(w, "SELECT status, verify_probe FROM remediation_contracts WHERE class = 'rt-live-ai-models'");
ok(kept.status === "monitoring" && /example\.invalid\/kept/.test(kept.verify_probe), "a contract that already holds the class is not overwritten (INSERT OR IGNORE)");
const urls = ["rt-page-fleet-area-autonomy", "rt-page-fleet-area-reliability", "rt-page-fleet-area-platform", "rt-page-fleet-managers", "rt-live-ops-models"].map((c) => JSON.parse(q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", c).p).url);
ok(new Set(urls).size === 5 && urls.every((u) => u.startsWith("https://")), "distinct https URLs", urls);
{
  const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
  if (!PY) console.log("note: no python 3 on this host, the consumer parser check is skipped");
  else {
    const fresh2 = world();
    fresh2.exec("DELETE FROM remediation_contracts WHERE class = 'rt-live-ai-models'");
    fresh2.exec(sql);
    const specs = qa(fresh2, "SELECT verify_probe p FROM remediation_contracts WHERE class <> 'rt-live-qnfo-ops' ORDER BY class").map((r) => r.p);
    const prog = "import sys, json\nsys.path.insert(0, 'scripts')\nimport remediation_consumer as r\nout = []\nfor s in json.loads(sys.stdin.read()):\n    p, why = r.parse_https_probe(s)\n    out.append([p is not None and p['status'] == 200 and bool(p['contains']) and bool(p['max_ms']), why])\nprint(json.dumps(out))";
    const run = spawnSync(PY, ["-I", "-c", prog], { cwd: root, input: JSON.stringify(specs), encoding: "utf8" });
    let parsed = null;
    try { parsed = JSON.parse(String(run.stdout).trim().split("\n").pop()); } catch (e) { parsed = null; }
    ok(run.status === 0 && Array.isArray(parsed) && parsed.length === 6 && parsed.every((x) => x[0] === true), "the consumer's own parse_https_probe accepts all six specs (allowlisted https host, status 200, a marker, a ceiling)", { status: run.status, parsed, err: String(run.stderr).slice(0, 200) });
  }
}
ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'RUNTIME-LIVENESS-GAP-4:%'").n === 1, "one decision_log row");
{
  const snap = () => JSON.stringify([qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT action FROM decision_log")]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing");
}
{
  const r = world();
  r.exec(sql);
  r.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(qa(r, "SELECT class FROM remediation_contracts WHERE status = 'superseded' ORDER BY class").map((x) => x.class).join() === "rt-live-ai-models,rt-live-ops-models,rt-page-fleet-area-autonomy,rt-page-fleet-area-platform,rt-page-fleet-area-reliability,rt-page-fleet-managers", "Rollback supersedes exactly the six classes");
  ok(q1(r, "SELECT status s FROM remediation_contracts WHERE class = 'rt-live-qnfo-ops'").s === "active", "and no other contract");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
