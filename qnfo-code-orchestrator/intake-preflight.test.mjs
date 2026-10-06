// CODE-TASK-PREFLIGHT-1 (qnfo-code-orchestrator 0.4.0, agent_issues 2067) offline suite. In-memory D1, fetch stubbed.
// Proves: intake refuses, before a code_tasks row or a model call, a task whose file is over the loop's cap, whose code-anchor
// does not occur exactly once after ANCHOR-REPAIR-1, whose file is over MAX_FILE_CHARS without an anchor, or whose issue key
// shipped in fleet_changelog within 72h (no file read then); the refused issue keeps its target as a session-task line with a
// dated reason and one audit row; a repairable anchor is repaired at intake and the task carries the repaired anchor; an
// unreadable file is let through (fail open); a control-plane path keeps lever 15's routing and is not preflighted.
// Run: node --no-warnings qnfo-code-orchestrator/intake-preflight.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ipf-"));
fs.writeFileSync(path.join(tmp, "w.mjs"), fs.readFileSync(path.join(here, "worker.js"), "utf8") + "\nexport { intakeIssues as __intake, issueKey as __key, preflightDecide as __decide, MAX_PATCH_FILE_CHARS as __cap, MAX_FILE_CHARS as __small };\n");
let files = {}, fetched = [];
globalThis.fetch = async (u) => {
  const url = String(u);
  fetched.push(url);
  const m = /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\/(.+)$/.exec(url);
  const p = m ? decodeURIComponent(m[1]) : null;
  if (p && Object.prototype.hasOwnProperty.call(files, p)) return files[p] === 503 ? new Response("unavailable", { status: 503 }) : new Response(files[p], { status: 200 });
  return new Response("nf", { status: 404 });
};
const { __intake, __key, __decide, __cap, __small } = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

// Pure parts.
ok(__key("MECHANISM-FIRST-1: fix it") === "MECHANISM-FIRST-1" && __key("CODE-TASK-PREFLIGHT-1: x") === "CODE-TASK-PREFLIGHT-1", "issueKey reads the key before the colon");
ok(__key("METRIC-TRIGGER-378-CODE-TASK-SUCCESS-RATE-30D: gap") === null && __key("no key here") === null && __key("lower-case-1: x") === null, "metric-trigger titles, prose and lower case give no key");
const big = "x".repeat(__small + 10);
ok(/shipped as qnfo-x 1\.2\.0/.test((__decide(null, null, { key: "K-1", where: "qnfo-x 1.2.0" }) || {}).refuse || ""), "a shipped key refuses");
ok(__decide({ ok: false, status: 503 }, "a", null) === null && __decide(null, "a", null) === null, "an unreadable file is let through");
ok(/over the loop's/.test((__decide({ ok: true, content: "y", truncated: true, size: __cap + 5 }, null, null) || {}).refuse || ""), "a file over the cap refuses");
ok(__decide({ ok: true, content: "aa ANCHOR bb" }, "ANCHOR", null) === null, "an anchor that occurs once passes");
ok(/occurs 2 times/.test((__decide({ ok: true, content: "ANCHOR ANCHOR" }, "ANCHOR", null) || {}).refuse || ""), "an anchor that occurs twice refuses");
ok(/occurs 0 times/.test((__decide({ ok: true, content: "nothing here" }, "ANCHOR", null) || {}).refuse || ""), "an anchor that occurs nowhere and cannot be repaired refuses");
const rep = __decide({ ok: true, content: "a\n  if (x) {\n      return y;\n  }\nz" }, "if (x) { return y; }", null);
ok(rep && !rep.refuse && rep.anchor && rep.repaired === "whitespace", "a re-wrapped anchor is repaired, not refused", rep);
ok(/no code-anchor/.test((__decide({ ok: true, content: big }, null, null) || {}).refuse || ""), "a file over MAX_FILE_CHARS with no anchor refuses");
ok(__decide({ ok: true, content: "small file" }, null, null) === null, "a small file with no anchor passes");

// Intake, end to end, on an in-memory D1.
function mkEnv(issues, opts) {
  opts = opts || {};
  const inserted = [], audits = [];
  const stmt = (q) => {
    let a = [];
    const s = {
      bind(...x) { a = x; return s; },
      async run() {
        if (/^INSERT INTO code_tasks/.test(q)) inserted.push({ id: a[0], path: a[2], goal: a[3], ctx: a[4] });
        if (/INSERT INTO (audit|cloud_ops_events|fleet_audit)/i.test(q)) audits.push(a);
        if (/^UPDATE agent_issues SET description = replace/.test(q)) { const i = issues.find((r) => r.id === a[2]); if (i) i.description = i.description.replace(/code-task: repo=/g, "session-task: repo=") + a[0]; }
        return { success: true, meta: {} };
      },
      async first() {
        if (/FROM fleet_changelog/.test(q)) return (opts.shipped || []).indexOf(a[1]) >= 0 ? { worker: "qnfo-x", version: "1.2.0" } : null;
        if (/COUNT\(\*\) AS n FROM code_tasks/.test(q)) return { n: 0 };
        return null;
      },
      async all() {
        if (/FROM agent_issues WHERE status='open' AND description LIKE '%code-task:%'/.test(q)) return { results: issues.filter((r) => r.description.includes("code-task:")) };
        if (/FROM service_registry/.test(q)) return { results: [{ service: "qnfo-infra" }, { service: "qnfo-cloud-ops" }, { service: "qnfo-gateway" }] };
        return { results: [] };
      },
    };
    return s;
  };
  return { env: { AUDIT_DB: { prepare: stmt, batch: async (xs) => xs.map(() => ({ results: [] })) } }, inserted, audits };
}
const auditText = (audits) => audits.map((x) => x.map(String).join(" | ")).join("\n");

{
  files = { "qnfo-infra/worker.js": "var VERSION = \"1.0.0\";\nfunction a() {}\n" }; fetched = [];
  const issues = [{ id: 3001, title: "STALE-ANCHOR-1: x", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js\ncode-anchor: this text is not in the file anywhere" }];
  const { env, inserted, audits } = mkEnv(issues);
  await __intake(env, 2);
  ok(inserted.length === 0, "an anchor that occurs nowhere builds no code task", inserted);
  ok(/session-task: repo=qnfo-workers path=qnfo-infra\/worker\.js/.test(issues[0].description) && /CODE-TASK-PREFLIGHT-1 .*occurs 0 times/.test(issues[0].description), "its line becomes a session-task line with the dated reason", issues[0].description);
  ok(/code-task\.intake-preflight/.test(auditText(audits)) && /refused/.test(auditText(audits)), "one preflight audit row records the refusal", auditText(audits));
}
{
  files = { "qnfo-infra/worker.js": "small" }; fetched = [];
  const issues = [{ id: 3002, title: "MECHANISM-FIRST-1: redo it", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js" }];
  const { env, inserted } = mkEnv(issues, { shipped: ["MECHANISM-FIRST-1"] });
  await __intake(env, 2);
  ok(inserted.length === 0 && /shipped as qnfo-x 1\.2\.0 within 72h/.test(issues[0].description), "a key that shipped within 72h builds no task and says where it shipped", issues[0].description);
  ok(fetched.length === 0, "a shipped key needs no file read", fetched);
}
{
  files = { "qnfo-infra/worker.js": "line one\nconst MARK = 1; // the edit goes here\nline three\n" }; fetched = [];
  const issues = [{ id: 3003, title: "GOOD-1: x", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js\ncode-anchor: const MARK = 1; // the edit goes here" }];
  const { env, inserted } = mkEnv(issues);
  await __intake(env, 2);
  ok(inserted.length === 1 && /^\[issue #3003\]/.test(inserted[0].goal) && JSON.parse(inserted[0].ctx).anchor === "const MARK = 1; // the edit goes here", "a sound task is created with its anchor", inserted);
  ok(/code-task: repo=/.test(issues[0].description), "a sound issue keeps its code-task line");
}
{
  files = { "qnfo-infra/worker.js": "a\n  if (x) {\n      return y;\n  }\nz" }; fetched = [];
  const issues = [{ id: 3004, title: "REWRAP-1: x", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js\ncode-anchor: if (x) { return y; }" }];
  const { env, inserted, audits } = mkEnv(issues);
  await __intake(env, 2);
  ok(inserted.length === 1 && JSON.parse(inserted[0].ctx).anchor === "if (x) {\n      return y;\n  }", "a re-wrapped anchor is repaired at intake and the task carries the repaired anchor", inserted);
  ok(/code-task\.anchor-repaired/.test(auditText(audits)), "the repair is audited as code-task.anchor-repaired (the issue-2007 probe reads it)");
}
{
  files = { "qnfo-infra/worker.js": 503 }; fetched = [];
  const issues = [{ id: 3005, title: "FLAKY-READ-1: x", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js\ncode-anchor: anything" }];
  const { env, inserted } = mkEnv(issues);
  await __intake(env, 2);
  ok(inserted.length === 1, "an unreadable file is let through to the read step (fail open)", inserted);
}
{
  files = { "qnfo-cloud-ops/worker.js": "x".repeat(__small + 50) }; fetched = [];
  const issues = [{ id: 3006, title: "NOANCHOR-1: x", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-cloud-ops/worker.js" }];
  const { env, inserted } = mkEnv(issues);
  await __intake(env, 2);
  ok(inserted.length === 0 && /no code-anchor/.test(issues[0].description), "a large file with no anchor builds no task and asks for an anchor", issues[0].description);
}
{
  files = {}; fetched = [];
  const issues = [{ id: 3007, title: "CP-1: x", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js" }];
  const { env, inserted } = mkEnv(issues);
  await __intake(env, 2);
  ok(inserted.length === 0 && /MERGE-SCOPE-INTAKE-1/.test(issues[0].description) && !/CODE-TASK-PREFLIGHT-1/.test(issues[0].description), "a control-plane path keeps lever 15's routing and is not preflighted", issues[0].description);
  ok(fetched.length === 0, "no read for a control-plane path", fetched);
}

const src = fs.readFileSync(path.join(here, "worker.js"), "utf8");
ok(/"CODE-TASK-PREFLIGHT-1: intake reads the target from main once/.test(src) && /var VERSION = "0\.4\.\d+-/.test(src), "/health names CODE-TASK-PREFLIGHT-1 and the version is 0.4.x (a minor: a decision the loop now takes)");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
