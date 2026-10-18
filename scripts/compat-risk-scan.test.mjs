// COMPAT-RISK-SCAN-1 offline suite for scripts/compat-risk-scan.mjs. No network.
// Proves each pattern the scan reports for the 2026-08-04 nodejs_compat default (process.env, Node globals, node: imports,
// timer ids used as numbers), that comments and string prose are not hits, that a worker which already sets nodejs_compat is
// not flagged for what it already has, and what makes a worker canary-eligible. Then runs the scan over every live worker
// directory so a pattern that crashes on real source fails here.
// Run: node scripts/compat-risk-scan.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scan, stripComments, blankStrings, timerRisks, tomlFacts, liveWorkerDirs } from "./compat-risk-scan.mjs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const T0 = 'name = "w"\ncompatibility_date = "2026-08-01"\n';
const TN = 'name = "w"\ncompatibility_date = "2026-08-01"\ncompatibility_flags = ["nodejs_compat"]\n';

// clean
let r = scan('export default { async fetch(req, env) { const t = setTimeout(() => {}, 5); clearTimeout(t); return new Response(env.KEY ? "y" : "n"); } };', T0);
ok(r.verdict === "clean" && r.canary_eligible === true && r.hold_back_flags.length === 0 && r.timers_kept === 1, "a worker that only clears its timer is clean", r);

// process.env
r = scan("const k = process.env.API_KEY;\nconst z = process?.env;\nconst y = process['env'].X;", T0);
ok(r.process_env.length === 3 && r.risks.includes("process.env") && r.verdict === "review" && r.canary_eligible === false, "process.env in three spellings", r);
ok(JSON.stringify(r.hold_back_flags) === '["no_nodejs_compat","no_nodejs_compat_v2"]', "a risk names both opt-out flags", r.hold_back_flags);
r = scan("const a = `${process.env.A}`;", T0);
ok(r.process_env.length === 1, "process.env inside a template interpolation is code");
r = scan("// reads process.env.X in Node\n/* process.env\n process.env */\nconst s = 1;", T0);
ok(r.verdict === "clean" && r.process_env.length === 0, "comments are not hits", r);

// node globals
r = scan('if (typeof process !== "undefined") { run(); }\nconst b = Buffer.from("x");\nprocess.nextTick(f);\nif (typeof Buffer === "undefined") {}\nconst g = globalThis.process;', T0);
ok(r.node_globals.length === 5 && r.risks.includes("node-globals"), "Node detection and Buffer use", r.node_globals);
r = scan('const m = "the process. A new line"; const s = "ArrayBuffer.isView"; const h = { Connection: "keep-alive" }; const u = new ArrayBuffer(8); const v = ArrayBuffer.isView(u);', T0);
ok(r.verdict === "clean", "prose in strings and ArrayBuffer are not hits", r);

// node: imports
r = scan('import { createHash } from "node:crypto";\nconst fs = require("node:fs");\nconst x = await import("node:buffer");', T0);
ok(r.node_imports.length === 3 && r.risks.includes("node-imports-without-flag"), "node: imports without the flag", r);
r = scan('import { createHash } from "node:crypto";\nconst k = process.env.X;\nconst t = setTimeout(f, 1); const n = t + 1;', TN);
ok(r.verdict === "clean" && r.node_imports.length === 1 && r.process_env.length === 1 && r.risks.length === 0, "a worker that already sets nodejs_compat keeps what it has: reported, not a risk", r);

// timers
const tr = (code) => timerRisks(stripComments(code));
ok(tr("const id = setTimeout(f, 10);\nconst next = id + 1;").numeric.length === 1, "arithmetic on a timer id");
ok(tr("let id = setInterval(f, 10);\nif (id > 0) stop();").numeric.length === 1, "ordering comparison of a timer id");
ok(tr("this.timer = setTimeout(f, 10);\nawait kv.put(\"t\", JSON.stringify({ timer: this.timer }));").numeric.length === 1, "a timer id serialised to JSON");
ok(tr("const id = setTimeout(f, 10);\nif (typeof id === \"number\") {}").numeric.length === 1, "typeof on a timer id");
ok(tr("const id = setTimeout(f, 10);\nawait storage.put(id, 1);").numeric.length === 1, "a timer id stored");
ok(tr("const id = setTimeout(f, 10);\nif (id === 0) {}").numeric.length === 1, "a timer id compared with a digit");
ok(tr("clearTimeout(7);").literal_clear.length === 1, "clearTimeout with a number");
ok(tr("const t = setTimeout(function() { ctrl.abort(); }, f.timeoutMs || 5e3);\ntry { await go(); } finally { clearTimeout(t); }").numeric.length === 0, "the abort-timer idiom is not a hit");
ok(tr("let keep;\nkeep = setInterval(() => ping(), 15000);\nreturn new Response(s, { headers: { Connection: \"keep-alive\" } });").numeric.length === 0, "a string that contains the variable's name is not arithmetic");
ok(tr("await new Promise(function (r) { setTimeout(r, 4000); });").kept === 0, "an unkept timer is not counted");
ok(tr("return setTimeout(f, 1);").kept === 1 && tr("timers.push(setTimeout(f, 1));").kept === 1, "returned and pushed timers are counted as kept");
r = scan("const id = setTimeout(f, 10);\nconst next = id + 1;", T0);
ok(r.risks.includes("timer-ids") && r.timer_numeric_use[0] === 2, "a numeric timer use is a risk with its line", r);

// canary eligibility
ok(scan("const p = new WebSocketPair();", T0).canary_eligible === false && scan("const p = new WebSocketPair();", T0).verdict === "clean", "WebSockets: clean for the nodejs default, not a canary");
ok(scan("export class A extends DurableObject {}", T0).canary_eligible === false, "Durable Object code: not a canary");
ok(scan("export default {};", T0 + "[[durable_objects.bindings]]\nname = \"A\"\nclass_name = \"A\"\n").canary_eligible === false, "a Durable Object binding: not a canary");
ok(scan("export default {};", T0 + "[[containers]]\nclass_name = \"A\"\n").canary_eligible === false, "a container worker: not a canary");
ok(scan("export class S extends WorkerEntrypoint {}", T0).rpc_entrypoints.length === 1, "RPC entrypoints are reported for the 2026-04-21 error serialisation default");

// toml facts and helpers
const tf = tomlFacts('# compat-advance: reviewed 2026-10-12\nname = "w"\ncompatibility_date = "2026-10-10"\ncompatibility_flags = ["no_nodejs_compat", "no_nodejs_compat_v2"]\n[env.x]\ncompatibility_date = "2020-01-01"\n');
ok(tf.compatibility_date === "2026-10-10" && tf.marker === "2026-10-12" && tf.nodejs_compat === false && tf.flags.length === 2, "top-level date, flags and the review line", tf);
ok(tomlFacts('[env.x]\ncompatibility_date = "2020-01-01"\n').compatibility_date === null, "a date under a table is not the worker's");
ok(stripComments("a // x\nb /* y\n z */ c").split("\n").length === 3 && !/[xyz]/.test(stripComments("a // x\nb /* y\n z */ c")), "comments are blanked and the line count kept");
ok(stripComments('fetch("x://a/c") // tail') === 'fetch("x://a/c")        ', "the double slash of a URL is not a comment");
ok(blankStrings('a("x-y", `p-q`, `${k - 1}`)') === 'a("", "", `${k - 1}`)', "strings are emptied, an interpolating template kept", blankStrings('a("x-y", `p-q`, `${k - 1}`)'));

// every live worker directory scans without error
// WINDOWS-SUITE-PARITY-1: .pathname gives "/C:/..." on Windows; fileURLToPath gives "C:\...".
const dirs = liveWorkerDirs(fileURLToPath(new URL("../", import.meta.url)));
ok(dirs.length >= 20, "live worker directories found", dirs.length);
let scanned = 0;
for (const d of dirs) {
  try {
    const s = scan(readFileSync(new URL("../" + d + "/worker.js", import.meta.url), "utf8"), readFileSync(new URL("../" + d + "/wrangler.toml", import.meta.url), "utf8"));
    if (s.verdict === "clean" || s.verdict === "review") scanned++;
  } catch (e) { ok(false, d + " scan threw", String(e)); }
}
ok(scanned === dirs.length, "every live worker directory yields a verdict", [scanned, dirs.length]);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
