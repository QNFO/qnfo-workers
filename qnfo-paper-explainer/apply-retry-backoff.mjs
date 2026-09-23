#!/usr/bin/env node
// qnfo-paper-explainer/apply-retry-backoff.mjs
//
// Added 2026-09-13 by qnfo-ops. EXECUTABLE BY THE DEPLOY RUNNER. Idempotent.
// Fails closed: if a REQUIRED anchor does not match the expected number of times, it
// writes NOTHING and exits non-zero.
//
//   node apply-retry-backoff.mjs --check
//   node apply-retry-backoff.mjs --apply
//
// WHY A PATCHER
// worker.js is 25,044 bytes and the deploy runner owns it. This script does the surgery
// where the file lives, so no hand-authored full-file rewrite can ship guessed code.
//
// ---------------------------------------------------------------------------
// DEFECT — a single transient upstream error kills the entire daily run
// ---------------------------------------------------------------------------
// qnfo-paper-explainer runs once a day (cron "0 14 * * *"). Live evidence, verbatim
// from qnfo-audit.cloud_ops_events (kind='paper-explain'), read 2026-09-13 ~14:3xZ:
//
//   2026-09-11T14:00:59.115Z  status=posted   "paper-explain posted: 2609.11916v1 -> at://..."
//   2026-09-11T14:01:08.215Z  status=buffer   mastodon/linkedin/twitter all ok
//   2026-09-12T14:00:56.161Z  status=error    "paper-explain error: 3040: Capacity temporarily exceeded, please try again."
//   2026-09-13T14:01:18.554Z  status=error    "paper-explain error: arxiv 429"
//
// So the worker is NOT silent and NOT mis-scheduled: it fires on time every day and
// dies on a TRANSIENT upstream error. Both failures are retryable and neither is retried.
//
// Corroboration that the run dies before persistence: paper_explain_log holds 8 rows
// total, newest created_at 2026-09-11 14:00:57, statuses posted=4, dry=3, draft=1. No row
// was written for 09-12 or 09-13, so the throw happens BEFORE the D1 insert — the failure
// is invisible in the worker's own log table and only surfaces in cloud_ops_events.
//
// The arXiv 429 is a SHARED-RESOURCE problem: qnfo-arxiv-radar (now merged into
// radar-hub), qnfo-research-exec and this worker all query export.arxiv.org from the same
// egress, and the arXiv API rate-limits per client.
//
// ---------------------------------------------------------------------------
// FIX 1 — retry the arXiv fetch on 429/5xx/network error
// ---------------------------------------------------------------------------
// Replaces the exact v0.2.0 fetchArxiv body. Anchor matched verbatim, must occur exactly
// once. Keeps the same signature and return shape, adds bounded exponential backoff and
// honours Retry-After.
//
// ---------------------------------------------------------------------------
// FIX 2 — retry the Workers AI call on capacity/429/5xx
// ---------------------------------------------------------------------------
// Rewrites every `env.AI.run(` call site to `aiRun(env, ` and injects a wrapper that
// retries only TRANSIENT failures (error 3040 "Capacity temporarily exceeded", 429, 5xx,
// timeouts). Non-transient errors rethrow immediately so a genuine bug is not masked
// behind 4 retries. Call-site count is asserted so a future edit that changes the call
// shape fails the patch rather than silently skipping it.
//
// ---------------------------------------------------------------------------
// FAIL-CLOSED CONTRACT
// ---------------------------------------------------------------------------
//   * every anchor must match exactly its expected count, else NOTHING is written
//   * re-running --apply after a successful apply is a no-op (idempotent)
//   * --check never writes

import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("./worker.js", import.meta.url).pathname;

const MODE = process.argv.includes("--apply") ? "apply" : "check";

// ---- anchors ---------------------------------------------------------------

const ARXIV_OLD = `async function fetchArxiv() {
  const q = encodeURIComponent(ARXIV_CATS);
  const r = await fetch("https://export.arxiv.org/api/query?search_query=" + q + "&start=0&max_results=" + MAX_FETCH + "&sortBy=submittedDate&sortOrder=descending", { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("arxiv " + r.status);
  return parseArxiv(await r.text());
}`;

const ARXIV_NEW = `async function fetchArxiv() {
  const q = encodeURIComponent(ARXIV_CATS);
  const url = "https://export.arxiv.org/api/query?search_query=" + q + "&start=0&max_results=" + MAX_FETCH + "&sortBy=submittedDate&sortOrder=descending";
  // RETRY-BACKOFF-1: export.arxiv.org rate-limits per client (429) and this egress is
  // shared with radar-hub and qnfo-research-exec. A bare throw lost the whole daily run.
  const r = await fetchWithRetry(url, { headers: { "User-Agent": UA } }, "arxiv");
  if (!r.ok) throw new Error("arxiv " + r.status);
  return parseArxiv(await r.text());
}`;

const HELPER_ANCHOR = "function extractText(ai) {";

const HELPERS = `// ---------- transient-failure retry (RETRY-BACKOFF-1) ----------
// Bounded exponential backoff for TRANSIENT upstream failures only. Non-transient
// errors are rethrown immediately so real bugs are not masked behind retries.
const RETRY_MAX = 4;
const RETRY_BASE_MS = 800;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function isTransient(err) {
  const s = String((err && (err.message || err)) || "").toLowerCase();
  return (
    s.indexOf("429") >= 0 ||
    s.indexOf("3040") >= 0 ||
    s.indexOf("capacity") >= 0 ||
    s.indexOf("rate limit") >= 0 ||
    s.indexOf("timeout") >= 0 ||
    s.indexOf("timed out") >= 0 ||
    s.indexOf("econnreset") >= 0 ||
    s.indexOf("network") >= 0 ||
    /\\b5\\d\\d\\b/.test(s)
  );
}

function retryAfterMs(res) {
  try {
    const h = res && res.headers && res.headers.get && res.headers.get("Retry-After");
    if (!h) return 0;
    const secs = Number(h);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 15000);
  } catch (e) {}
  return 0;
}

async function fetchWithRetry(url, init, label) {
  let lastErr = null;
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry only on transient HTTP statuses. Any other status is returned as-is so
      // the caller's existing error handling is unchanged.
      if (res.status === 429 || res.status >= 500) {
        if (attempt === RETRY_MAX - 1) return res;
        const wait = retryAfterMs(res) || RETRY_BASE_MS * Math.pow(2, attempt);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === RETRY_MAX - 1) throw e;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }
  if (lastErr) throw lastErr;
  throw new Error((label || "fetch") + " retry exhausted");
}

async function aiRun(env, model, inputs, opts) {
  let lastErr = null;
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    try {
      return await env.AI.run(model, inputs, opts);
    } catch (e) {
      lastErr = e;
      if (!isTransient(e) || attempt === RETRY_MAX - 1) throw e;
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

`;

// ---- apply ----------------------------------------------------------------

function count(hay, needle) {
  let n = 0, i = 0;
  for (;;) {
    const p = hay.indexOf(needle, i);
    if (p < 0) break;
    n++; i = p + needle.length;
  }
  return n;
}

let src = readFileSync(FILE, "utf8");
const report = [];
let failed = false;

// Idempotency: if already patched, report and exit 0.
const alreadyHelpers = src.indexOf("RETRY-BACKOFF-1") >= 0;
const alreadyAiRun = src.indexOf("aiRun(env, ") >= 0;

// FIX 1
const nArxivOld = count(src, ARXIV_OLD);
const nArxivNew = count(src, ARXIV_NEW);
if (nArxivOld === 1) {
  src = src.replace(ARXIV_OLD, ARXIV_NEW);
  report.push("FIX 1: fetchArxiv -> fetchWithRetry (1 site)");
} else if (nArxivNew === 1 && nArxivOld === 0) {
  report.push("FIX 1: already applied (skip)");
} else {
  report.push("FIX 1: FAILED - fetchArxiv anchor matched " + nArxivOld + " times (expected exactly 1)");
  failed = true;
}

// HELPERS
const nHelperAnchor = count(src, HELPER_ANCHOR);
if (alreadyHelpers) {
  report.push("HELPERS: already applied (skip)");
} else if (nHelperAnchor === 1) {
  src = src.replace(HELPER_ANCHOR, HELPERS + HELPER_ANCHOR);
  report.push("HELPERS: injected retry helpers before extractText()");
} else {
  report.push("HELPERS: FAILED - extractText anchor matched " + nHelperAnchor + " times (expected exactly 1)");
  failed = true;
}

// FIX 2 - rewrite AI call sites
if (alreadyAiRun && !failed) {
  report.push("FIX 2: already applied (skip)");
} else {
  const nAi = count(src, "env.AI.run(");
  if (nAi >= 1 && nAi <= 8) {
    src = src.split("env.AI.run(").join("aiRun(env, ");
    report.push("FIX 2: rewrote " + nAi + " env.AI.run() call site(s) to aiRun()");
  } else {
    report.push("FIX 2: FAILED - env.AI.run( matched " + nAi + " times (expected 1..8)");
    failed = true;
  }
}

console.log(report.join("\n"));

if (failed) {
  console.error("\nFAIL-CLOSED: nothing written.");
  process.exit(1);
}

if (MODE === "apply") {
  writeFileSync(FILE, src);
  console.log("\nwrote " + FILE);
} else {
  console.log("\n--check only; nothing written. Re-run with --apply to commit the patch.");
}
