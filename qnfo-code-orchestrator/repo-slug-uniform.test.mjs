// REPOSLUG-UNIFORM-1 offline suite (qnfo-code-orchestrator 0.18.24, agent_issues 100062 and 100050, pillar autonomy).
// repoSlug() stripped ANY one owner segment (other/qnfo-workers read as this repository) and only one (QNFO/QNFO/qnfo-workers
// was refused at every read, 19 times in 24 h). It now strips only the QNFO owner, case-insensitive, any number of times, as
// scripts/code-task-publish.py repo_slug(), qnfo-fleet-control cmRepoSlug() and the code_tasks triggers do. The function is
// taken from worker.js itself, and the read path is driven end to end for a foreign owner and a doubled QNFO owner.
// Run: node --no-warnings qnfo-code-orchestrator/repo-slug-uniform.test.mjs   (exit 0 = all passed)
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x) : "")); } };
const m = /function repoSlug\(repo\) \{[\s\S]*?\n\}/.exec(src);
ok(!!m, "repoSlug is found in worker.js");
const repoSlug = new Function(m[0] + "\nreturn repoSlug;")();
const cases = [
  ["qnfo-workers", "qnfo-workers"], ["QNFO/qnfo-workers", "qnfo-workers"], ["qnfo/qnfo-workers", "qnfo-workers"],
  ["QNFO/QNFO/qnfo-workers", "qnfo-workers"], ["  /QNFO/qnfo-workers/ ", "qnfo-workers"], ["other/qnfo-workers", "other/qnfo-workers"],
  ["qnfo-other/qnfo-workers", "qnfo-other/qnfo-workers"], [null, ""], ["", ""],
];
for (const [inp, want] of cases) ok(repoSlug(inp) === want, "repoSlug(" + JSON.stringify(inp) + ") is " + JSON.stringify(want), repoSlug(inp));
// End to end: the read step of a task whose repo names a foreign owner is refused before any raw read; a doubled QNFO owner reads.
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;
const { DatabaseSync } = await import("node:sqlite");
const db = new DatabaseSync(":memory:");
const D1 = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x.map((v) => (v === undefined ? null : v)); return st; }, run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...a).changes) } }), first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; }, _db: db };
db.exec("CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT); CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);");
const SRC = 'export default { fetch() { return new Response("a"); } };\n';
const reads = [];
globalThis.fetch = async (u) => { reads.push(String(u)); const mm = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u)); return mm && /^fx\//.test(mm[1]) ? new Response(SRC, { status: 200 }) : new Response("nf", { status: 404 }); };
const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: D1, PR_PUBLISH_MODE: "pull", AI: { run: async () => ({ response: "" }) } };
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async () => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 4, budgetMs: 4000, plan: false, intake: false }) }), env)).json();
await tick();
const now = new Date().toISOString();
const add = (id, repo) => db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, repo, "fx/worker.js", "g", "queued", "read", 0, now, now);
add("ct_double", "QNFO/QNFO/qnfo-workers");
await tick();
const d = db.prepare("SELECT step, last_error FROM code_tasks WHERE id = 'ct_double'").get();
ok(d.step === "propose" && !/repo name refused/.test(d.last_error || ""), "a doubled QNFO owner reads main and moves on to propose", d);
db.prepare("DELETE FROM code_tasks").run();
reads.length = 0;
add("ct_foreign", "other/qnfo-workers");
await tick();
const f = db.prepare("SELECT step, last_error FROM code_tasks WHERE id = 'ct_foreign'").get();
ok(/repo name refused for raw read/.test(f.last_error || "") && reads.length === 0, "a foreign owner is refused and never read as this repository", { f, reads });
console.log("repo-slug-uniform.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
