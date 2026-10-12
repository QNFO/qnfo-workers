#!/usr/bin/env node
// scripts/compat-risk-scan.mjs: COMPAT-RISK-SCAN-1 (2026-10-12, pillar core), part of COMPAT-DATE-DECLARED-APPLY-1.
//
// WHAT   A static scan of a worker's source for the code patterns that change meaning when its compatibility date
//        crosses 2026-08-04, the date from which Cloudflare enables nodejs_compat and nodejs_compat_v2 by default
//        (developers.cloudflare.com/workers/configuration/compatibility-flags, read 2026-10-12). For a worker that never
//        set nodejs_compat this switches on, in one step:
//          - a populated process.env (nodejs_compat_populate_process_env, default 2025-04-01 with nodejs_compat): text and
//            JSON bindings, secrets included, become readable there;
//          - Node-compatible timers (enable_nodejs_global_timers, default 2026-02-10 with nodejs_compat): setTimeout and
//            setInterval return a Timeout object, not a number;
//          - the globals process, Buffer and global, so code that tests for them to detect Node takes its other branch;
//          - node: modules resolve.
//        It also reports what decides whether a worker suits a canary cohort: Durable Objects and WebSockets (the
//        2026-04-07 web_socket_auto_reply_to_close, 2026-03-17 websocket_standard_binary_type and 2026-10-01
//        durable_object_io_tasks_prevent_eviction defaults), and whether it throws errors across a service binding RPC
//        (2026-04-21 enhanced_error_serialization).
// LIMIT  Pattern matching, not data flow. "clean" means none of the patterns occur; it does not prove the worker is
//        unaffected. A hit is a line to read, not a defect.
// USAGE  node scripts/compat-risk-scan.mjs [--json] [worker-dir ...]   (default: every live worker directory, which is a
//        directory with worker.js and wrangler.toml and no RETIRED or FOLDED marker)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Comments are blanked (line count kept) so prose that names process.env is not a hit. A // inside a string (a URL) is
// kept because it follows a colon or a quote, never whitespace or a statement boundary.
export function stripComments(src) {
  let s = String(src).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  s = s.replace(/(^|[\s;{}(),])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
  return s;
}

// String literals on one line are emptied before the checks that would otherwise read prose as code ("keep-alive",
// a sentence ending in "process."). A template literal that interpolates is kept, because its ${...} is code.
export function blankStrings(line) {
  return String(line).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, (m) => m.includes("${") ? m : '""');
}

function linesOf(src, re, cap, blank) {
  const out = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (re.test(blank ? blankStrings(lines[i]) : lines[i])) { out.push(i + 1); if (out.length >= (cap || 12)) break; }
  }
  return out;
}

// Timer results that are kept: `x = setTimeout(`, `x: setTimeout(`, `return setTimeout(`, `.push(setTimeout(`.
// For a kept name, a numeric use within the next 60 lines is the risk: arithmetic, ordering, typeof, Number(), String(),
// JSON.stringify, comparison with a digit, or storage (put / set / bind).
export function timerRisks(src) {
  const lines = src.split("\n");
  const kept = [], numeric = [];
  const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/\bset(?:Timeout|Interval)\s*\(/.test(l)) continue;
    const m = /([A-Za-z_$][\w$.]*)\s*(?:=|:)\s*(?:await\s+)?set(?:Timeout|Interval)\s*\(/.exec(l);
    if (/\breturn\s+set(?:Timeout|Interval)\s*\(/.test(l) || /\.push\(\s*set(?:Timeout|Interval)\s*\(/.test(l)) kept.push({ line: i + 1, name: null });
    if (!m) continue;
    const name = m[1];
    kept.push({ line: i + 1, name });
    const v = esc(name);
    const uses = [
      new RegExp("(?:^|[^\\w$.])" + v + "\\s*(?:[-+*/%]|[<>]=?)\\s*[\\w(]"),
      new RegExp("[\\w)]\\s*(?:[-+*/%]|[<>]=?)\\s*" + v + "(?![\\w$(])"),
      new RegExp("typeof\\s+" + v + "(?![\\w$])"),
      new RegExp("(?:Number|String|parseInt|isNaN|Number\\.isInteger)\\(\\s*" + v + "\\s*[),]"),
      new RegExp("JSON\\.stringify\\(\\s*(?:[^)]*[^\\w$.])?" + v + "(?![\\w$])"),
      new RegExp("(?:^|[^\\w$.])" + v + "\\s*[!=]==?\\s*-?\\d"),
      new RegExp("\\.(?:put|set|bind)\\(\\s*(?:[^)]*[^\\w$.\"'])?" + v + "(?![\\w$\"'])")
    ];
    for (let k = i; k < Math.min(lines.length, i + 60); k++) {
      const t = blankStrings(k === i ? l.replace(m[0], "") : lines[k]);
      // the timer callback's own delay arithmetic is not a use of the id
      if (/\bclear(?:Timeout|Interval)\s*\(/.test(t) && !/[-+*/%]/.test(t)) continue;
      if (uses.some((r) => r.test(t))) { numeric.push({ line: k + 1, name }); break; }
    }
  }
  const literalClear = linesOf(src, /\bclear(?:Timeout|Interval)\s*\(\s*-?\d/);
  return { kept: kept.length, numeric, literal_clear: literalClear };
}

export function tomlFacts(toml) {
  const t = String(toml || "");
  const head = t.split(/^\s*\[/m)[0];
  const d = /^\s*compatibility_date\s*=\s*"(\d{4}-\d{2}-\d{2})"/m.exec(head);
  const f = /^\s*compatibility_flags\s*=\s*\[([^\]]*)\]/m.exec(head);
  const flags = f ? (f[1].match(/"([^"]+)"/g) || []).map((q) => q.slice(1, -1)) : [];
  const body = t.replace(/#.*$/gm, "");
  return {
    compatibility_date: d ? d[1] : null,
    flags,
    nodejs_compat: flags.includes("nodejs_compat") || flags.includes("nodejs_compat_v2"),
    durable_objects: /^\s*\[\[?\s*durable_objects/m.test(body),
    containers: /^\s*\[\[\s*containers/m.test(body),
    marker: (/^#\s*compat-advance:\s*reviewed\s+(\d{4}-\d{2}-\d{2})\b/m.exec(t) || [])[1] || null
  };
}

export function scan(source, toml) {
  const src = stripComments(source);
  const tf = tomlFacts(toml);
  const processEnv = linesOf(src, /\bprocess\s*(?:\.|\?\.)\s*env\b|\bprocess\s*\[\s*["']env["']\s*\]/);
  const nodeGlobals = linesOf(src, /\btypeof\s+(?:process|Buffer|global|require|module)\b|\bglobalThis\s*\.\s*(?:process|Buffer)\b|(?:^|[^\w$.])process\.(?!env\b)[A-Za-z_]\w*|(?:^|[^\w$.])Buffer\.[a-z]\w*\s*\(/, 12, true);
  const nodeImports = linesOf(src, /(?:from|import|require)\s*\(?\s*["']node:[\w/]+["']/);
  const timers = timerRisks(src);
  const websockets = linesOf(src, /\bWebSocketPair\b|\bnew\s+WebSocket\s*\(|\bacceptWebSocket\s*\(|\bwebSocketMessage\s*\(|["']Upgrade["']\s*\)?\s*[!=]==?\s*["']websocket["']/i);
  const doClass = linesOf(src, /\bextends\s+DurableObject\b|\bidFromName\s*\(|\bstate\.storage\b|\bctx\.storage\b/);
  const rpc = linesOf(src, /\bextends\s+(?:WorkerEntrypoint|RpcTarget)\b/);
  const risks = [];
  if (!tf.nodejs_compat) {
    if (processEnv.length) risks.push("process.env");
    if (nodeGlobals.length) risks.push("node-globals");
    if (timers.numeric.length || timers.literal_clear.length) risks.push("timer-ids");
  }
  if (nodeImports.length && !tf.nodejs_compat) risks.push("node-imports-without-flag");
  // Hold-back flags a date advance past 2026-08-04 should carry for this worker; empty when the scan found nothing.
  const hold = risks.length && !tf.nodejs_compat ? ["no_nodejs_compat", "no_nodejs_compat_v2"] : [];
  return {
    toml: tf,
    process_env: processEnv, node_globals: nodeGlobals, node_imports: nodeImports,
    timers_kept: timers.kept, timer_numeric_use: timers.numeric.map((x) => x.line), timer_literal_clear: timers.literal_clear,
    websockets: websockets, durable_object_code: doClass, rpc_entrypoints: rpc,
    risks,
    verdict: risks.length ? "review" : "clean",
    hold_back_flags: hold,
    canary_eligible: !risks.length && !websockets.length && !doClass.length && !tf.durable_objects && !tf.containers
  };
}

export function liveWorkerDirs(root) {
  const out = [];
  for (const d of readdirSync(root).sort()) {
    if (d.startsWith(".")) continue;
    const p = join(root, d);
    if (!existsSync(join(p, "worker.js")) || !existsSync(join(p, "wrangler.toml"))) continue;
    if (existsSync(join(p, "RETIRED")) || existsSync(join(p, "FOLDED"))) continue;
    out.push(d);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const root = process.cwd();
  const dirs = argv.filter((a) => !a.startsWith("--"));
  const list = dirs.length ? dirs : liveWorkerDirs(root);
  const res = {};
  for (const d of list) {
    const w = join(root, d, "worker.js"), t = join(root, d, "wrangler.toml");
    if (!existsSync(w)) { res[d] = { error: "no worker.js" }; continue; }
    res[d] = scan(readFileSync(w, "utf8"), existsSync(t) ? readFileSync(t, "utf8") : "");
  }
  if (asJson) { console.log(JSON.stringify(res, null, 1)); return; }
  console.log("worker | toml date | nodejs_compat | verdict | risks | process.env | node globals | node: imports | timer numeric | ws | do | canary");
  for (const d of Object.keys(res)) {
    const r = res[d];
    if (r.error) { console.log(d + " | " + r.error); continue; }
    console.log([d, r.toml.compatibility_date, r.toml.nodejs_compat ? "yes" : "no", r.verdict, r.risks.join(",") || "-", r.process_env.join(",") || "-", r.node_globals.join(",") || "-", r.node_imports.join(",") || "-", r.timer_numeric_use.concat(r.timer_literal_clear).join(",") || "-", r.websockets.length, (r.durable_object_code.length || r.toml.durable_objects) ? "yes" : "no", r.canary_eligible ? "eligible" : "no"].join(" | "));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
