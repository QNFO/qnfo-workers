#!/usr/bin/env node
// scripts/worker-load-gate.mjs: MERGE-BOUNDARY-GATE-1 (agent_issues 2830, pillar autonomy).
//
// WHAT   Loads the entry module of EVERY worker directory (worker.js, and deployed-current.worker.js when it differs) in a
//        child node process with no network and the Workers-only modules stubbed (cloudflare:workers, :email, :sockets), and
//        fails when a module cannot be linked or its top level throws. It runs on every pull request over ALL workers, not
//        only the changed ones: it costs about two seconds, and a pull request that touches one worker can still break the
//        load of another (a shared helper, a copied block, a renamed export).
// WHY    PRS-SCOPE-1 made a pull request run only the suites of its changed directories, so on 2026-10-17 WELLBEING-LOOP-1
//        (6c60b59a) put `import ... from "./wellbeing-wire.js"` into personal-companion/worker.js and every one of that
//        worker's 30 suites died with ERR_UNSUPPORTED_RESOLVE_REQUEST; main stayed red until a later push happened to run the
//        full set. The deploy transport uploads ONE module per worker (qnfo-observability 1.1.6: "No such module" HTTP 400
//        10021), so a relative import is a deploy failure as well as a test failure. `node --check` accepts it (the syntax is
//        valid), so only a real load, with a resolver that refuses a sibling module, sees it.
// RULES  relative-import    a worker entry imports ./x or ../x (inline it; scripts/inline-companion-modules.mjs is the pattern)
//        unresolved-import  a bare package or a missing file nothing bundles (the transport has no node_modules)
//        syntax-error       the file does not parse as a module
//        eval-error         the top level throws (a ReferenceError, a TDZ error, a top-level network call)
//        timeout            the top level does not settle
// USAGE  node scripts/worker-load-gate.mjs [--root <dir>] [--only a,b] [--jobs 8] [--timeout 20] [--json]
//        Exit 1 when any entry fails. The child mode (--child <file>) is internal.
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

// The modules the Workers runtime provides and node does not. Named exports are linked statically, so the stub must carry every
// name a worker imports; scripts/worker-load-gate.test.mjs fails when a worker in the repository imports a name missing here.
export const STUB_SOURCES = {
  "workers": [
    "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
    "export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
    "export class WorkflowEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
    "export const env = {};",
    "export class RpcTarget {}",
    "export class RpcStub {}",
    "export class ExecutionContext {}",
    "export const tracing = { enterSpan(_name, callback, ...args) { return callback({ setAttribute() {}, end() {} }, ...args); } };",
    "export const exports = {};"
  ].join("\n"),
  "email": "export class EmailMessage { constructor(from, to, raw) { this.from = from; this.to = to; this.raw = raw; } }",
  "sockets": "export class Socket {}\nexport function connect() { return new Socket(); }"
};

const HOOKS = `
import { readFileSync } from "node:fs";
let entry = "";
export async function initialize(data) { entry = (data && data.entry) || ""; }
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("cloudflare:")) return { url: "lg-stub:" + specifier.slice(11), shortCircuit: true };
  if (context.parentURL === entry && (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/") || specifier.startsWith("file:"))) {
    // MERGE-BOUNDARY-GATE-1 (2026-10-24): a static JSON data module is safe to load; it is resolved and
    // evaluated here instead of being refused. Relative JS/TS imports still fail: the deploy transport
    // uploads one module per worker, so a sibling module would not exist at the edge.
    if (/\.json$/.test(specifier)) return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
    throw new Error("LOAD-GATE-RELATIVE-IMPORT " + specifier);
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.startsWith("lg-stub:")) {
    const name = url.slice(8);
    const src = (${JSON.stringify(STUB_SOURCES)})[name];
    if (src === undefined) throw new Error("LOAD-GATE-UNKNOWN-STUB cloudflare:" + name);
    return { format: "module", source: src, shortCircuit: true };
  }
  if (url.endsWith(".json")) {
    return { format: "module", source: "export default " + readFileSync(new URL(url), "utf8"), shortCircuit: true };
  }
  if (url === entry) return nextLoad(url, { ...context, format: "module" });
  return nextLoad(url, context);
}
`;

// Worker-only globals a top level may touch. Each is a harmless stand-in so that the load reaches the module's own code.
function installGlobals() {
  if (typeof globalThis.HTMLRewriter === "undefined") globalThis.HTMLRewriter = class HTMLRewriter { on() { return this; } transform(r) { return r; } };
  if (typeof globalThis.WebSocketPair === "undefined") globalThis.WebSocketPair = class WebSocketPair { constructor() { const s = { accept() {}, send() {}, close() {}, addEventListener() {} }; this[0] = s; this[1] = s; } };
  if (typeof globalThis.caches === "undefined") globalThis.caches = { default: { match: async () => undefined, put: async () => undefined, delete: async () => false } };
  // A service worker's own event registration is a no-op: the module body is what is under test.
  if (typeof globalThis.addEventListener === "undefined") globalThis.addEventListener = () => {};
  globalThis.fetch = async () => { throw new Error("LOAD-GATE-NO-NETWORK: no network access"); };
}

// Pure: turns what the child reported into a failure class. Exported for the test suite.
export function classify(msg) {
  const m = String(msg || "");
  if (/LOAD-GATE-RELATIVE-IMPORT/.test(m)) return "relative-import";
  if (/ERR_MODULE_NOT_FOUND|Cannot find (package|module)|LOAD-GATE-UNKNOWN-STUB|does not provide an export named/.test(m)) return "unresolved-import";
  if (/SyntaxError|Unexpected (token|identifier|end)|Invalid or unexpected token/.test(m)) return "syntax-error";
  return "eval-error";
}

// Every <dir>/worker.js, and <dir>/deployed-current.worker.js when its bytes differ (mirror-guard keeps them identical, so the
// second load is skipped in the normal case and is the only check of a drifted mirror otherwise).
export function workerEntries(root, only) {
  const dirs = readdirSync(root).filter((d) => !d.startsWith(".") && d !== "node_modules" && existsSync(join(root, d, "worker.js"))).sort();
  const pick = only && only.length ? dirs.filter((d) => only.includes(d)) : dirs;
  const out = [];
  for (const d of pick) {
    out.push(d + "/worker.js");
    const m = join(root, d, "deployed-current.worker.js");
    if (existsSync(m) && readFileSync(m, "utf8") !== readFileSync(join(root, d, "worker.js"), "utf8")) out.push(d + "/deployed-current.worker.js");
  }
  return out;
}

export function checkOne(root, rel, timeoutS) {
  return new Promise((done) => {
    const t0 = Date.now();
    const file = resolve(root, rel);
    const child = spawn(process.execPath, ["--no-warnings", fileURLToPath(import.meta.url), "--child", file], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "" } });
    let out = "", err = "", killed = false;
    child.stdout.on("data", (b) => { out += b; });
    child.stderr.on("data", (b) => { err += b; });
    const timer = setTimeout(() => { killed = true; child.kill("SIGKILL"); }, timeoutS * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      if (killed) return done({ file: rel, ok: false, cls: "timeout", msg: "the top level did not settle in " + timeoutS + " s", ms });
      let j = null;
      const line = out.split("\n").filter((l) => l.startsWith("{")).pop();
      try { j = line ? JSON.parse(line) : null; } catch (e) { j = null; }
      if (j && j.ok) return done({ file: rel, ok: true, ms });
      const msg = (j && j.msg) || err.split("\n").slice(0, 6).join(" ").slice(0, 400) || ("exit " + code);
      done({ file: rel, ok: false, cls: classify(msg), msg: String(msg).slice(0, 400), ms });
    });
  });
}

async function child(file) {
  installGlobals();
  const url = pathToFileURL(file).href;
  register("data:text/javascript," + encodeURIComponent(HOOKS), { parentURL: import.meta.url, data: { entry: url } });
  let res;
  try { await import(url); res = { ok: true }; }
  catch (e) {
    // the error line plus the first frame that is in the worker itself (never the hook's data: URL or node internals)
    const lines = String((e && (e.stack || e.message)) || e).split("\n");
    const frame = lines.slice(1).find((l) => /^\s+at /.test(l) && !/data:text|node:internal/.test(l));
    const head = e && e.message !== undefined ? (e.code ? e.code + " " : "") + (e.name || "Error") + ": " + String(e.message).split("\n")[0] : lines[0];
    res = { ok: false, msg: (head + (frame ? " |" + frame.replace(/\s+/g, " ").replace(url.replace(/[^/]*$/, ""), "") : "")).slice(0, 400) };
  }
  process.stdout.write(JSON.stringify(res) + "\n", () => process.exit(0));
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  if (argv[0] === "--child") return child(argv[1]);
  const root = resolve(arg("--root", process.cwd()));
  const only = (arg("--only", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const jobs = Math.max(1, Number(arg("--jobs", 8)) || 8), timeoutS = Math.max(5, Number(arg("--timeout", 20)) || 20);
  const entries = workerEntries(root, only);
  const queue = entries.slice(), results = [];
  await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) results.push(await checkOne(root, queue.shift(), timeoutS)); }));
  results.sort((a, b) => a.file.localeCompare(b.file));
  const failed = results.filter((r) => !r.ok);
  if (argv.includes("--json")) console.log(JSON.stringify({ checked: results.length, failed: failed.length, failures: failed }));
  else {
    for (const r of failed) console.log("::error file=" + r.file + "::MERGE-BOUNDARY-GATE-1 " + r.cls + ": " + r.msg);
    console.log("MERGE-BOUNDARY-GATE-1 worker load gate: " + (results.length - failed.length) + " of " + results.length + " worker entries load, " + failed.length + " failed" + (only.length ? " (" + only.join(",") + ")" : " (every worker directory)"));
  }
  process.exit(failed.length ? 1 : 0);
}

function isEntry() { try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; } }
if (isEntry()) main();
