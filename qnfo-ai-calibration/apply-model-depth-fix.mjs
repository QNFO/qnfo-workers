#!/usr/bin/env node
// apply-model-depth-fix.mjs — idempotent patcher for qnfo-ai-calibration/worker.js
//
// Implements the P0/P1 items specified in
//   qnfo-ai-calibration/patches/2026-09-13-model-depth-and-code-routing.md
//
// SAFETY — READ BEFORE RUNNING
//   This script edits a file on disk. It does NOT deploy, and it is inert in the repo
//   (qnfo-fleet-deploy only consumes <worker>/worker.js and <worker>/deployed-current.worker.js,
//   so a .mjs at this path is never scanned).
//   But COMMITTING qnfo-ai-calibration/worker.js TO main IS A PRODUCTION DEPLOY:
//   qnfo-fleet-deploy reads
//     raw.githubusercontent.com/QNFO/qnfo-workers/main/<worker>/worker.js
//   hourly and PUTs it. Do the edit on a branch, review, then merge.
//
// DESIGN
//   Every edit is an exact string replacement. Each anchor must occur EXACTLY ONCE, or the
//   script aborts without writing. Each edit is idempotent: if the replacement is already
//   present it is reported as "already applied" and skipped. No regex is used on the target
//   file except a fixed marker test, so a partial match cannot corrupt the bundle.
//
// USAGE
//   node apply-model-depth-fix.mjs                 # dry run: report only
//   node apply-model-depth-fix.mjs --write         # apply in place
//   node apply-model-depth-fix.mjs --file <path>   # target a different worker.js
//
// NOT EXECUTED BY qnfo-ops: this endpoint has no filesystem and no node runtime.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const fi = args.indexOf("--file");
const FILE = fi >= 0 ? args[fi + 1] : join(HERE, "worker.js");

// ---- replacement bodies -------------------------------------------------------

// P0-2 / F6: internalId must never yield a qualified "@cf/..." id.
const NEW_INTERNAL_ID = [
  "function internalId(m) {",
  "  if (!m) return null;",
  "  if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m];",
  '  if (m.indexOf("@cf/") === 0) {',
  "    var tail = m.slice(4);",
  "    for (var k in TIER0_WA) {",
  "      if (TIER0_WA[k] === m) return k;",
  "      if (TIER0_WA[k] && TIER0_WA[k].slice(4) === tail) return k;",
  "    }",
  '    return m.split("/").pop(); // canonical short form - never persist "@cf/..."',
  "  }",
  "  return m;",
  "}",
].join("\n");

// P1-4: deterministic code-correctness probe. Runs model-authored code in a SEPARATE
// sandbox Worker via the CODE_EVAL service binding, because Cloudflare Workers forbid
// eval() and new Function(). No in-process fallback: a fallback would silently pass.
const NEW_PROBE = [
  "// CODE-CORRECT-1: deterministic code-correctness probe. This is the enforcement instrument",
  "// for the no-shallow-code-models mandate. It must never silently pass: if the CODE_EVAL",
  "// sandbox is absent it reports fail, so the gap stays visible instead of being hidden.",
  "async function probeCodeCorrectness(env, model) {",
  "  var t0 = Date.now();",
  '  var task = "Return ONLY JavaScript, no prose, no markdown fences: a function lastN(a,n) returning the last n elements of array a, with n clamped to a.length. Edge case: n greater than a.length must not throw.";',
  "  try {",
  '    var r = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },',
  "      { model: model, messages: [{ role: \"user\", content: task }], max_tokens: 512, temperature: 0, stream: false }, 120000, \"QNFO_AI\");",
  "    var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;",
  "    var TICK = String.fromCharCode(96); // avoid embedding a literal fence in this source",
  '    var code = String(content || "").split(TICK).join("").trim();',
  '    if (!code) return { status: "fail", latency_ms: Date.now() - t0, detail: "empty completion" };',
  "    if (!env.CODE_EVAL) return { status: \"fail\", latency_ms: Date.now() - t0, detail: \"CODE_EVAL sandbox binding missing - probe cannot assert\" };",
  '    var ev = await jfetch(env, "https://code-eval.internal/run", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },',
  "      { code: code, tests: [",
  "        { call: [1,2,3,4,5], arg: 2, expect: [4,5] },",
  "        { call: [1,2],       arg: 9, expect: [1,2] },",
  "        { call: [],          arg: 3, expect: [] }",
  "      ] }, 30000, \"CODE_EVAL\");",
  '    var pass = ev.status === 200 && ev.data && ev.data.pass === true;',
  '    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "ok" : ("eval=" + JSON.stringify(ev.data || {}).slice(0, 100)) };',
  "  } catch (e) {",
  '    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };',
  "  }",
  "}",
  "",
].join("\n");

// P1-4 wiring: persist under a distinct ":code" key so it cannot fight the completion row.
const NEW_WIRING = [
  "  // 4b. code-correctness probes (pool 2) - enforcement for the model-depth mandate",
  "  await runPool(DEPTH_MODELS, 2, async function (m) {",
  "    var res = await probeCodeCorrectness(env, m);",
  '    results.push(Object.assign({ probe: "code-correctness", target: m }, res));',
  '    await upsertHealth(env, m + ":code", res.status === "pass" ? "ok" : "degraded", res.latency_ms, res.status === "pass" ? 0 : 1);',
  "    return res;",
  "  });",
  "",
  "  // 5. tools + stream + routing",
].join("\n");

// ---- edit table --------------------------------------------------------------

const EDITS = [
  {
    id: "F6/P0-2 internalId hardening",
    find:
      'function internalId(m) { if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m]; if (m && m.indexOf("@cf/") === 0) { for (var k in TIER0_WA) { if (TIER0_WA[k] && TIER0_WA[k].indexOf(m.slice(5)) >= 0) return k; } } return m; }',
    replace: NEW_INTERNAL_ID,
    marker: 'return m.split("/").pop(); // canonical short form',
  },
  {
    id: "F7 gw-fail dedup guard -> issue_ledger (matches its writer)",
    find:
      '      var dispo = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title LIKE ?1 AND status IN (\'wontfix\',\'closed\',\'resolved\') LIMIT 1").bind("%" + b.model + "%").first();',
    replace:
      '      var dispo = await env.QNFO_AUDIT.prepare("SELECT fingerprint FROM issue_ledger WHERE title LIKE ?1 AND status IN (\'wontfix\',\'closed\',\'resolved\') LIMIT 1").bind("%" + b.model + "%").first();',
    marker: "SELECT fingerprint FROM issue_ledger WHERE title LIKE",
  },
  {
    id: "F8 gw-fail auto-close pass -> issue_ledger",
    find:
      '    var openTitles = await env.QNFO_AUDIT.prepare("SELECT id, title FROM agent_issues WHERE title LIKE \'[gw-fail]%\' AND status = \'open\'").all();',
    replace:
      '    var openTitles = await env.QNFO_AUDIT.prepare("SELECT fingerprint, title FROM issue_ledger WHERE title LIKE \'[gw-fail]%\' AND status = \'open\'").all();',
    marker: "SELECT fingerprint, title FROM issue_ledger WHERE title LIKE",
  },
  {
    id: "P0-3 depth-aware latency config",
    find:
      '  var latencyMax = parseInt(await cfgGet(env, "latency_max_ms", "8000"), 10) || 8000;',
    replace: [
      '  var latencyMax = parseInt(await cfgGet(env, "latency_max_ms", "8000"), 10) || 8000;',
      '  var latencyMaxDeep = parseInt(await cfgGet(env, "latency_max_ms_deep", "120000"), 10) || 120000;',
      '  var DEPTH_MODELS = (await cfgGet(env, "depth_models", "kimi-k2.7-code,deepseek-v4-pro,deepseek-v4-pro-wa,glm-5.3")).split(",").map(function (s) { return s.trim(); }).filter(Boolean);',
    ].join("\n"),
    marker: 'cfgGet(env, "latency_max_ms_deep"',
  },
  {
    id: "P0-3 stop scoring depth as failure",
    find:
      '        if (res.latency_ms > latencyMax) results.push({ probe: "latency", target: m, status: "fail", latency_ms: res.latency_ms, detail: "slow minimal probe (> " + latencyMax + "ms)" });',
    replace:
      '        var latCap = DEPTH_MODELS.indexOf(m) >= 0 ? latencyMaxDeep : latencyMax;\n        if (res.latency_ms > latCap) results.push({ probe: "latency", target: m, status: "fail", latency_ms: res.latency_ms, detail: "slow minimal probe (> " + latCap + "ms, depth=" + (DEPTH_MODELS.indexOf(m) >= 0) + ")" });',
    marker: "var latCap = DEPTH_MODELS.indexOf(m) >= 0",
  },
  {
    id: "P1-4 add probeCodeCorrectness",
    find: "async function calibration(env, trigger) {",
    replace: NEW_PROBE + "async function calibration(env, trigger) {",
    marker: "async function probeCodeCorrectness(env, model) {",
  },
  {
    id: "P1-4 wire code-correctness probes",
    find: "  // 5. tools + stream + routing",
    replace: NEW_WIRING,
    marker: 'probe: "code-correctness"',
  },
];

// ---- run ---------------------------------------------------------------------

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  var n = 0, i = 0;
  for (;;) {
    var j = hay.indexOf(needle, i);
    if (j < 0) break;
    n++; i = j + needle.length;
  }
  return n;
}

let src;
try {
  src = readFileSync(FILE, "utf8");
} catch (e) {
  console.error("FAIL: cannot read " + FILE + " — " + String(e && e.message || e));
  process.exit(2);
}

console.log("target : " + FILE + "  (" + src.length + " bytes)");
console.log("mode   : " + (WRITE ? "WRITE" : "dry run"));
console.log("");

let out = src;
let applied = 0, skipped = 0;
const failures = [];

for (const e of EDITS) {
  if (out.indexOf(e.marker) >= 0) {
    console.log("  SKIP    " + e.id + "  (already applied)");
    skipped++;
    continue;
  }
  const n = countOccurrences(out, e.find);
  if (n !== 1) {
    console.log("  ABORT   " + e.id + "  (anchor found " + n + " time(s), need exactly 1)");
    failures.push(e.id + ": anchor x" + n);
    continue;
  }
  out = out.replace(e.find, e.replace);
  console.log("  APPLY   " + e.id);
  applied++;
}

console.log("");
console.log("applied=" + applied + " skipped=" + skipped + " failed=" + failures.length);

if (failures.length) {
  console.log("");
  console.log("NOTHING WRITTEN. Resolve these anchors against the current worker.js first:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}

if (applied === 0) {
  console.log("File already carries every edit; no change needed.");
  process.exit(0);
}

// Post-conditions: the two invariants this patch exists to establish.
const post = [
  ['no "@cf/" persisted to health', out.indexOf('UPDATE ai_model_health SET status=\'degraded\'') >= 0 ? "guard present" : "WARN: degrade write not found"],
  ["gw-fail guard reads issue_ledger", out.indexOf("SELECT fingerprint FROM issue_ledger WHERE title LIKE") >= 0 ? "ok" : "FAIL"],
  ["code-correctness probe present", out.indexOf("async function probeCodeCorrectness") >= 0 ? "ok" : "FAIL"],
];
console.log("");
console.log("post-conditions:");
for (const [name, res] of post) console.log("  " + (res === "ok" ? "PASS" : res === "FAIL" ? "FAIL" : "INFO") + "  " + name + " — " + res);

if (!WRITE) {
  console.log("");
  console.log("dry run only. re-run with --write to modify the file.");
  process.exit(0);
}

try {
  writeFileSync(FILE, out, "utf8");
} catch (e) {
  console.error("FAIL: cannot write " + FILE + " — " + String(e && e.message || e));
  process.exit(2);
}
console.log("");
console.log("written: " + FILE + "  (" + src.length + " -> " + out.length + " bytes)");
console.log("NEXT: commit on a BRANCH and review. Committing this file to main deploys it.");
