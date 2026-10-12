// LEASE-TOKEN-CSPRNG-1 (qnfo-deploy-guard 1.3.24) offline suite. No network.
// Proves: lease tokens are drawn from crypto.getRandomValues and never from Math.random (the suite makes Math.random
// throw while tokens are minted); they keep the 16-character [a-z0-9] shape; 2000 draws do not repeat and use the whole
// alphabet.
// Run: node --no-warnings qnfo-deploy-guard/lease-token.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { tok as __tok, VERSION as __v };\n").toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

ok(!/Math\.random\(\)/.test(src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")), "no Math.random call remains in worker.js code");
const realRandom = Math.random;
let usedMathRandom = false;
Math.random = () => { usedMathRandom = true; throw new Error("Math.random used for a lease token"); };
const seen = new Set(), chars = new Set();
let shapeOk = true, threw = null;
try {
  for (let i = 0; i < 2000; i++) { const t = mod.__tok(); if (!/^[a-z0-9]{16}$/.test(t)) shapeOk = false; seen.add(t); for (const c of t) chars.add(c); }
} catch (e) { threw = String(e && e.message || e); } finally { Math.random = realRandom; }
ok(threw === null && !usedMathRandom, "tokens are minted without Math.random", threw);
ok(shapeOk, "every token is 16 characters of [a-z0-9] (the shape callers already store)");
ok(seen.size === 2000, "2000 tokens, no repeat", seen.size);
ok(chars.size === 36, "the whole alphabet is used", chars.size);
const a = String(mod.__v).split("-")[0].split(".").map(Number);
ok(a[0] > 1 || (a[0] === 1 && (a[1] > 3 || (a[1] === 3 && a[2] >= 24))), "VERSION is at least 1.3.24", mod.__v);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
