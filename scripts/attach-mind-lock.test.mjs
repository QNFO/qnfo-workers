// ATTACH-MIND-LOCK-1: runs scripts/attach_mind_q08_route_lock_test.py (python3, stdlib, no network) from the suite runner,
// because the python script tests are listed one by one in deploy-gate.yml and this one needs no workflow edit.
// Run: node --no-warnings scripts/attach-mind-lock.test.mjs   -> prints "N passed, 0 failed"
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(x).slice(0, 600) : "")); } };
const py = fileURLToPath(new URL("./attach_mind_q08_route_lock_test.py", import.meta.url));
const r = spawnSync("python3", ["-I", py], { encoding: "utf8", env: { ...process.env, CLOUDFLARE_API_TOKEN: "x" } });
ok(r.status === 0, "the python suite exits 0", (r.stdout || "") + (r.stderr || ""));
ok(/all passed/.test(r.stdout || ""), "the python suite prints 'all passed'", r.stdout);
const g = spawnSync("python3", [fileURLToPath(new URL("./secret-mutation-guard.py", import.meta.url))], { encoding: "utf8" });
ok(g.status === 0, "secret-mutation-guard still passes with the real lock client", g.stdout);
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
