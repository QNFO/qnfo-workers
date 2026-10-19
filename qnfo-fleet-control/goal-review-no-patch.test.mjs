/**
 * goal-review-no-patch.test.mjs -- offline regression lock for GOAL-REVIEW-NO-PATCH-1 (agent_issues 100104).
 * GitHub's /pulls/<n>/files omits `patch` for a large diff, and the goal reviewer was shown "(no patch text ...)" instead of the
 * change (ct_im100064: three reviews on 2026-10-19 each answered "the diff contains no patch text"). Proves:
 *   - cmLineDiff: identical texts give "", a far-apart pair of edits gives two hunks with correct headers, and on 300 random edit
 *     scripts applying its hunks to the base text rebuilds the head text exactly; a change past maxD gives null;
 *   - cmGoalReview, for a file sent without a patch, reads the merge-base and head texts, and the reviewer prompt carries the
 *     real +/- lines (not "no patch"/"no diff" text);
 *   - a transient read holds the review (wait), a change too large to diff skips it with a note, and a file that came with its
 *     patch makes no extra read.
 * Output MUST contain "0 failed" on success.
 *
 *   node qnfo-fleet-control/goal-review-no-patch.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const g1 = src.indexOf("// ---- GOAL-REVIEW-1:BEGIN"), g2 = src.indexOf("// ---- GOAL-REVIEW-1:END ----");
const r1 = src.indexOf("async function cmReviewRun("), r2 = src.indexOf('__name(cmGoalReview, "cmGoalReview");');
if (g1 < 0 || g2 < g1 || r1 < 0 || r2 < r1) { console.error("FAIL goal-review blocks not found in worker.js"); console.log("1 failed"); process.exit(1); }

const store = new Map();
const AUDIT = {
  prepare(sql) {
    let args = [];
    const self = {
      bind(...x) { args = x; return self; },
      async first() { return /SELECT meta FROM cloud_ops_events/.test(sql) && store.has(args[0]) ? { meta: store.get(args[0]).meta } : null; },
      async run() { if (/INSERT INTO cloud_ops_events/.test(sql)) store.set(args[0], { text: args[2], meta: args[3], status: args[5] }); return { success: true }; }
    };
    return self;
  }
};
const calls = [], reads = [];
let TEXTS = {}, apiFail = false;
const sandbox = {
  __name: (f) => f, console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, Number, String, Object, Array, RegExp, isFinite, Int32Array, __export: null,
  CM_RUNNER: "test-runner",
  evApi: async (env, m, p) => apiFail ? { ok: false, status: 502 } : { ok: true, status: 200, j: { merge_base_commit: { sha: "base0" } } },
  cmRead: async (env, path, ref) => { reads.push(path + "@" + ref); const v = TEXTS[path + "@" + ref]; return v === "TRANSIENT" ? { transient: true } : v == null ? { missing: true } : { text: v }; },
  aiRunAttr: async (env, worker, purpose, model, input) => { calls.push({ model, input }); return { choices: [{ message: { content: '{"verdict":"implements","harm":false,"defects":[]}' }, finish_reason: "stop" }] }; }
};
vm.createContext(sandbox);
vm.runInContext(src.slice(g1, g2) + "\n" + src.slice(r1, r2) + "\n__export = { cmLineDiff, cmGoalReview, CM_LINE_DIFF_MAX_D };", sandbox);
const W = sandbox.__export;

let passed = 0, failed = 0;
function ok(c, label, extra) { if (c) { passed++; return; } failed++; console.error("FAIL " + label + (extra !== undefined ? "  -- " + JSON.stringify(extra).slice(0, 600) : "")); }

// apply unified hunks (as cmLineDiff writes them) to a text
function applyHunks(a, diff) {
  const A = a.split("\n"), out = [];
  let pos = 0;
  const ls = diff ? diff.split("\n") : [];
  for (let i = 0; i < ls.length; i++) {
    const m = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(ls[i]);
    if (!m) throw new Error("bad header " + ls[i]);
    const start = Number(m[1]) - 1;
    while (pos < start) out.push(A[pos++]);
    let j = i + 1;
    for (; j < ls.length && !ls[j].startsWith("@@ "); j++) {
      const c = ls[j][0], t = ls[j].slice(1);
      if (c === " ") { if (A[pos] !== t) throw new Error("context mismatch at " + pos); out.push(t); pos++; }
      else if (c === "-") { if (A[pos] !== t) throw new Error("delete mismatch at " + pos); pos++; }
      else if (c === "+") out.push(t);
    }
    i = j - 1;
  }
  while (pos < A.length) out.push(A[pos++]);
  return out.join("\n");
}

// ---- pure diff
ok(W.cmLineDiff("a\nb", "a\nb", 100) === "", "identical texts: empty diff");
const big = Array.from({ length: 2000 }, (_, i) => "line " + i);
const head = big.slice(); head[0] = "var VERSION = 2"; head.splice(1500, 1, "line 1500 changed", "added line");
let d = W.cmLineDiff(big.join("\n"), head.join("\n"), 800);
ok((d.match(/^@@ /gm) || []).length === 2, "a VERSION change at the top and an edit 1500 lines down are two hunks", d);
ok(/^@@ -1,4 \+1,4 @@\n-line 0\n\+var VERSION = 2\n line 1/.test(d) && d.includes("\n-line 1500\n+line 1500 changed\n+added line\n") && d.includes("@@ -1498,7 +1498,8 @@"), "hunk headers and lines are exact", d);
ok(applyHunks(big.join("\n"), d) === head.join("\n"), "the two hunks rebuild the head text");
let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let fuzzOk = 0;
for (let t = 0; t < 300; t++) {
  const a = Array.from({ length: 5 + rnd(60) }, () => "l" + rnd(12));
  const b = a.slice();
  for (let e = rnd(8); e >= 0; e--) { const op = rnd(3), at = rnd(b.length + 1); if (op === 0) b.splice(at, 0, "n" + rnd(9)); else if (op === 1 && b.length) b.splice(Math.min(at, b.length - 1), 1); else if (b.length) b[Math.min(at, b.length - 1)] = "m" + rnd(9); }
  const df = W.cmLineDiff(a.join("\n"), b.join("\n"), 800);
  try { if (df !== null && applyHunks(a.join("\n"), df) === b.join("\n")) fuzzOk++; } catch (e) { /* counted as a miss */ }
}
ok(fuzzOk === 300, "300 random edit scripts: every diff rebuilds the head text", fuzzOk);
ok(W.cmLineDiff(big.join("\n"), big.map((l) => l + "x").join("\n"), 50) === null, "a change past maxD returns null");
ok(applyHunks("", W.cmLineDiff("", "new\nfile", 50)) === "new\nfile", "a new file diffs against empty text");

// ---- cmGoalReview with a file the API sent without a patch
const env = { AI: {}, AUDIT };
const cfg = { goalReview: true, reviewModels: null };
const cx = { iso: "2026-10-19T12:00:00.000Z" };
const task = (id) => ({ id, model: "@cf/openai/gpt-oss-20b", goal: "add a guard", path: "personal-api/companion.js" });
TEXTS = { "personal-api/companion.js@base0": big.join("\n"), "personal-api/companion.js@h1": head.join("\n") };
let r = await W.cmGoalReview(env, cx, task("ct_np"), cfg, "h1", [{ filename: "personal-api/companion.js", status: "modified" }]);
const user = calls.length ? JSON.stringify(calls[0].input) : "";
ok(calls.length === 1 && user.includes("+line 1500 changed") && user.includes("+var VERSION = 2") && !/no patch text|no diff text/.test(user), "the reviewer sees the real +/- lines of a file sent without a patch", user.slice(0, 400));
ok(r && r.note && /implements/.test(r.note), "the review then decides as usual", r);
ok(reads.includes("personal-api/companion.js@base0") && reads.includes("personal-api/companion.js@h1"), "the merge-base and head texts were read", reads);

calls.length = 0; reads.length = 0;
TEXTS = { "personal-api/companion.js@base0": "TRANSIENT", "personal-api/companion.js@h2": head.join("\n") };
r = await W.cmGoalReview(env, cx, task("ct_tr"), cfg, "h2", [{ filename: "personal-api/companion.js", status: "modified" }]);
ok(r.wait === true && calls.length === 0 && /could not be read yet/.test(r.why), "a transient read holds the review without a model call", r);
apiFail = true;
r = await W.cmGoalReview(env, cx, task("ct_tr2"), cfg, "h2", [{ filename: "personal-api/companion.js", status: "modified" }]);
ok(r.wait === true && calls.length === 0, "an unreadable merge base holds the review too", r);
apiFail = false;

TEXTS = { "personal-api/companion.js@base0": big.join("\n"), "personal-api/companion.js@h3": big.map((l) => l + "x").join("\n") };
r = await W.cmGoalReview(env, cx, task("ct_big"), cfg, "h3", [{ filename: "personal-api/companion.js", status: "modified" }]);
ok(r.note && /skipped/.test(r.note) && /GOAL-REVIEW-NO-PATCH-1/.test(r.note) && calls.length === 0, "a change too large to diff skips the review with a note", r);

calls.length = 0; reads.length = 0;
r = await W.cmGoalReview(env, cx, task("ct_has"), cfg, "h4", [{ filename: "personal-api/companion.js", status: "modified", patch: "@@ -1,1 +1,2 @@\n a\n+b" }]);
ok(calls.length === 1 && !reads.some((x) => x.endsWith("@base0")), "a file that came with its patch makes no merge-base read", reads);

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
