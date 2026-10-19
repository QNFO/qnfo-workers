// GITHUB-BRANCH-HINT-1 (agent_issues 100094), qnfo-ops 2.50.2 offline suite. No network: fetch is a stub.
// Proves: a github_file_write to a branch that does not exist answers with the missing step (github_create_branch) and
// branch_missing, makes one PUT and creates no branch; a 404 for any other cause keeps GitHub's own message; a successful write is
// unchanged; the tool description states the branch must already exist.
// Run: node qnfo-ops/github-branch-hint.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const parts = [
  grab("async function githubApi(env, method, path, body) {", "\n__name(githubApi"),
  grab("function encPath(s) {", "\n__name(encPath"),
  grab("function b64encode(str) {", "\n__name(b64encode"),
  grab("async function githubFileWrite(env, args) {", "\n__name(githubFileWrite"),
];
ok(parts.every((p) => p.length > 40), "githubApi, encPath, b64encode and githubFileWrite are found in worker.js", parts.map((p) => p.length));
let calls = [];
let responder = () => new Response("{}", { status: 404 });
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), method: (init && init.method) || "GET" }); return responder(String(url), init || {}); };
const { githubFileWrite } = new Function(parts.join("\n") + "\nreturn { githubFileWrite };")();
const env = { GITHUB_TOKEN: "t" };
const J = (o, s) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

{ // the case from issue 100094: chatbox/cron-tick-5m was never created
  calls = []; responder = () => J({ message: "Branch chatbox/cron-tick-5m not found", documentation_url: "https://docs.github.com" }, 404);
  const r = await githubFileWrite(env, { repo: "QNFO/qnfo-workers", path: "scripts/cron-tick-5m-patch.py", content: "x", branch: "chatbox/cron-tick-5m" });
  ok(r.ok === false && r.branch_missing === true && /github_create_branch/.test(r.error) && /chatbox\/cron-tick-5m/.test(r.error) && /omit branch/.test(r.error), "a missing branch names the missing step", r);
  ok(calls.length === 1 && calls[0].method === "PUT" && !calls.some((c) => /git\/refs/.test(c.url)), "one PUT and no branch is created", calls);
}
{ // a 404 for another cause keeps GitHub's message
  calls = []; responder = () => J({ message: "Not Found" }, 404);
  const r = await githubFileWrite(env, { repo: "QNFO/nope", path: "a.txt", content: "x", branch: "b" });
  ok(r.ok === false && r.error === "GitHub 404: Not Found" && r.branch_missing === undefined, "a bad repo or path is not blamed on the branch", r);
}
{ // no branch asked for: the message is passed through as before
  calls = []; responder = () => J({ message: "Branch main not found" }, 404);
  const r = await githubFileWrite(env, { repo: "QNFO/qnfo-workers", path: "a.txt", content: "x" });
  ok(r.ok === false && /^GitHub 404: Branch main not found/.test(r.error) && r.branch_missing === undefined, "without a branch argument the error is unchanged", r);
}
{ // a successful write is unchanged
  calls = []; responder = () => J({ commit: { sha: "abc" }, content: { html_url: "https://github.com/x" } }, 201);
  const r = await githubFileWrite(env, { repo: "QNFO/qnfo-workers", path: "a.txt", content: "x", branch: "existing" });
  ok(r.ok === true && r.commit === "abc" && r.attempts === 1, "a write to an existing branch still succeeds", r);
}
ok(/branch to commit to \(optional, default repo default branch\)\. It must already exist: create it first with github_create_branch/.test(src), "the tool description states the branch must already exist");
{ const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src); ok(m && Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]) >= 2050002, "VERSION is at least 2.50.2", m && m[0]); }
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
