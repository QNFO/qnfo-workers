// CRYPTO-IDS-1: row ids come from crypto.getRandomValues (rhex), never Math.random.
// Run: node personal-api/crypto-ids.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !/^var VERSION/.test(l)).join("\n");
ok(!/Math\.random\(\)/.test(code), "no Math.random() call remains in worker code");
const m = src.match(/function rhex\(n\) \{[^\n]*\}/);
ok(!!m, "the rhex helper exists");
const rhex = new Function("crypto", m[0] + "; return rhex;")(globalThis.crypto);
for (const n of [1, 6, 8, 12]) ok(new RegExp("^[0-9a-f]{" + n + "}$").test(rhex(n)), "rhex(" + n + ") is " + n + " lowercase hex chars: " + rhex(n));
ok(new Set(Array.from({ length: 500 }, () => rhex(8))).size === 500, "500 ids of 8 hex chars do not collide");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
