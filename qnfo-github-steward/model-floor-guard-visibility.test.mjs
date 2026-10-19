// MODEL-FLOOR-GUARD-RUNS-OBJECT-1 offline suite (agent_issues 100258, 0.7.3). No network: global fetch is a fake GitHub.
// The workflow-runs endpoint answers {workflow_runs: [...]}, an object; paginate() keeps array bodies only, so 0.7.2 wrote status "empty", runs 0 on every run
// and recordModelFloorGuardRun never created model_floor_guard_runs. These cases pin: the object body is read; a cancelled run says nothing; a failure and a success
// both carry their time; a non-200 answer reads http_<n> and not "empty"; the run table is created and filled and a second pass updates in place.
// Run: node qnfo-github-steward/model-floor-guard-visibility.test.mjs   (exit 0 = all passed)
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " :: " + JSON.stringify(d).slice(0, 300) : "")); } };
const tmp = join(mkdtempSync(join(tmpdir(), "mfg-")), "w.mjs");
writeFileSync(tmp, readFileSync(join(here, "worker.js"), "utf8") + "\nexport { modelFloorGuardVisibility as __vis, recordModelFloorGuardRun as __rec, VERSION as __v };\n");
const W = await import(pathToFileURL(tmp).href);
{ const [maj, min, pat] = W.__v.split(/[.-]/).map(Number); ok(maj > 0 || min > 7 || (min === 7 && pat >= 3), "the worker is at least 0.7.3 (a minimum)", W.__v); }

const RUNS = [
  { id: 4, path: ".github/workflows/model-floor-guard.yml", head_branch: "main", event: "push", conclusion: "cancelled", run_attempt: 1, run_started_at: "2026-10-19T22:10:00Z", html_url: "u4" },
  { id: 3, path: ".github/workflows/model-floor-guard.yml", head_branch: "main", event: "push", conclusion: "failure", run_attempt: 1, run_started_at: "2026-10-19T21:00:00Z", html_url: "u3" },
  { id: 2, path: ".github/workflows/model-floor-guard.yml", head_branch: "main", event: "schedule", conclusion: "success", run_attempt: 1, run_started_at: "2026-10-19T20:00:00Z", html_url: "u2" },
];
const reply = (status, body) => ({ status, headers: { get: () => null }, text: async () => JSON.stringify(body) });
const urls = [];
const fake = (status, runs) => async (url) => (urls.push(String(url)), /\/repos\/QNFO\/qnfo-workers\/actions\/workflows\/model-floor-guard\.yml\/runs/.test(String(url))) ? reply(status, status === 200 ? { total_count: runs.length, workflow_runs: runs } : { message: "x" }) : reply(404, {});
const env = { GITHUB_TOKEN: "t" };

globalThis.fetch = fake(200, RUNS);
let r = { limitations: [], errors: [] };
await W.__vis(env, r);
const m = r.model_floor_guard;
ok(m.status === "ok" && m.runs === 2, "the object body is read and the cancelled run is dropped", m);
ok(m.last_conclusion === "failure" && m.last_run_at === "2026-10-19T21:00:00Z", "the newest decisive run is the last one", m);
ok(m.last_success_at === "2026-10-19T20:00:00Z" && m.last_failure_at === "2026-10-19T21:00:00Z", "success and failure times are both kept", m);

globalThis.fetch = fake(200, []);
r = { limitations: [], errors: [] };
await W.__vis(env, r);
ok(r.model_floor_guard.status === "empty" && r.model_floor_guard.runs === 0, "an answer with no runs reads empty", r.model_floor_guard);

globalThis.fetch = fake(403, []);
r = { limitations: [], errors: [] };
await W.__vis(env, r);
ok(r.model_floor_guard.status === "http_403", "a refusal reads http_403, not empty", r.model_floor_guard);

// the run table: created, filled, updated in place
const db = new DatabaseSync(":memory:");
const wrap = (sql) => { const mk = (args) => ({ bind: (...a) => mk(a.map((v) => (v === undefined ? null : v))), run: async () => { db.prepare(sql).run(...args); return {}; }, _go: () => db.prepare(sql).run(...args) }); return mk([]); };
env.AUDIT = { prepare: wrap, batch: async (sts) => { for (const s of sts) s._go(); } };
globalThis.fetch = fake(200, RUNS);
r = { limitations: [], errors: [], workflows: 0 };
await W.__rec(env, { full_name: "QNFO/qnfo-workers" }, r);
let rows = db.prepare("SELECT run_id, conclusion FROM model_floor_guard_runs ORDER BY run_id").all();
ok(rows.length === 3 && rows[0].conclusion === "success" && r.workflows === 3, "the run table is created and holds every run", rows);
globalThis.fetch = fake(200, RUNS.map((x) => (x.id === 4 ? { ...x, conclusion: "success" } : x)));
await W.__rec(env, { full_name: "QNFO/qnfo-workers" }, { limitations: [], errors: [], workflows: 0 });
rows = db.prepare("SELECT run_id, conclusion FROM model_floor_guard_runs ORDER BY run_id").all();
ok(rows.length === 3 && rows[2].conclusion === "success", "a second pass updates a run in place", rows);
globalThis.fetch = fake(403, []);
r = { limitations: [], errors: [], workflows: 0 };
await W.__rec(env, { full_name: "QNFO/qnfo-workers" }, r);
ok(r.limitations.some((l) => /HTTP 403/.test(l)), "a refusal on the run read becomes a limitation", r.limitations);

ok(urls.length > 0 && urls.every((u) => !/object Object/.test(u)), "every request names the repository qnfo-workers", urls);
console.log("model-floor-guard-visibility: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
