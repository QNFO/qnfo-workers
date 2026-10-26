// GIT-OP-REPO-SHAPE-1 (qnfo-ops 2.57.6, 2026-10-26, charter pillar autonomy; agent_issues 1000405) offline suite. No network: fetch is a stub.
// git_op answered "repo (owner/name) required" for {owner:"QNFO", repo:"qnfo-workers", op:"show", ref:"main:qnfo-code-orchestrator/worker.js"} (cloud_ops_events evt-fa052b18cdfbe6): the caller split the
// repository into owner and name and asked for the file at a revision, the way `git show main:path` does. Now git_op and github_cherry_pick accept {owner, repo}, git_op resolves an empty repo to
// QNFO/qnfo-workers and a bare name to QNFO/<name> (as github_repo_read has since 2.57.3), and git_op show <rev>:<path> reads that file at that revision. A value that is still not owner/name
// makes no request. A write (github_cherry_pick) never defaults a repository.
// Run: node qnfo-ops/git-op-repo-shape.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const parts = [
  grab("function decodeBase64(b64) {", "\n__name(decodeBase64"),
  grab("async function githubApi(env, method, path, body) {", "\n__name(githubApi"),
  grab("function encPath(s) {", "\n__name(encPath"),
  grab("var FPA_REPO_RE =", "\n"),
  grab("function gitRepoArg(args, allowDefault) {", "async function githubCherryPick(env, args) {"),
  grab("async function githubCherryPick(env, args) {", "\n__name(githubCherryPick"),
  grab("async function gitOp(env, args) {", "\n__name(gitOp"),
];
ok(parts.every((p) => p.length > 30), "decodeBase64, githubApi, encPath, FPA_REPO_RE, gitRepoArg, githubCherryPick and gitOp are found in worker.js", parts.map((p) => p.length));
let calls = [];
let responder = () => new Response("{}", { status: 404 });
globalThis.fetch = async (url, init) => { calls.push(String(url)); return responder(String(url), init || {}); };
const { gitOp, githubCherryPick, gitRepoArg } = new Function("__name22222", parts.join("\n") + "\nreturn { gitOp, githubCherryPick, gitRepoArg };")((f) => f);
const env = { GITHUB_TOKEN: "t" };
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
const file = (text, extra) => J({ type: "file", encoding: "base64", content: Buffer.from(text).toString("base64"), size: text.length, sha: "abc123", ...(extra || {}) });
const commit = { sha: "0123456789abcdef", commit: { message: "m\nbody", author: { name: "n", date: "d" } }, files: [] };

{ // the call that filed the issue
  calls = []; responder = () => file("export default {};\n");
  const r = await gitOp(env, { owner: "QNFO", repo: "qnfo-workers", op: "show", ref: "main:qnfo-code-orchestrator/worker.js" });
  ok(r.ok === true && r.type === "file" && r.repo === "QNFO/qnfo-workers" && r.ref === "main" && r.path === "qnfo-code-orchestrator/worker.js", "the failing call now reads the file at main", r);
  ok(r.content === "export default {};\n" && r.truncated === false && r.sha === "abc123", "the file body is decoded and not truncated", r);
  ok(calls.length === 1 && /\/repos\/QNFO\/qnfo-workers\/contents\/qnfo-code-orchestrator\/worker\.js\?ref=main$/.test(calls[0]), "one request goes to the contents API at ref=main", calls);
}
{ // maxChars
  calls = []; responder = () => file("x".repeat(50));
  const r = await gitOp(env, { repo: "QNFO/qnfo-workers", op: "show", ref: "main:a.txt", maxChars: 10 });
  ok(r.ok === true && r.content.length === 10 && r.truncated === true, "maxChars cuts the body and says so", r);
}
{ // a directory
  calls = []; responder = () => J([{ name: "worker.js" }, { name: "wrangler.toml" }]);
  const r = await gitOp(env, { repo: "QNFO/qnfo-workers", op: "show", ref: "main:qnfo-ops" });
  ok(r.ok === true && r.type === "dir" && r.entries.join() === "worker.js,wrangler.toml", "a directory path lists its entries", r);
}
{ // misses and limits
  calls = []; responder = () => J({ message: "Not Found" }, 404);
  const r = await gitOp(env, { repo: "QNFO/qnfo-workers", op: "show", ref: "main:nope.js" });
  ok(r.ok === false && /^GitHub 404: Not Found/.test(r.error), "a missing file keeps GitHub's reason", r);
  const r2 = await gitOp(env, { repo: "QNFO/qnfo-workers", op: "show", ref: "main:" });
  ok(r2.ok === false && /needs a path/.test(r2.error) && calls.length === 1, "show main: with no path is refused without a request", { r2, calls });
  calls = []; responder = () => file("", { encoding: "none", content: "", size: 2e6 });
  const r3 = await gitOp(env, { repo: "QNFO/qnfo-workers", op: "show", ref: "main:big.js" });
  ok(r3.ok === false && /over 1 MB/.test(r3.error), "a file over 1 MB is reported, not returned empty", r3);
}
{ // show of a commit is unchanged
  calls = []; responder = () => J(commit);
  const r = await gitOp(env, { repo: "QNFO/qnfo-workers", op: "show", ref: "main" });
  ok(r.ok === true && r.full_sha === commit.sha && calls.length === 1 && /\/commits\/main$/.test(calls[0]), "show main still shows the commit", { r, calls });
  calls = [];
  const r2 = await gitOp(env, { repo: "QNFO/qnfo-workers", op: "show", sha: "abc123" });
  ok(r2.ok === true && /\/commits\/abc123$/.test(calls[0]), "show with a sha still shows that commit", { r2, calls });
  calls = [];
  const r3 = await gitOp(env, { repo: "QNFO/qnfo-workers", op: "show", sha: "abc:def" });
  ok(calls.length === 1 && /\/commits\/abc%3Adef$/.test(calls[0]), "an explicit sha is never read as rev:path", calls);
}
{ // repository shapes for a read
  calls = []; responder = () => J([]);
  const a = await gitOp(env, { owner: "QNFO", repo: "qnfo-workers", op: "log" });
  ok(a.ok === true && a.repo === "QNFO/qnfo-workers" && /\/repos\/QNFO\/qnfo-workers\/commits\?/.test(calls[0]), "owner plus a bare repo joins them", { a, calls });
  calls = [];
  const b = await gitOp(env, { op: "log" });
  ok(b.ok === true && b.repo === "QNFO/qnfo-workers", "an empty repo reads QNFO/qnfo-workers", b);
  const c = await gitOp(env, { repo: "q08-mind", op: "log" });
  ok(c.ok === true && c.repo === "QNFO/q08-mind", "a bare name reads QNFO/<name>", c);
  const d = await gitOp(env, { owner: "other", repo: "tool", op: "log" });
  ok(d.ok === true && d.repo === "other/tool", "an owner given with a bare name wins over the QNFO default", d);
  const e = await gitOp(env, { owner: "ignored", repo: "QNFO/qnfo-workers", op: "log" });
  ok(e.ok === true && e.repo === "QNFO/qnfo-workers", "a full repo name is used as given", e);
  calls = [];
  for (const bad of ["a b/c", "a/b/c", "/x", "x/", "a/b c"]) {
    const r = await gitOp(env, { repo: bad, op: "log" });
    ok(r.ok === false && r.error === "repo (owner/name) required", "a malformed repo is refused: " + bad, r);
  }
  ok(calls.length === 0, "a malformed repo makes no request", calls);
}
{ // gitRepoArg directly
  ok(gitRepoArg({}, false) === "" && gitRepoArg({}, true) === "QNFO/qnfo-workers", "an empty repo is refused for a write and defaulted for a read");
  ok(gitRepoArg({ repo: "x" }, false) === "" && gitRepoArg({ repo: "x", owner: "o" }, false) === "o/x", "a bare name needs an owner for a write");
  ok(gitRepoArg({ repo: "QNFO/qnfo-workers" }, false) === "QNFO/qnfo-workers", "a full name passes for a write");
  ok(gitRepoArg(null, true) === "QNFO/qnfo-workers" && gitRepoArg(undefined, false) === "", "no arguments at all do not throw");
}
{ // a write never defaults the repository
  calls = []; responder = () => J({ message: "Not Found" }, 404);
  const a = await githubCherryPick(env, { owner: "QNFO", repo: "qnfo-workers", commits: ["abc"] });
  ok(a.ok === false && /base branch not found: main/.test(a.error) && /\/repos\/QNFO\/qnfo-workers\/git\/ref\/heads\/main$/.test(calls[0]), "cherry-pick accepts owner plus repo", { a, calls });
  calls = [];
  const b = await githubCherryPick(env, { commits: ["abc"] });
  ok(b.ok === false && b.error === "repo (owner/name) required" && calls.length === 0, "cherry-pick with no repo is refused without a request", { b, calls });
  const c = await githubCherryPick(env, { repo: "qnfo-workers", commits: ["abc"] });
  ok(c.ok === false && c.error === "repo (owner/name) required" && calls.length === 0, "cherry-pick with a bare name and no owner is refused", { c, calls });
}
{ // release bookkeeping
  const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(v && (+v[1] > 2 || (+v[1] === 2 && (+v[2] > 57 || (+v[2] === 57 && +v[3] >= 6)))), "VERSION is at least 2.57.6", v && v[0]);
  ok(/GIT-OP-REPO-SHAPE-1/.test(src.slice(0, src.indexOf("\n", src.indexOf("var VERSION")))), "the VERSION line carries the GIT-OP-REPO-SHAPE-1 note");
  ok(src === mirror, "deployed-current.worker.js is identical to worker.js");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
