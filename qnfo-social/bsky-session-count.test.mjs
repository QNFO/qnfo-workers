// BSKY-CREATE-SESSION-COUNT-1 (qnfo-social 0.18.1, agent_issues 100191), offline on node:sqlite. No network.
// Proves: session() counts every createSession call (ok and refused) into metric_history bsky_create_session_24h for the UTC day,
// a cached session adds no count, meets flips at 301, and a missing table is logged, never thrown.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const a = src.indexOf("var SESSION_TTL_MS"), b = src.indexOf("// PROFILE-SYNC-1 (2026-10-01)");
let status = 200;
const fetchStub = async () => new Response(JSON.stringify({ accessJwt: "t", did: "did:x" }), { status });
const mod = new Function("fetch", "BSKY", src.slice(a, b) + "\nreturn { session, countCreateSession, reset: () => { sessionCache = { key: '', at: 0, value: null }; } };")(fetchStub, "https://bsky.invalid/xrpc");
const sq = new DatabaseSync(":memory:");
sq.exec("CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day))");
const D1 = (db) => ({ prepare: (q) => ({ bind: (...v) => ({ run: async () => db.prepare(q).run(...v) }) }) });
const env = { DB: D1(sq), BSKY_HANDLE: "h", BSKY_APP_PASS: "p" };
const row = () => sq.prepare("SELECT value, meets FROM metric_history WHERE metric = 'bsky_create_session_24h' AND day = ?").get(new Date().toISOString().slice(0, 10));
await mod.session(env);
ok(row().value === 1, "a create counts 1", row());
await mod.session(env);
ok(row().value === 1, "a cached session adds no count", row());
mod.reset(); status = 429;
let threw = false; try { await mod.session(env); } catch (_e) { threw = true; }
ok(threw && row().value === 2, "a refused create still counts (it spends the limit)", row());
sq.prepare("UPDATE metric_history SET value = 300").run();
mod.reset(); status = 200; await mod.session(env);
ok(row().value === 301 && row().meets === 0, "meets flips past 300", row());
mod.reset();
const errs = []; const ce = console.error; console.error = (x) => errs.push(x);
await mod.session({ DB: { prepare: () => { throw new Error("no such table: metric_history"); } }, BSKY_HANDLE: "h2" });
console.error = ce;
ok(errs.length === 1 && /bsky-session-count/.test(errs[0]), "a count failure is logged and the session still returns", errs);
console.log(`bsky-session-count: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
