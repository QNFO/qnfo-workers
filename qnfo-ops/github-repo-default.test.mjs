// GITHUB-READ-REPO-DEFAULT-1 (qnfo-ops 2.57.3, 2026-10-26, charter pillar autonomy; agent_issues 1000320 and 1000374) offline suite. No network: fetch is a stub.
// github_repo_read answered "repo must be owner/name" for a call with an empty repo or a bare name ("qnfo-workers"): 4 loop-breaker recurrences in 24 h and 9 of 47 calls in 6 h. Every fleet
// caller works inside QNFO/qnfo-workers and the sibling githubIssuesList already defaults an empty repo there. Now an empty repo resolves to QNFO/qnfo-workers and a bare name to QNFO/<name>;
// a full name is used as given; a value that still fails the repository pattern keeps the error and makes no request.
// Run: node qnfo-ops/github-repo-default.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const parts = [
  grab("async function githubApi(env, method, path, body) {", "\n__name(githubApi"),
  grab("function encPath(s) {", "\n__name(encPath"),
  grab("var FPA_REPO_RE =", "\n"),
  grab("async function githubRepoRead(env, args) {", "\n__name(githubRepoRead"),
];
ok(parts.every((p) => p.length > 30), "githubApi, encPath, FPA_REPO_RE and githubRepoRead are found in worker.js", parts.map((p) => p.length));
const decodeBase64 = (b) => Buffer.from(b, "base64").toString("utf8");
let calls = [];
let responder = () => new Response("{}", { status: 404 });
globalThis.fetch = async (url, init) => { calls.push(String(url)); return responder(String(url), init || {}); };
const { githubRepoRead } = new Function("decodeBase64", parts.join("\n") + "\nreturn { githubRepoRead };")(decodeBase64);
const env = { GITHUB_TOKEN: "t" };
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
const file = (text) => J({ type: "file", encoding: "base64", content: Buffer.from(text).toString("base64"), size: text.length, sha: "abc" });

{ // empty repo
  calls = []; responder = () => file("hello");
  const r = await githubRepoRead(env, { path: "README.md" });
  ok(r.ok === true && r.repo === "QNFO/qnfo-workers" && r.content === "hello", "an empty repo reads QNFO/qnfo-workers", r);
  ok(calls.length === 1 && /\/repos\/QNFO\/qnfo-workers\/contents\/README\.md/.test(calls[0]), "the request goes to the default repository", calls);
  const r2 = await githubRepoRead(env, { repo: "   ", path: "README.md" });
  ok(r2.ok === true && r2.repo === "QNFO/qnfo-workers", "a blank repo is the same as an empty one", r2);
  const r3 = await githubRepoRead(env, {});
  ok(r3.ok === true && r3.repo === "QNFO/qnfo-workers", "no arguments at all read the repository root of the default repo", r3);
}
{ // bare name
  calls = []; responder = () => file("x");
  const r = await githubRepoRead(env, { repo: "qnfo-workers", path: "CLAUDE.md" });
  ok(r.ok === true && r.repo === "QNFO/qnfo-workers" && /\/repos\/QNFO\/qnfo-workers\/contents\/CLAUDE\.md/.test(calls[0]), "a bare name resolves under QNFO", { r, calls });
  const r2 = await githubRepoRead(env, { repo: "qnfo-research", path: "README.md" });
  ok(r2.ok === true && r2.repo === "QNFO/qnfo-research", "another bare name resolves under QNFO too", r2);
}
{ // full name and another owner
  calls = []; responder = () => file("x");
  const r = await githubRepoRead(env, { repo: "QNFO/qnfo-ensemble-research", path: "a.md" });
  ok(r.ok === true && r.repo === "QNFO/qnfo-ensemble-research" && /\/repos\/QNFO\/qnfo-ensemble-research\//.test(calls[0]), "a full name is used as given", r);
  calls = []; const r2 = await githubRepoRead(env, { repo: "someone/else", path: "a.md" });
  ok(r2.ok === true && r2.repo === "someone/else" && /\/repos\/someone\/else\//.test(calls[0]), "another owner is not rewritten", r2);
}
{ // bad values keep the error and make no request
  for (const bad of ["a b", "QNFO/qnfo workers", "/qnfo-workers", "QNFO/", "QNFO/a/b", "QNFO//x", "bad$name", "../etc"]) {
    calls = []; const r = await githubRepoRead(env, { repo: bad, path: "a.md" });
    ok(r.ok === false && r.error === "repo must be owner/name" && calls.length === 0, "a bad repo value is refused without a request: " + JSON.stringify(bad), { r, calls });
  }
}
{ // a read that misses is still a read answer, not the repo error
  calls = []; responder = () => J({ message: "Not Found" }, 404);
  const r = await githubRepoRead(env, { path: "docs/nope.md" });
  ok(r.ok === false && /^path not found: docs\/nope\.md/.test(r.error), "a missing path is a path answer, not a repo error", r);
}
ok(/GITHUB-READ-REPO-DEFAULT-1/.test(src), "the marker comment for the issue's code-read probe is in worker.js");
ok(mirror === src, "the deployed-current mirror is identical to worker.js");
const ver = (/var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 2 || (ver[0] === 2 && (ver[1] > 57 || (ver[1] === 57 && ver[2] >= 3)))), "VERSION is at least 2.57.3", ver);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
