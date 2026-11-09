// PAPER-PIDS-PIN-2 (#9790): pinPaperVersion pins once, flags drift, never updates a pin. Run: node qnfo-gateway/paper-version-pin.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").split(String.fromCharCode(13)).join("");
const i = src.indexOf("async function pinPaperVersion"), j = src.indexOf("async function handlePaperVersion");
if (i < 0 || j < i) throw new Error("block not found");
const sb = {};
vm.createContext(sb);
vm.runInContext(src.slice(i, j) + "\n;__x = { pinPaperVersion };", sb);
const { pinPaperVersion } = sb.__x;
let fail = 0;
const ok = (c, m, x) => { if (!c) { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const pins = new Map(), drift = [], sqls = [];
const AUDIT = { prepare(sql) { sqls.push(sql); return { bind(...a) { return {
  async first() { const v = pins.get(a[0] + "|" + a[1]); return v ? { sha256: v } : null; },
  async run() { if (/INTO paper_version_pins/.test(sql)) { const k = a[0] + "|" + a[1]; if (!pins.has(k)) pins.set(k, a[2]); } else if (/INTO paper_version_drift/.test(sql)) drift.push(a); return {}; },
}; } }; } };
const env = { AUDIT };
ok(await pinPaperVersion(env, "s", "1.0", "aaa") === "pinned", "first serve pins");
ok(await pinPaperVersion(env, "s", "1.0", "aaa") === "pinned", "same hash stays pinned");
ok(await pinPaperVersion(env, "s", "1.0", "bbb") === "drifted", "a different hash is drifted");
ok(drift.length === 1 && drift[0][2] === "aaa" && drift[0][3] === "bbb", "one drift row names both hashes", drift);
ok(pins.get("s|1.0") === "aaa", "the pin is never updated");
ok(!sqls.some((q) => /UPDATE\s+paper_version_pins/i.test(q)), "no UPDATE statement on the pin table");
ok(await pinPaperVersion({}, "s", "1.0", "aaa") === "unpinned", "no AUDIT binding is unpinned, not an error");
ok(await pinPaperVersion({ AUDIT: { prepare() { throw new Error("x"); } } }, "s", "2.0", "aaa") === "unpinned", "a D1 failure is unpinned");
ok(/"X-Content-Pin-Status": pinStatus/.test(src), "the header is sent");
console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
