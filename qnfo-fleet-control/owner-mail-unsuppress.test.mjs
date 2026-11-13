// OWNER-MAIL-UNSUPPRESS-1: the owner's address is cleared from Cloudflare's Email Sending suppression list when it is a bounce, never a
// complaint, never anyone else. Run: node qnfo-fleet-control/owner-mail-unsuppress.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- OWNER-MAIL-UNSUPPRESS-1:BEGIN"), src.indexOf("// ---- OWNER-MAIL-UNSUPPRESS-1:END"));
const sb = { console, AbortSignal, JSON, String, Array };
vm.createContext(sb);
vm.runInContext(block + "\n__x = { ownerMailUnsuppressTick };", sb);
let fails = 0;
const check = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const mk = (rows) => { const calls = []; const f = async (u, i) => { calls.push((i && i.method || "GET") + " " + u.replace(/^.*suppressions/, "")); return { status: 200, json: async () => (i && i.method === "DELETE" ? { success: true } : { success: true, result: rows }) }; }; return { f, calls }; };
const rows = [
  { id: "a", email: "rwnquni@outlook.com", reason: "soft_bounce" },
  { id: "b", email: "RWNQUNI@gmail.com", reason: "hard_bounce" },
  { id: "c", email: "rwnquni@outlook.com", reason: "complaint" },
  { id: "d", email: "someone@berkeley.edu", reason: "hard_bounce" }
];
let m = mk(rows);
let r = await sb.__x.ownerMailUnsuppressTick({ CF_API_TOKEN: "t" }, m.f);
check(r.cleared.length === 2 && m.calls.includes("DELETE /a") && m.calls.includes("DELETE /b"), "T1 owner bounces are deleted");
check(!m.calls.some((c) => c.endsWith("/c") || c.endsWith("/d")), "T2 a complaint and a stranger are never deleted");
check(r.kept[0] === "complaint", "T3 the kept complaint is reported");
r = await sb.__x.ownerMailUnsuppressTick({}, m.f);
check(r.error === "no CF_API_TOKEN", "T4 no token is reported, not thrown");
r = await sb.__x.ownerMailUnsuppressTick({ CF_API_TOKEN: "t" }, async () => ({ status: 403, json: async () => ({ success: false, errors: [{ message: "forbidden" }] }) }));
check(/forbidden/.test(r.error), "T5 a refused list is reported with its reason");
if (fails) process.exit(1);
