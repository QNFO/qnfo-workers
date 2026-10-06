// MERGE-SCOPE-INTAKE-1 (qnfo-code-orchestrator 0.3.19) offline suite. No network, an in-memory D1 stub.
// A qnfo-workers task on a control-plane worker (the merge runner never opens or merges its pull request) is refused by
// enqueue() before any model call; an issue whose code-task line names one has that line turned into a
// session-task line with the reason, and no code task is created. An ordinary worker task is still queued.
// ANCHOR-REPAIR-1 (0.3.19, T1 lever 4): an anchor that no longer occurs is repaired without a model call when its
// whitespace-normalised text, or one of its long lines, still occurs exactly once; a twice-occurring text is never chosen.
// Run: node --no-warnings qnfo-code-orchestrator/scope-intake.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "msi-"));
fs.writeFileSync(path.join(tmp, "w.mjs"), fs.readFileSync(path.join(here, "worker.js"), "utf8") + "\nexport { mergeScopeWhy as __scope, enqueue as __enqueue, intakeIssues as __intake, PLAN_DENY_WORKERS as __deny, repairAnchor as __repair };\n");
const { __scope, __enqueue, __intake, __deny, __repair } = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

for (const w of ["qnfo-fleet-control", "qnfo-gateway", "qnfo-ai", "qnfo-observability", "qnfo-ops"]) {
  ok(/control-plane/.test(String(__scope("qnfo-workers", w + "/worker.js"))), w + "/worker.js is a session task");
}
ok(__scope("qnfo-workers", "qnfo-infra/worker.js") === null, "an ordinary worker is in scope");
ok(__scope("qnfo-workers", "qnfo-infra/deployed-current.worker.js") === null, "its mirror path is in scope too");
ok(__scope("qnfo-workers", "docs/STRATEGY.md") === null && __scope("qnfo-workers", "qnfo-infra/README.md") === null, "docs and READMEs are in scope");
ok(__scope("qnfo-workers", "scripts/x.py") === null, "other paths are left to the runner as before (the loop suite's scripts/*.py vehicle)");
ok(__scope("other-repo", "qnfo-ops/worker.js") === null, "other repositories are not judged by the qnfo-workers merge runner");
ok(__deny.includes("qnfo-observability"), "PLAN_DENY_WORKERS carries the scorer's host");

// A D1 stub that records statements.
function mkEnv(issues) {
  const log = [], tasks = [];
  const stmt = (q) => {
    let a = [];
    const s = {
      bind(...x) { a = x; return s; },
      async run() {
        log.push({ q, a });
        if (/^INSERT INTO code_tasks/.test(q)) tasks.push({ id: a[0], path: a[2] });
        if (/^UPDATE agent_issues SET description = replace/.test(q)) { const i = issues.find((r) => r.id === a[2]); if (i) i.description = i.description.replace(/code-task: repo=/g, "session-task: repo=") + a[0]; }
        return { success: true, meta: {} };
      },
      async first() { log.push({ q, a }); if (/COUNT\(\*\) AS n FROM code_tasks/.test(q)) return { n: 0 }; return null; },
      async all() {
        log.push({ q, a });
        if (/FROM agent_issues WHERE status='open' AND description LIKE '%code-task:%'/.test(q)) return { results: issues.filter((r) => r.description.includes("code-task:")) };
        if (/FROM service_registry/.test(q)) return { results: [{ service: "qnfo-infra" }, { service: "qnfo-gateway" }, { service: "qnfo-fleet-control" }] };
        return { results: [] };
      },
    };
    return s;
  };
  return { env: { AUDIT_DB: { prepare: stmt, batch: async (xs) => xs.map(() => ({ results: [] })) } }, log, tasks };
}

{
  const { env, tasks } = mkEnv([]);
  const r = await __enqueue(env, { repo: "qnfo-workers", path: "qnfo-gateway/worker.js", goal: "[issue #1] a goal long enough to pass validation of the task body" });
  ok(r.ok === false && r.status === 422 && r.session === true && /control-plane/.test(r.error), "enqueue refuses a control-plane path with a session-task answer", r);
  ok(tasks.length === 0, "no code task row is written for it");
}
{
  const issues = [
    { id: 2023, title: "METRIC-TRIGGER-498 paper render", source: "qnfo-fleet-control", description: "Fix the render.\ncode-task: repo=qnfo-workers path=qnfo-gateway/worker.js\ncode-anchor: function renderPaper(" },
  ];
  const { env, tasks } = mkEnv(issues);
  const out = await __intake(env, 2);
  ok(out.ok && out.created.length === 0 && tasks.length === 0, "intake builds no task for a control-plane code-task line", out);
  ok(/session-task: repo=qnfo-workers path=qnfo-gateway\/worker\.js/.test(issues[0].description) && !/code-task: repo=/.test(issues[0].description), "the issue's code-task line became a session-task line", issues[0].description);
  ok(/MERGE-SCOPE-INTAKE-1 .*control-plane/.test(issues[0].description), "the issue says why", issues[0].description);
}
{
  const base = "function a() {\n  if (x) {\n    return renderPaper(doc, { math: true });\n  }\n}\nvar ROUTES = [\"/papers\", \"/ideas\"];\nvar ROUTES_B = [\"/papers\"];\n";
  const w = __repair(base, "if (x) {\n      return renderPaper(doc,   { math: true });");
  ok(w && w.how === "whitespace" && base.includes(w.anchor) && base.split(w.anchor).length === 2, "a re-indented anchor is repaired to the file's own text", w);
  const l = __repair(base, "if (y) {\n    return renderPaper(doc, { math: true });");
  ok(l && l.how === "line" && l.anchor === "return renderPaper(doc, { math: true });", "an anchor whose first line changed is repaired to its surviving long line", l);
  ok(__repair(base, "nothing like this exists anywhere in the file") === null, "an anchor with no surviving text is not repaired");
  ok(__repair(base + "// return renderPaper(doc, { math: true });\n", "if (y) {\n    return renderPaper(doc, { math: true });") === null, "a surviving line that now occurs twice is not chosen");
  ok(__repair(base, "if (q) {\n  x();") === null, "short lines (under 24 chars) are never used as anchors");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
