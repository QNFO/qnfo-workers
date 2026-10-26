// OPS-BRANCH-CLOSE-1 offline suite (qnfo-ops 2.59.0, agent_issues 1000036 OPS-ENDPOINT-BRANCH-CLOSE-GAP-1). No network: GitHub is an in-memory fake and qnfo-audit is a real
// node:sqlite database holding the real branch_hygiene_log DDL, so a column the table lacks would throw. Measured 2026-10-26 on main: github_branch_delete (merged in 2.58.1)
// was a function with no tool declaration and no dispatch, and its insert named the columns id, owner, repo and head_sha, which the table does not have.
// Proves: both tools are declared, dispatched, audited and named in the operator prompt, and the dead function is gone; github_branch_delete refuses the default and a protected
// branch and a branch with an open pull request, deletes a branch that is ahead_by 0 (no archive needed) or whose pull requests are all closed (tip archived as
// refs/archive/<branch>-<sha7>), answers confirm_required otherwise and honours confirm: true; github_pr_close closes a pull request superseded by a merged pull request with the same
// [issue #N] tag or with nothing to merge, otherwise needs confirm; the log row is written before the change, in the real columns, and a failed archive or a failed log row stops it.
// Run: node --no-warnings qnfo-ops/branch-close.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };

// declared, dispatched, audited, prompted; the dead function is gone
for (const n of ["github_branch_delete", "github_pr_close"]) {
  ok(src.indexOf('{ name: "' + n + '", description') >= 0, "tool declared: " + n);
}
ok(src.includes('else if (name === "github_branch_delete") res = await githubBranchDelete(env, args);') && src.includes('else if (name === "github_pr_close") res = await githubPrClose(env, args);'), "both tools are dispatched");
ok(/github_branch_delete: "completed"/.test(src) && /github_pr_close: "completed"/.test(src), "both writes are in the audit trail");
ok(/2\. Tools:[^\n]*github_cherry_pick, github_branch_delete, github_pr_close, git_op/.test(src), "operator prompt rule 2 names the tools");
ok(!/async function github_branch_delete\(/.test(src), "the unwired 2.58.1 function is gone");
ok(src === mirror, "deployed-current.worker.js is identical to worker.js");
const _v = (/^var VERSION = "(\d+)\.(\d+)\.(\d+)/m.exec(src) || []).slice(1).map(Number);
ok(_v.length === 3 && (_v[0] > 2 || (_v[0] === 2 && _v[1] >= 59)), "VERSION is at least 2.59.0", _v);

const blk = grab("// ---- OPS-BRANCH-CLOSE-1:BEGIN", "// ---- OPS-BRANCH-CLOSE-1:END");
ok(blk.length > 4000, "the OPS-BRANCH-CLOSE-1 block is found");
const encP = grab("function encPath(s) {", "function gitRepoArg(");
const gitHelpers = (() => { const i = src.indexOf("function gitRepoArg(args, allowDefault) {"); const j = src.indexOf("async function githubCherryPick", i); return src.slice(i, j); })();
const gitRepoRe = (/var GIT_REPO_RE = [^\n]*/.exec(src) || [""])[0];
ok(gitRepoRe.length > 10 && gitHelpers.includes("function gitRepoError"), "the repository helpers are found");

// real qnfo-audit table
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE branch_hygiene_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, branch TEXT NOT NULL, sha TEXT, action TEXT NOT NULL, why TEXT, pr INTEGER, archive_ref TEXT, ok INTEGER DEFAULT 1, dry INTEGER DEFAULT 0)");
let failLog = false;
const AUDIT = { prepare(sql) { let a = []; const s = { bind: (...x) => { a = x; return s; }, run: async () => { if (failLog) throw new Error("D1 down"); calls.push("LOG"); const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return s; } };

// a tiny GitHub: state in memory, every call recorded
const calls = [];
let gh;
const reset = () => { calls.length = 0; db.exec("DELETE FROM branch_hygiene_log"); failLog = false; };
const J = (o, s) => ({ status: s || 200, json: o, text: JSON.stringify(o) });
function mkGh(cfg) {
  return async (env, method, path, body) => {
    calls.push(method + " " + path.split("?")[0] + (body && body.ref ? " " + body.ref : "") + (body && body.state ? " " + body.state : ""));
    if (method === "GET" && /^\/repos\/QNFO\/qnfo-workers$/.test(path)) return J({ default_branch: "main" });
    if (method === "GET" && /\/branches\//.test(path)) { const b = decodeURIComponent(path.split("/branches/")[1]); const x = cfg.branches[b]; return x ? J({ name: b, protected: !!x.protected, commit: { sha: x.sha } }) : J({ message: "Branch not found" }, 404); }
    if (method === "GET" && /\/compare\//.test(path)) { const head = decodeURIComponent(path.split("...")[1]); const x = cfg.branches[head] || cfg.prHeads && cfg.prHeads[head]; return x ? J({ ahead_by: x.ahead }) : J({ message: "not found" }, 404); }
    if (method === "GET" && /\/pulls\?state=all/.test(path)) { const h = decodeURIComponent(/head=([^&]+)/.exec(path)[1]).split(":")[1]; return J((cfg.prs || []).filter((p) => p.head.ref === h)); }
    if (method === "GET" && /\/pulls\?state=closed/.test(path)) return J(cfg.closed || []);
    if (method === "GET" && /\/pulls\/\d+$/.test(path)) { const n = Number(path.split("/").pop()); const p = (cfg.prs || []).find((x) => x.number === n); return p ? J(p) : J({ message: "nf" }, 404); }
    if (method === "POST" && /\/git\/refs$/.test(path)) return cfg.archiveStatus ? J({ message: "boom" }, cfg.archiveStatus) : J({ ref: body.ref }, 201);
    if (method === "DELETE" && /\/git\/refs\/heads\//.test(path)) return { status: 204, json: null, text: "" };
    if (method === "POST" && /\/issues\/\d+\/comments$/.test(path)) { cfg.comments = (cfg.comments || []).concat(body.body); return J({ id: 1 }, 201); }
    if (method === "PATCH" && /\/pulls\/\d+$/.test(path)) return J({ state: "closed" });
    return J({ message: "unexpected " + method + " " + path }, 599);
  };
}
const build = (cfg) => new Function("githubApi", "iso", "console", gitRepoRe + "\n" + encP.replace(/\n__name.*$/gm, "") + "\n" + gitHelpers + "\n" + blk + "\nreturn { githubBranchDelete, githubPrClose };")(mkGh(cfg), () => "2026-10-26T18:00:00.000Z", console);
const env = (o) => Object.assign({ GITHUB_TOKEN: "t", QNFO_AUDIT: AUDIT }, o || {});

(async () => {
  let lib = build({ branches: {} });
  ok((await lib.githubBranchDelete({ QNFO_AUDIT: AUDIT }, { branch: "x" })).ok === false, "no GITHUB_TOKEN: refused");
  ok((await lib.githubBranchDelete(env(), { branch: "../x" })).ok === false && (await lib.githubBranchDelete(env(), { branch: "a..b" })).ok === false && (await lib.githubBranchDelete(env(), { branch: "" })).ok === false, "a bad branch name is refused");
  let r = await lib.githubBranchDelete(env(), { branch: "main" });
  ok(r.ok === false && /default branch/.test(r.error), "main is refused", r);

  reset();
  lib = build({ branches: { prot: { sha: "a".repeat(40), protected: true, ahead: 0 } } });
  r = await lib.githubBranchDelete(env(), { branch: "prot" });
  ok(r.ok === false && /protected/.test(r.error) && !calls.some((c) => c.startsWith("DELETE")), "a protected branch is refused", r);
  r = await lib.githubBranchDelete(env(), { branch: "gone" });
  ok(r.ok === true && r.already_gone === true, "a branch that is not there is already gone, not an error", r);

  // open pull request: refused even with confirm
  reset();
  lib = build({ branches: { feat: { sha: "b".repeat(40), ahead: 3 } }, prs: [{ number: 11, state: "open", title: "t", head: { ref: "feat" } }] });
  r = await lib.githubBranchDelete(env(), { branch: "feat", confirm: true });
  ok(r.ok === false && /open pull request #11/.test(r.error) && !calls.some((c) => c.startsWith("DELETE")), "an open pull request stops the delete even with confirm", r);

  // ahead_by 0: deleted with no archive; the log row comes before the DELETE; real columns
  reset();
  lib = build({ branches: { merged: { sha: "c".repeat(40), ahead: 0 } }, prs: [] });
  r = await lib.githubBranchDelete(env(), { repo: "QNFO/qnfo-workers", branch: "merged" });
  ok(r.ok === true && r.deleted === true && /ahead_by 0/.test(r.proof) && r.archive_ref === null, "an ahead_by 0 branch is deleted without an archive ref", r);
  ok(calls.indexOf("LOG") >= 0 && calls.indexOf("LOG") < calls.findIndex((c) => c.startsWith("DELETE")), "the log row is written before the delete", calls);
  ok(!calls.some((c) => c.startsWith("POST") && c.includes("refs/archive")), "no archive ref for a branch contained in main");
  let row = db.prepare("SELECT * FROM branch_hygiene_log").get();
  ok(row && row.branch === "merged" && row.sha === "c".repeat(40) && row.action === "ops-delete-branch" && row.ok === 1 && row.dry === 0 && /ahead_by 0/.test(row.why), "branch_hygiene_log row in the real columns", row);
  ok(/git\/refs with ref refs\/heads\/merged and sha c{40}/.test(r.restore), "the answer names the restore call", r.restore);

  // closed pull request with commits ahead: archived, then deleted
  reset();
  lib = build({ branches: { old: { sha: "d1d2d3d4" + "0".repeat(32), ahead: 2 } }, prs: [{ number: 21, state: "closed", merged_at: null, title: "t", head: { ref: "old" } }] });
  r = await lib.githubBranchDelete(env(), { branch: "old" });
  ok(r.ok === true && /closed or merged/.test(r.proof) && r.archive_ref === "refs/archive/old-d1d2d3d", "a branch whose pull request is closed is archived as refs/archive/<branch>-<sha7> and deleted", r);
  ok(calls.findIndex((c) => c.startsWith("POST") && c.includes("refs/archive/old-d1d2d3d")) < calls.indexOf("LOG") && calls.indexOf("LOG") < calls.findIndex((c) => c.startsWith("DELETE")), "order: archive, log row, delete", calls);
  row = db.prepare("SELECT * FROM branch_hygiene_log").get();
  ok(row.archive_ref === "refs/archive/old-d1d2d3d", "the log row names the archive ref", row);

  // ahead with no pull request: confirm_required, nothing done; confirm: true goes through
  reset();
  lib = build({ branches: { wip: { sha: "e".repeat(40), ahead: 4 } }, prs: [] });
  r = await lib.githubBranchDelete(env(), { branch: "wip" });
  ok(r.ok === false && r.confirm_required === true && r.ahead_by === 4 && !calls.some((c) => c.startsWith("DELETE") || c === "LOG" || c.startsWith("POST")), "an unmerged branch with no closed pull request needs confirm and changes nothing", { r, calls });
  r = await lib.githubBranchDelete(env(), { branch: "wip", confirm: true });
  ok(r.ok === true && r.proof === "confirm: true" && /^refs\/archive\/wip-eeeeeee$/.test(r.archive_ref), "confirm: true deletes it after saving the tip", r);

  // a failed archive and a failed log row stop the delete
  reset();
  lib = build({ branches: { wip: { sha: "f".repeat(40), ahead: 4 } }, prs: [], archiveStatus: 500 });
  r = await lib.githubBranchDelete(env(), { branch: "wip", confirm: true });
  ok(r.ok === false && /tip could not be saved/.test(r.error) && !calls.some((c) => c.startsWith("DELETE")), "no restore point, no delete", { r, calls });
  reset();
  lib = build({ branches: { wip: { sha: "9".repeat(40), ahead: 0 } }, prs: [] });
  failLog = true;
  r = await lib.githubBranchDelete(env(), { branch: "wip" });
  ok(r.ok === false && /branch_hygiene_log row could not be written/.test(r.error) && !calls.some((c) => c.startsWith("DELETE")), "a failed log row stops the delete (fail closed)", { r, calls });
  failLog = false;

  // github_pr_close
  reset();
  const closedOther = [{ number: 90, merged_at: "2026-10-23T13:52:56Z", title: "code-task: [issue #100211] RESEARCH-MODEL-COST-1" }];
  lib = build({ branches: {}, prs: [{ number: 3669, state: "open", title: "code-task: [issue #100211] [retry 2] RESEARCH-MODEL-COST-1", head: { ref: "codeagent-x", sha: "1".repeat(40), repo: { full_name: "QNFO/qnfo-workers" } }, base: { ref: "main" } }], prHeads: { "codeagent-x": { ahead: 1 } }, closed: closedOther });
  r = await lib.githubPrClose(env(), { number: 3669, comment: "superseded" });
  ok(r.ok === true && r.closed === true && /superseded: pull request #90/.test(r.proof) && r.archive_ref === "refs/archive/codeagent-x-1111111", "a pull request superseded by a merged one with the same [issue #N] is closed and its tip archived", r);
  ok(calls.findIndex((c) => c === "LOG") < calls.findIndex((c) => c.startsWith("PATCH")) && calls.findIndex((c) => c.includes("/comments")) < calls.findIndex((c) => c.startsWith("PATCH")), "log row and comment come before the close", calls);
  row = db.prepare("SELECT * FROM branch_hygiene_log").get();
  ok(row.action === "ops-close-pr" && row.pr === 3669 && row.branch === "codeagent-x" && row.archive_ref === "refs/archive/codeagent-x-1111111", "the close is logged with the pull request number", row);

  reset();
  lib = build({ branches: {}, prs: [{ number: 5, state: "open", title: "plain", head: { ref: "docs-x", sha: "2".repeat(40), repo: { full_name: "QNFO/qnfo-workers" } }, base: { ref: "main" } }], prHeads: { "docs-x": { ahead: 0 } }, closed: [] });
  r = await lib.githubPrClose(env(), { number: 5 });
  ok(r.ok === true && /ahead_by 0/.test(r.proof), "a pull request with nothing to merge is closed", r);

  reset();
  lib = build({ branches: {}, prs: [{ number: 6, state: "open", title: "wip", head: { ref: "wip-x", sha: "3".repeat(40), repo: { full_name: "QNFO/qnfo-workers" } }, base: { ref: "main" } }], prHeads: { "wip-x": { ahead: 3 } }, closed: [] });
  r = await lib.githubPrClose(env(), { number: 6 });
  ok(r.ok === false && r.confirm_required === true && !calls.some((c) => c.startsWith("PATCH") || c === "LOG"), "a pull request with commits and no merged successor needs confirm", { r, calls });
  r = await lib.githubPrClose(env(), { number: 6, confirm: true });
  ok(r.ok === true && r.proof === "confirm: true", "confirm: true closes it", r);

  reset();
  lib = build({ branches: {}, prs: [{ number: 7, state: "closed", merged_at: "2026-10-01T00:00:00Z", title: "done", head: { ref: "z", sha: "4".repeat(40), repo: { full_name: "QNFO/qnfo-workers" } }, base: { ref: "main" } }] });
  r = await lib.githubPrClose(env(), { number: 7 });
  ok(r.ok === true && r.already_closed === true && r.merged === true && !calls.some((c) => c.startsWith("PATCH")), "an already closed pull request is reported, not touched", r);
  ok((await lib.githubPrClose(env(), { number: "x" })).ok === false && (await lib.githubPrClose({ QNFO_AUDIT: AUDIT }, { number: 1 })).ok === false, "a bad number and a missing token are refused");

  // fork head: no archive ref (the head is not in this repository), still logged and closed with confirm
  reset();
  lib = build({ branches: {}, prs: [{ number: 8, state: "open", title: "from a fork", head: { ref: "fork-x", sha: "5".repeat(40), repo: { full_name: "someone/qnfo-workers" } }, base: { ref: "main" } }], closed: [] });
  r = await lib.githubPrClose(env(), { number: 8, confirm: true });
  ok(r.ok === true && r.archive_ref === null && !calls.some((c) => c.startsWith("POST") && c.includes("refs/archive")), "a fork head is not archived in this repository", { r, calls });

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
