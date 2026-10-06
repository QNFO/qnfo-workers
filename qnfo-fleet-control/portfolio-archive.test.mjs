// PORTFOLIO-ARCHIVE-1 (qnfo-fleet-control 0.5.0, REPO-ARCHIVE-1 agent_issues 2045): pfHygieneApply executes explicit
// portfolio_actions archive-request rows (PATCH archived=true, reversible, at most PF_ARCHIVE_MAX per sync, never a delete),
// records an archive row and settles the request row. The guard (non-author review of PR 720): never a repository the fleet
// runs on (PF_ARCHIVE_DENY), only a repository portfolio_repos knows, and only one with no WBS code (docs/PORTFOLIO.md
// rule 3). Run: node qnfo-fleet-control/portfolio-archive.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const apply = src.slice(src.indexOf("async function pfHygieneApply(env, ev, wbsRows) {"), src.indexOf("// ---- PORTFOLIO-LOOP-1:END ----"));
const maxLine = /var PF_ARCHIVE_MAX = \d+;/.exec(src);
const denyLine = /var PF_ARCHIVE_DENY = \{[^\n]*\};/.exec(src);
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); if (!c) fails++; };
check(maxLine && Number(/\d+/.exec(maxLine[0])[0]) <= 5, "PF_ARCHIVE_MAX is declared and small (one bad run cannot archive the organisation)", maxLine && maxLine[0]);
check(denyLine && /"qnfo-workers": 1/.test(denyLine[0]) && /"\.github": 1/.test(denyLine[0]) && /"license": 1/.test(denyLine[0]), "PF_ARCHIVE_DENY names qnfo-workers, .github and license", denyLine && denyLine[0]);

const REGISTER = { "personal-life-workers": { wbs: "", archived: 0 }, "some-repo": { wbs: "", archived: 0 }, x: { wbs: null, archived: 0 }, "qnfo-workers": { wbs: "", archived: 0 }, ".github": { wbs: "QNFO.GOV,QNFO.GOV.001", archived: 0 }, license: { wbs: "", archived: 0 }, "research-x": { wbs: "QNFO.RES.004", archived: 0 }, "old-demo": { wbs: "", archived: 1 } };
function run(requests, patchStatus, patchArchived, register) {
  const reg = register || REGISTER, writes = [], patches = [];
  const sandbox = {
    __name: (f) => f, JSON, String, Number, Object, Array, Math, console,
    PF_ORG: "QNFO", PF_LICENSE_PATH: "LICENSE", PF_LICENSE_REPO: "QNFO/license", PF_HYGIENE_MAX: 12,
    pfWrittenDescriptions: async () => ({}),
    pfHygienePlan: () => [],
    charterRows: async (env, sql) => (/archive-request/.test(sql) ? requests : []),
    pfGhJson: async (env, method, url, body) => { patches.push({ method, url, body }); return { status: patchStatus, json: patchStatus === 200 ? { archived: patchArchived } : { message: "nope" } }; },
    timedFetch: async () => { throw new Error("not used"); },
    pfGh: () => ({}),
    env: { AUDIT: { prepare(sql) { let args = []; const s = { bind(...a) { args = a; return s; }, async first() { return /FROM portfolio_repos WHERE name = \?1/.test(sql) ? (reg[args[0]] || null) : null; }, async run() { writes.push({ sql, args }); return { meta: { changes: 1 } }; } }; return s; } } }
  };
  vm.createContext(sandbox);
  vm.runInContext(maxLine[0] + "\n" + denyLine[0] + "\n" + apply + "\n__out = pfHygieneApply(env, { ts: '2026-10-07T03:00:00Z' }, []);", sandbox);
  return sandbox.__out.then((out) => ({ out, writes, patches }));
}
const settle = (r) => r.writes.filter((w) => /UPDATE portfolio_actions SET status/.test(w.sql)).map((w) => w.args[0]);

// 1. a requested row for a registered, WBS-free, unarchived repository is archived once, recorded, and settled as committed
let r = await run([{ id: 157, repo: "QNFO/personal-life-workers" }], 200, true);
check(r.patches.length === 1 && r.patches[0].method === "PATCH" && r.patches[0].url === "https://api.github.com/repos/QNFO/personal-life-workers" && r.patches[0].body.archived === true, "one PATCH archived=true on the organisation repository", r.patches);
check(r.out.length === 1 && r.out[0].action === "archive" && r.out[0].status === "committed" && r.out[0].repo === "personal-life-workers", "the sync result lists the archive as committed", r.out);
const ins = r.writes.find((w) => /INSERT INTO portfolio_actions/.test(w.sql)), upd = r.writes.find((w) => /UPDATE portfolio_actions SET status/.test(w.sql));
check(ins && ins.args[1] === "personal-life-workers" && ins.args[2] === "archive" && ins.args[3] === "committed", "an archive row is written for the next sync to measure", ins && ins.args);
check(upd && upd.args[0] === "committed" && upd.args[2] === 157 && /committed: archived on request 157/.test(upd.args[1]), "the request row 157 is settled as committed with the answer appended", upd && upd.args);
// 2. a refused PATCH fails the request (never retried silently as a delete) and stays visible
r = await run([{ id: 158, repo: "some-repo" }], 403, false);
check(r.out[0].status === "write-failed" && /PATCH HTTP 403/.test(r.out[0].note), "HTTP 403 is a write-failed archive with the status in the note", r.out);
check(settle(r)[0] === "failed", "the request row becomes failed", r.writes);
// 3. a 200 that does not say archived is not a success; a request outside the organisation is skipped
r = await run([{ id: 159, repo: "other/repo" }, { id: 160, repo: "x" }], 200, false);
check(r.out[0].status === "skipped" && /not a QNFO repository/.test(r.out[0].note) && r.patches.length === 1, "a repository outside QNFO is skipped without a PATCH", r.out);
check(r.out[1].status === "write-failed", "a 200 answer without archived=true is not counted as archived", r.out[1]);
// 4. the guard: the fleet's own repositories are refused even when the register would allow them
r = await run([{ id: 161, repo: "qnfo-workers" }, { id: 162, repo: "QNFO/.github" }, { id: 163, repo: "license" }], 200, true);
check(r.patches.length === 0 && r.out.every((o) => o.status === "skipped" && /refused: the fleet runs on QNFO\//.test(o.note)), "qnfo-workers, .github and license are refused with no PATCH", r.out);
check(settle(r).join() === "skipped,skipped,skipped", "their request rows are settled as skipped, not failed", settle(r));
// 5. the guard: a repository with a WBS code is refused (rule 3), one the register does not know is refused
r = await run([{ id: 164, repo: "research-x" }, { id: 165, repo: "never-synced" }], 200, true);
check(r.patches.length === 0 && r.out[0].status === "skipped" && /refused: has WBS QNFO\.RES\.004/.test(r.out[0].note), "a WBS-coded repository is refused with the code in the note", r.out[0]);
check(r.out[1].status === "skipped" && /not in portfolio_repos/.test(r.out[1].note), "a repository absent from portfolio_repos is refused", r.out[1]);
// 6. already archived at the last sync: nothing to do, the request is satisfied
r = await run([{ id: 166, repo: "old-demo" }], 200, true);
check(r.patches.length === 0 && r.out[0].status === "unchanged" && settle(r)[0] === "committed", "an already archived repository sends no PATCH and settles the request as committed", r.out);
// 7. no request rows: nothing happens
r = await run([], 200, true);
check(r.out.length === 0 && r.patches.length === 0 && r.writes.length === 0, "no archive-request rows: no PATCH, no rows", r);
// 8. the limit is in the query, so one sync never archives more than PF_ARCHIVE_MAX
check(/archive-request' AND status = 'requested' ORDER BY id LIMIT " \+ PF_ARCHIVE_MAX/.test(apply), "the request read is capped at PF_ARCHIVE_MAX per sync");

console.log(fails ? fails + " FAILED" : "portfolio-archive: all assertions passed");
process.exit(fails ? 1 : 0);
