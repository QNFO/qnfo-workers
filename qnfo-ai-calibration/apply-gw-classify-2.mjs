#!/usr/bin/env node
// apply-gw-classify-2.mjs - GW-CLASSIFY-2 (2026-09-13)
//
// Fixes the defect class behind open agent_issues 678/682/683 (the stuck
// [gw-fail] backlog) in qnfo-ai-calibration.
//
// USAGE
//   node apply-gw-classify-2.mjs path/to/worker.js          # apply in place
//   node apply-gw-classify-2.mjs path/to/worker.js --dry    # verify anchors only
//
// FAIL-CLOSED: each anchor must match EXACTLY ONCE. Any mismatch aborts with
// exit code 2 and writes nothing. A partial application is impossible.
//
// Anchors were extracted verbatim from qnfo-workers/qnfo-ai-calibration/worker.js
// at blob sha 7a37a8ab74bb4aeaf70fc2438e3c7a48f20d685e (VERSION 1.1.4).

import { readFileSync, writeFileSync } from "node:fs";

const FILE = process.argv[2];
const DRY = process.argv.includes("--dry");
if (!FILE) {
  console.error("usage: node apply-gw-classify-2.mjs <worker.js> [--dry]");
  process.exit(1);
}

let src = readFileSync(FILE, "utf8");
const applied = [];

function swap(label, from, to) {
  const hits = src.split(from).length - 1;
  if (hits !== 1) {
    console.error(
      "FAIL-CLOSED: anchor " + label + " matched " + hits + " time(s), expected exactly 1. Nothing written."
    );
    process.exit(2);
  }
  src = src.replace(from, to);
  applied.push(label);
  console.log("  ok  " + label);
}

console.log("GW-CLASSIFY-2 on " + FILE);
console.log("");

// ---------------------------------------------------------------- A1 classifier
swap(
  "A1 classifier (kill the internalCode catch-all, add request-shape/unclassified)",
  `        if (/string' not in 'array'|oneOf|Bad input/.test(rh)) clsLabel = "content-shape";
        else if (/capacity temporarily|rate limit/i.test(rh)) clsLabel = "rate-capacity";
        else if (/image|dimensions|at least 10px/i.test(rh)) clsLabel = "image-input";
        else if (/arguments must be valid JSON/i.test(rh)) clsLabel = "tool-args-json";
        else if (/unavailable|5[0-9][0-9]|internal/i.test(rh)) clsLabel = "upstream";`,
  `        // GW-CLASSIFY-2 (2026-09-13): the old catch-all /unavailable|5[0-9][0-9]|internal/i matched the
        // literal substring "internal" inside the "internalCode" key carried by EVERY Workers AI error
        // payload, so any unrecognised error was confidently mislabelled "upstream". Verified against
        // stored samples: @cf/qwen/qwen3.8-27b ("System message must be at the beginning.") was classed
        // upstream solely because of that key. Shape classes are now explicit and silence is
        // "unclassified" instead of a wrong answer.
        if (/string' not in 'array'|oneOf|Bad input|required properties/i.test(rh)) clsLabel = "content-shape";
        else if (/capacity temporarily|rate limit/i.test(rh)) clsLabel = "rate-capacity";
        else if (/image|dimensions|at least 10px/i.test(rh)) clsLabel = "image-input";
        else if (/arguments must be valid JSON/i.test(rh)) clsLabel = "tool-args-json";
        else if (/must be at the beginning|system message|BadRequestError/i.test(rh)) clsLabel = "request-shape";
        else if (/unavailable|overloaded|"internalCode":5[0-9][0-9]/.test(rh)) clsLabel = "upstream";
        else clsLabel = "unclassified";`
);

// ---------------------------------------------------------------- A2 accumulator
swap(
  "A2 shapeOnly accumulator",
  `  var parts = [];`,
  `  var parts = [];
  var shapeOnly = []; // GW-CLASSIFY-2: request-shape classes are recorded and surfaced, never filed against the model`
);

// ---------------------------------------------------------------- A3 filing gate
swap(
  "A3 filing gate (shape classes never file a model ticket)",
  `      if (!dispo && (b.count >= 2 || prevCount > 0)) {
        await fileIssue(env, title, "gateway failures in sweep window: " + b.count + "x status=" + b.status + " class=" + clsLabel + " sample=" + String(b.sample || "").slice(0, 200) + ". Router-level self-heal handles content-shape/rate classes; escalate if this class persists.", "high");
      }`,
  `      // GW-CLASSIFY-2: a 400 content-shape / image-input / tool-args-json / request-shape response is a
      // malformed REQUEST reaching a live model that validated and rejected it - a caller or probe defect.
      // It is never a model-health signal. Only rate-capacity / upstream / unclassified may file a
      // [gw-fail] ticket or mark ai_model_health degraded; shape classes are recorded in
      // ai_gateway_failures and reported in the sweep summary instead.
      var modelFault = (clsLabel === "rate-capacity" || clsLabel === "upstream" || clsLabel === "unclassified");
      if (!modelFault && (b.count >= 2 || prevCount > 0)) shapeOnly.push(b.status + " " + b.model + " x" + b.count + " [" + clsLabel + "]");
      if (!dispo && modelFault && (b.count >= 2 || prevCount > 0)) {
        await fileIssue(env, title, "gateway failures in sweep window: " + b.count + "x status=" + b.status + " class=" + clsLabel + " sample=" + String(b.sample || "").slice(0, 200) + ". Model-side class: escalate if it persists.", "high");
      }`
);

// ---------------------------------------------------------------- A4 degrade gate
swap(
  "A4 degrade gate (never degrade a model for a request-shape defect)",
  `      var recurring = (b.count >= 2) || prevCount > 0;`,
  `      var recurring = modelFault && ((b.count >= 2) || prevCount > 0); // GW-CLASSIFY-2`
);

// ---------------------------------------------------------------- A5 summary
swap(
  "A5 sweep summary (shape classes become visible instead of silently filed)",
  `  out.summary = cls.length ? parts.join("; ") : "clean (0 failed requests in window)";`,
  `  if (shapeOnly.length) parts.push("SHAPE-ONLY (recorded, not filed, not degraded): " + shapeOnly.join("; "));
  out.shapeOnly = shapeOnly;
  out.summary = cls.length ? parts.join("; ") : "clean (0 failed requests in window)";`
);

// ---------------------------------------------------------------- A6 close path
swap(
  "A6 close path (resolve false-positive tickets; optional declared agent_issues close)",
  `        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, t0 - 24 * 3600 * 1000).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");`,
  `        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, t0 - 24 * 3600 * 1000).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");
        else {
          // GW-CLASSIFY-2: a ticket whose 24h failures are ALL request-shape is a false positive against
          // the model. Resolve the ledger row. NOTE: the ops backlog lives in agent_issues, a DIFFERENT
          // table that closeIssue() never writes - so without the block below the row stays open forever.
          var shp = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2 AND error_class IN ('content-shape','image-input','tool-args-json','request-shape')").bind(modelPart, t0 - 24 * 3600 * 1000).first();
          var real = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2 AND error_class NOT IN ('content-shape','image-input','tool-args-json','request-shape')").bind(modelPart, t0 - 24 * 3600 * 1000).first();
          if (Number(shp && shp.c || 0) > 0 && Number(real && real.c || 0) === 0) {
            await closeIssue(env, ttl, "24h failures are request-shape only - caller/probe defect, not a model defect (GW-CLASSIFY-2)");
            // Cross-worker write into the ops backlog. UNDECLARED in signal_worker_boundary (the matrix
            // has 37 rows and none for qnfo-ai-calibration), so it is OFF by default. Enable via
            // ai_calibration_config gw_shape_close_agent_issues='1' only once the boundary matrix
            // declares it.
            if (String(await cfgGet(env, "gw_shape_close_agent_issues", "0")) === "1") {
              await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ?1 WHERE title = ?2 AND status = 'open'").bind(now(), ttl).run();
            }
          }
        }`
);

// ---------------------------------------------------------------- A7 version
swap(
  "A7 version bump 1.1.4 -> 1.1.6",
  `var VERSION = "1.1.4";`,
  `var VERSION = "1.1.6"; // GW-CLASSIFY-2 (2026-09-13): shape-vs-model-fault gate + explicit request-shape/unclassified classes`
);

console.log("");
console.log("all " + applied.length + " anchors matched exactly once");

if (DRY) {
  console.log("--dry: no write performed");
  process.exit(0);
}
writeFileSync(FILE, src);
console.log("wrote " + FILE + " (" + Buffer.byteLength(src) + " bytes)");
console.log("");
console.log("NEXT: deploy. The deploy path for qnfo-ai-calibration pulls");
console.log("r2:qnfo-canonical/qnfo-ai-calibration.js (fleet_deploys id 9), not this repo.");
