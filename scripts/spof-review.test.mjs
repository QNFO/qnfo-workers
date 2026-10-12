// scripts/spof-review.test.mjs -- SPOF-REVIEW-GATE-1 (agent_issues 2184, pillar autonomy). Runs in the full suite set (SUITE-RUNNER-1).
// 1. The gate's own selftest (scripts/spof_review.py --selftest), which holds the 2026-10-08 heartbeat case as data.
// 2. The heartbeat case end to end in a throwaway repository: a change that adds a second cron and a trigger on the one
//    heartbeat table FAILS under enforcement, passes as an advisory without it, and passes once it names its second path
//    (a spof_registry row in the same change, or a spof-review line in a commit message).
// 3. The gate rides workers_standards_guard.py, the step every pull request already runs.
// 4. The other scripts-side gates of the same change: worker_size_check, conflict_repair, canary_revert, the standards guard.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PY = process.env.PYTHON || "python3";
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const run = (cmd, args, cwd, env) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: Object.assign({}, process.env, { GITHUB_EVENT_PATH: "", SPOF_REVIEW: "" }, env || {}) });

if (spawnSync(PY, ["--version"]).status !== 0) {
  console.log("spof-review: python3 is absent on this runner; the Python suites run in deploy-gate. skipped");
  process.exit(0);
}

const st = run(PY, [join(HERE, "spof_review.py"), "--selftest"], HERE);
ok(st.status === 0 && /spof_review selftest: ok/.test(st.stdout), "spof_review.py --selftest passes" + (st.status === 0 ? "" : ": " + (st.stdout + st.stderr).slice(-600)));

const t = mkdtempSync(join(tmpdir(), "spof-"));
const g = (...a) => { const r = run("git", a, t); if (r.status !== 0) throw new Error("git " + a.join(" ") + ": " + r.stderr); return r.stdout; };
g("init", "-q", "-b", "main"); g("config", "user.email", "a@b.c"); g("config", "user.name", "t");
mkdirSync(join(t, "hb")); mkdirSync(join(t, "migrations"));
const OBS = "[observability]\nenabled = true\n[observability.traces]\nenabled = true\n";
writeFileSync(join(t, "hb/wrangler.toml"), 'name = "hb"\n[triggers]\ncrons = ["0 * * * *"]\n' + OBS);
writeFileSync(join(t, "hb/worker.js"), "export default {};\n");
g("add", "-A"); g("commit", "-qm", "base"); g("checkout", "-q", "-b", "change");
writeFileSync(join(t, "hb/wrangler.toml"), 'name = "hb"\n[triggers]\ncrons = ["0 * * * *", "*/10 * * * *"]\n' + OBS);
writeFileSync(join(t, "migrations/2026-10-08-heartbeat.sql"), "-- APPLY-BY: ci\nCREATE TRIGGER IF NOT EXISTS hb_tick_10m AFTER INSERT ON fleet_tick\nBEGIN\n  INSERT INTO hb_actions (kind) VALUES ('tick');\nEND;\n");
g("add", "-A"); g("commit", "-qm", "heartbeat: a second cron row and a trigger on the tick table");

let r = run(PY, [join(HERE, "spof_review.py"), "main", "--enforce"], t);
ok(r.status === 1 && /\[cron\] hb\/wrangler\.toml: \*\/10 \* \* \* \*/.test(r.stdout) && /\[d1-trigger\] migrations\/2026-10-08-heartbeat\.sql: hb_tick_10m on fleet_tick/.test(r.stdout),
  "the heartbeat case fails under enforcement and names the cron and the trigger: " + r.stdout.slice(0, 500));
r = run(PY, [join(HERE, "spof_review.py"), "main"], t);
ok(r.status === 0 && /advisory/.test(r.stdout), "with no pull request event the same findings are an advisory");
r = run(PY, [join(HERE, "workers_standards_guard.py"), "main"], t, { SPOF_REVIEW: "enforce" });
ok(r.status === 1 && /SPOF-REVIEW-GATE-1: 2 new dependencies/.test(r.stdout) && /WORKERS-STANDARDS-GUARD-1: ok/.test(r.stdout), "the gate rides workers_standards_guard.py and fails the step: " + r.stdout.slice(0, 400));
const ev = join(t, "..", "spof-event-" + process.pid + ".json");
writeFileSync(ev, JSON.stringify({ pull_request: { body: "Pillar: autonomy", created_at: "2026-10-01T00:00:00Z" } }));
r = run(PY, [join(HERE, "workers_standards_guard.py"), "main"], t, { GITHUB_EVENT_PATH: ev });
ok(r.status === 0 && /advisory/.test(r.stdout), "a pull request opened before the gate landed is not failed by it");
writeFileSync(ev, JSON.stringify({ pull_request: { body: "Pillar: autonomy", created_at: "2026-10-20T00:00:00Z" } }));
r = run(PY, [join(HERE, "workers_standards_guard.py"), "main"], t, { GITHUB_EVENT_PATH: ev });
ok(r.status === 1, "a pull request opened after the gate landed is failed by it");
writeFileSync(ev, JSON.stringify({ pull_request: { body: "Pillar: autonomy\n\nspof-review: the runner dispatches the tick when the cron heartbeat is silent for 30 minutes", created_at: "2026-10-20T00:00:00Z" } }));
r = run(PY, [join(HERE, "workers_standards_guard.py"), "main"], t, { GITHUB_EVENT_PATH: ev });
ok(r.status === 0 && /reviewed by the spof-review line in the pull request text/.test(r.stdout), "naming the second path in the pull request text passes: " + r.stdout.slice(0, 300));
r = run(PY, [join(HERE, "spof_review.py"), "main"], t, { SPOF_REVIEW: "off" });
ok(r.status === 0 && /skipped/.test(r.stdout), "SPOF_REVIEW=off skips the gate (the recorded off switch)");
writeFileSync(join(t, "migrations/2026-10-08-heartbeat-spof.sql"), "-- APPLY-BY: ci\nINSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, evidence) VALUES ('fleet heartbeat', 'worker cron', 'runner dispatch', 'measured');\n");
g("add", "-A"); g("commit", "-qm", "register the heartbeat's second path");
r = run(PY, [join(HERE, "spof_review.py"), "main", "--enforce"], t);
ok(r.status === 0 && /reviewed by a spof_registry row/.test(r.stdout), "a spof_registry row in the same change passes under enforcement: " + r.stdout.slice(0, 300));

for (const [script, marker] of [["worker_size_check.py", /worker_size_check selftest: ok/], ["conflict_repair.py", /conflict_repair selftest: ok/], ["canary_revert.py", /canary-revert selftest: ok/]]) {
  if (!existsSync(join(HERE, script))) { ok(false, script + " exists"); continue; }
  const s = run(PY, [join(HERE, script), "--selftest"], resolve(HERE, ".."));
  ok(s.status === 0 && marker.test(s.stdout), script + " --selftest passes" + (s.status === 0 ? "" : ": " + (s.stdout + s.stderr).slice(-800)));
}
const sg = run(PY, [join(HERE, "workers_standards_guard.test.py")], resolve(HERE, ".."));
ok(sg.status === 0 && /all passed/.test(sg.stdout), "workers_standards_guard.test.py passes" + (sg.status === 0 ? "" : ": " + sg.stdout.slice(-800)));
const mig = readFileSync(join(HERE, "..", "migrations", "2026-10-12-spof-review-gate.sql"), "utf8");
ok(/-- APPLY-BY: ci/.test(mig) && /control_registry/.test(mig) && /spof-review-gate/.test(mig), "the gate is itself a control_registry row (migrations/2026-10-12-spof-review-gate.sql)");

console.log("spof-review: " + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
