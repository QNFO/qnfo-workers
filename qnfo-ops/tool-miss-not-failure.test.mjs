// TOOL-MISS-NOT-FAILURE-1 offline suite (qnfo-ops, 2026-10-26, charter pillar autonomy; agent_issues 1000393, 1000394, 100437, 1000443). No network: fetch is a stub.
// An existence lookup that misses is an answer, not a tool malfunction. The tool still returns ok:false with the same error text and hint, but carries not_found:true, and logToolEvent records a
// not_found result as status ok (meta keeps resultOk false and the error text, so nothing is hidden and the calibration join on meta.resultOk is unchanged); every other failure stays status error, a
// refusal stays rejected. Covered here: github_repo_read on a missing path (1000393, 1000394), github_issue_get on a missing number (100437: GitHub 404 for the D1 issue id 100350), web_search called with
// query instead of q (1000443: "q required" for {"query": ...}), and the self-fetch refusal of web_fetch (1000115) recorded as rejected, a correct refusal, not an error.
// Run: node qnfo-ops/tool-miss-not-failure.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const parts = [
  grab("async function githubApi(env, method, path, body) {", "\n__name(githubApi"),
  grab("function encPath(s) {", "\n__name(encPath"),
  grab("var FPA_REPO_RE =", "\n"),
  grab("var FPA_GH_ERR = function(res) {", "};\n") + "};\n",
  grab("function fpaCap(s, n) {", "\nfunction fpaIssueRow"),
  grab("function fpaIssueRow(i) {", "\nasync function githubIssuesList"),
  grab("async function githubRepoRead(env, args) {", "\n__name(githubRepoRead"),
  grab("async function githubIssueGet(env, args) {", "\nasync function githubIssueComment"),
  grab("async function webSearchTool(env, args) {", "\n__name(webSearchTool"),
];
ok(parts.every((p) => p.length > 30), "githubApi, encPath, FPA_REPO_RE, FPA_GH_ERR, fpaCap, fpaIssueRow, githubRepoRead, githubIssueGet and webSearchTool are found in worker.js", parts.map((p) => p.length));
const logSrc = grab("async function logToolEvent(env, name, args, res, ms) {", "\n__name(logToolEvent");
ok(logSrc.length > 100, "logToolEvent is found in worker.js");

const decodeBase64 = (b) => Buffer.from(b, "base64").toString("utf8");
const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();
let calls = [];
let responder = () => new Response("{}", { status: 404 });
globalThis.fetch = async (url, init) => { calls.push(String(url)); return responder(String(url), init || {}); };
const tools = new Function("decodeBase64", "stripHtml", parts.join("\n") + "\nreturn { githubRepoRead, githubIssueGet, webSearchTool };")(decodeBase64, stripHtml);
const env = { GITHUB_TOKEN: "t" };
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });

// ---- github_repo_read (1000393)
responder = () => J({ message: "Not Found" }, 404);
let r = await tools.githubRepoRead(env, { repo: "QNFO/qnfo-workers", path: "mind/worker.js" });
ok(r.ok === false && r.not_found === true && /^path not found: mind\/worker\.js/.test(r.error), "a path that does not exist answers ok:false with not_found:true and the same error text", r);
ok(/parent dir 'mind' also not found/.test(r.error), "the hint that names the parent is kept", r.error);
responder = (u) => /contents\/mind\?/.test(u) || /contents\/mind$/.test(u) ? J([{ name: "worker.js.bak" }, { name: "wrangler.toml" }], 200) : J({ message: "Not Found" }, 404);
r = await tools.githubRepoRead(env, { repo: "QNFO/qnfo-workers", path: "mind/worker.js" });
ok(r.ok === false && r.not_found === true && /dir 'mind' contains: worker\.js\.bak, wrangler\.toml/.test(r.error) && /nearest match: worker\.js\.bak/.test(r.error), "the directory listing and the nearest match stay in the answer", r.error);
responder = () => J({ message: "Server Error" }, 500);
r = await tools.githubRepoRead(env, { repo: "QNFO/qnfo-workers", path: "a.md" });
ok(r.ok === false && !r.not_found && /GitHub 500/.test(r.error), "a GitHub 500 is a failure, not a miss", r);
responder = () => J({ message: "Bad credentials" }, 401);
r = await tools.githubRepoRead(env, { repo: "QNFO/qnfo-workers", path: "a.md" });
ok(r.ok === false && !r.not_found, "a 401 is a failure, not a miss", r);

// ---- github_issue_get (100437)
responder = () => J({ message: "Not Found" }, 404);
r = await tools.githubIssueGet(env, { number: 100350 });
ok(r.ok === false && r.not_found === true && r.error === "GitHub 404: Not Found", "a GitHub issue number that does not exist answers not_found:true with the same error text", r);
responder = () => J({ message: "Forbidden" }, 403);
r = await tools.githubIssueGet(env, { number: 7 });
ok(r.ok === false && !r.not_found && /GitHub 403/.test(r.error), "a 403 is a failure, not a miss", r);
responder = () => J({ number: 7, title: "t", state: "open", body: "b", comments: 0, user: { login: "u" }, html_url: "x" }, 200);
r = await tools.githubIssueGet(env, { number: 7, comments: false });
ok(r.ok === true && r.number === 7 && !r.not_found, "a found issue is unchanged", r);
r = await tools.githubIssueGet(env, { number: 0 });
ok(r.ok === false && !r.not_found && /number required/.test(r.error), "a missing number stays an argument error", r);

// ---- web_search (1000443)
responder = () => new Response("<html></html>", { status: 200 });
calls = [];
r = await tools.webSearchTool(env, { query: "roster_capabilities_single_executor qnfo-workers" });
ok(r.ok === true && calls.length === 1 && calls[0].endsWith(encodeURIComponent("roster_capabilities_single_executor qnfo-workers")), "web_search accepts query as an alias of q", { r, calls });
calls = [];
r = await tools.webSearchTool(env, { q: "x" });
ok(r.ok === true && calls[0].endsWith("?q=x"), "q still works", { r, calls });
r = await tools.webSearchTool(env, { q: "first", query: "second" });
ok(calls[calls.length - 1].endsWith("?q=first"), "q wins when both are given");
calls = [];
r = await tools.webSearchTool(env, {});
ok(r.ok === false && r.error === "q required" && calls.length === 0, "no q and no query keeps the error and makes no request", r);
r = await tools.webSearchTool(env, { query: "   " });
ok(r.ok === false && r.error === "q required", "a blank query is still an error", r);

// ---- logToolEvent (1000394)
const rows = [];
const envLog = { QNFO_AUDIT: { prepare() { let b = []; const s = { bind(...x) { b = x; return s; }, async run() { rows.push(b); return {}; } }; return s; } } };
const logToolEvent = new Function("randId", "iso", "redactedSnippet", "logAuditTrail", logSrc + "\nreturn logToolEvent;")(() => "evt-x", () => "2026-10-26T00:00:00Z", (o) => JSON.stringify(o), async () => {});
const statusOf = async (res) => { rows.length = 0; await logToolEvent(envLog, "github_repo_read", { path: "p" }, res, 12); return { status: rows[0][6], meta: JSON.parse(rows[0][4]), kind: rows[0][2], text: rows[0][3] }; };
let s = await statusOf({ ok: false, not_found: true, error: "path not found: mind/worker.js - dir 'mind' contains: x" });
ok(s.status === "ok" && s.meta.resultOk === false && /^path not found: mind\/worker\.js/.test(s.meta.error), "a not_found result is logged status ok, with resultOk false and the error text kept", s);
s = await statusOf({ ok: true, content: "x" });
ok(s.status === "ok" && s.meta.resultOk === true && s.meta.error === undefined, "a normal success is unchanged", s);
s = await statusOf({ ok: false, error: "GitHub 500: x" });
ok(s.status === "error" && s.meta.resultOk === false && /GitHub 500/.test(s.meta.error), "any other failure is still status error", s);
s = await statusOf({ ok: false, rejected: true, error: "read-only SELECT/WITH only" });
ok(s.status === "rejected", "a refusal is still status rejected", s);
s = await statusOf({ ok: false, not_found: true, rejected: true, error: "x" });
ok(s.status === "ok", "not_found wins over rejected (a miss is an answer)", s);
s = await statusOf(undefined);
ok(s.status === "error", "no result at all is an error", s);
ok(s.kind === "ops_ai_tool" && s.text === "github_repo_read", "the event keeps its kind and tool name", s);

// ---- web_fetch self-fetch refusal (1000115): a correct refusal is rejected, not an error
const sf = grab("    return {\n      ok: false,\n      rejected: true,\n      error: \"self-fetch blocked: \"", "hint:");
ok(sf.length > 0 && /self_fetch: true/.test(sf), "the self-fetch refusal of web_fetch carries rejected:true next to self_fetch:true");
ok(!/ok: false,\n      error: "self-fetch blocked/.test(src), "no self-fetch refusal is left without it");
// the flag is produced by the two lookup tools only (an existence lookup) and read only by logToolEvent
const nf = [...src.matchAll(/\{ ok: false, not_found: true/g)].length;
ok(nf === 2, "exactly two results carry the not_found flag: the repo path miss and the issue miss", nf);
ok([...src.matchAll(/\.not_found\b/g)].length === 1, "and only logToolEvent reads it");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
