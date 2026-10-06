// GW-402-UNFUNDED-1 (qnfo-ai-calibration 1.2.9, agent_issues #1992) offline suite.
// A provider's 402 "Insufficient Balance" is an unfunded account, not a degraded model: the gateway-failure sweep must
// class it "unfunded", file no [gw-fail] issue for it, never set ai_model_health degraded from it, and the 24h reconcile
// that clears a degraded row must ignore it (as it ignores rate-capacity). No network, no production data.
// Run: node qnfo-ai-calibration/gw-unfunded.test.mjs
import fs from "node:fs";
const src = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const api = new Function(src.replace(/export \{\s*worker_default as default\s*\};?/, "") + "\nreturn { gwErrorClass, GW_NO_DEGRADE_CLASSES, VERSION, worker_default };")();
const fail = [];
const eq = (l, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) fail.push(l + ": got " + JSON.stringify(g) + " want " + JSON.stringify(w)); };
const ok = (l, c) => { if (!c) fail.push(l); };

const DEEPSEEK_402 = '{"error":{"message":"Insufficient Balance (request_id: 8227fe18-6d35-4610-8137-3f69341c79ca)","type":"unknown_error","param":null,"code":"invalid_request_error"}}';

// 1 the class decision
eq("402 with the DeepSeek body", api.gwErrorClass(402, DEEPSEEK_402), "unfunded");
eq("402 with no body (the head fetch failed)", api.gwErrorClass(402, ""), "unfunded");
eq("402 as a string status", api.gwErrorClass("402", ""), "unfunded");
eq("insufficient balance under another status", api.gwErrorClass(400, "Insufficient Balance"), "unfunded");
eq("OpenAI quota wording", api.gwErrorClass(429, "You exceeded your current quota, please check your plan and billing details"), "unfunded");
eq("rate capacity stays rate-capacity", api.gwErrorClass(429, "capacity temporarily exceeded"), "rate-capacity");
eq("content shape stays content-shape", api.gwErrorClass(400, "'string' not in 'array'"), "content-shape");
eq("image input stays image-input", api.gwErrorClass(400, "image dimensions must be at least 10px"), "image-input");
eq("tool args stay tool-args-json", api.gwErrorClass(400, "arguments must be valid JSON"), "tool-args-json");
eq("5xx stays upstream", api.gwErrorClass(502, "upstream unavailable"), "upstream");
eq("unknown 400 stays other", api.gwErrorClass(400, "something else"), "other");
eq("no status, no head", api.gwErrorClass(0, ""), "other");

// 2 which classes are not evidence against the model
eq("no-degrade set", Object.keys(api.GW_NO_DEGRADE_CLASSES).sort(), ["rate-capacity", "unfunded"]);
ok("other degrades", !api.GW_NO_DEGRADE_CLASSES["other"]);
ok("upstream degrades", !api.GW_NO_DEGRADE_CLASSES["upstream"]);

// 3 the sweep wires the set and the reconcile exclusions (static reads of the source, one occurrence each)
const once = (l, re) => { const n = (src.match(re) || []).length; if (n !== 1) fail.push(l + ": " + n + " occurrences, want 1"); };
once("issue filing gated by the set", /if \(!dispo && !GW_NO_DEGRADE_CLASSES\[clsLabel\] && \(b\.count >= 2 \|\| prevCount > 0\)\)/);
once("degrade gated by the set", /var recurring = !GW_NO_DEGRADE_CLASSES\[clsLabel\] && \(b\.count >= 2 \|\| prevCount > 0\);/);
eq("both 24h reads ignore unfunded", (src.match(/error_class NOT IN \('rate-capacity','unfunded'\)/g) || []).length, 2);
ok("no read still treats only rate-capacity as transient", !/error_class != 'rate-capacity'/.test(src));
ok("the class is decided in one place", (src.match(/clsLabel = gwErrorClass\(b\.status, /g) || []).length === 2 && !/else if \(\/capacity temporarily\|rate limit\/i\.test\(rh\)\) clsLabel/.test(src));
// The version history keeps the change (a later version bump must not fail this suite).
ok("version names the change", /1\.2\.9 GW-402-UNFUNDED-1/.test(src) && /^1\.(2\.(9|[1-9]\d)|[3-9]\.|\d{2,}\.)/.test(api.VERSION));
ok("module still exports a worker", api.worker_default && typeof api.worker_default.fetch === "function");

if (fail.length) { console.log("FAIL " + fail.length + "\n" + fail.join("\n")); process.exit(1); }
console.log("gw-unfunded: " + (12 + 3 + 7) + " passed, 0 failed (" + api.VERSION + ")");
