// EMAIL-ORCH-FOLD-1 (qnfo-cloud-ops 1.20.0, agent_issues 1756) offline suite. No network, synthetic data.
// Proves: the qnfo-email-orchestrator code runs unchanged as the member emailOrchMod (only its version constant differs);
// on the single */10 tick it runs four times an hour (:00, :20, :30, :50, like its old */15 cron) and its metrics step at
// :00 of every third UTC hour (its old "0 */3 * * *"); it gets the host's qnfo-audit and qnfo-outreach bindings under its
// own names and DRY_RUN "false"; it still writes its heartbeat as qnfo-email-orchestrator with the member version; the
// tick path runs it; /email-orch/health serves its health and its /run/* routes are not reachable; the EMAIL binding
// declares props.caller.
// Run: node qnfo-cloud-ops/email-orch-fold.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, existsSync } from "node:fs";
const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const guest = readFileSync(new URL("../qnfo-email-orchestrator/worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { emailOrchMod as __member, emailOrchCrons as __crons, runEmailOrchMember as __run, EMAIL_ORCH_VERSION as __mv, VERSION as __hv };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

// 1. the member is the orchestrator's code
{
  const lines = guest.split("\n");
  const body = lines.slice(lines.findIndex((l) => l.startsWith('var VERSION = "0.5.3-send-retry";')), lines.indexOf("export {"));
  const missing = body.filter((l) => l.trim() && !src.includes(l.trim()));
  ok(missing.length === 1 && missing[0].startsWith("var VERSION = "), "every orchestrator line is in the host except its VERSION line", missing.map((l) => l.slice(0, 60)));
  ok(/^1\.20\.0/.test(mod.__hv) && mod.__mv === "0.5.4-folded", "host 1.20.0, member 0.5.4-folded", [mod.__hv, mod.__mv]);
  ok((src.match(/var VERSION = "/g) || []).length === 1, "one quoted VERSION constant in the bundle");
}

// 2. cadence on the */10 tick
{
  const at = (h, m) => Date.UTC(2026, 9, 6, h, m, 7);
  const c = (h, m) => mod.__crons(at(h, m)).join(",");
  ok(c(6, 0) === "0 */3 * * *,*/15 * * * *", "06:00 UTC runs the metrics and the reply/SLA step", c(6, 0));
  ok(c(6, 10) === "" && c(6, 40) === "", ":10 and :40 run nothing");
  ok(c(6, 20) === "*/15 * * * *" && c(6, 30) === "*/15 * * * *" && c(6, 50) === "*/15 * * * *", ":20, :30, :50 run the reply/SLA step");
  ok(c(7, 0) === "*/15 * * * *" && c(9, 0).startsWith("0 */3"), "the metrics step only at :00 of every third hour");
  let perHour = 0, perDay = 0;
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 10) { const x = mod.__crons(at(h, m)); if (h === 6) perHour += x.filter((y) => y === "*/15 * * * *").length; perDay += x.filter((y) => y === "0 */3 * * *").length; }
  ok(perHour === 4 && perDay === 8, "four reply/SLA runs an hour, eight metrics runs a day (as the old crons)", [perHour, perDay]);
}

// 3. the member runs with the host's bindings under its own names
{
  const writes = [];
  const stmt = (db) => (sql) => { let a = []; const s = { bind(...x) { a = x; return s; }, async run() { writes.push({ db, sql, a }); return { success: true, meta: { changes: 0 } }; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
  let emailCalls = 0;
  const env = { AUDIT: { prepare: stmt("audit") }, OUTREACH: { prepare: stmt("outreach") }, EMAIL: { async fetch() { emailCalls++; return new Response("{}", { status: 200 }); } }, AI: { async run() { return { response: "x" }; } } };
  const ran = await mod.__run(env, { waitUntil() {} }, Date.UTC(2026, 9, 6, 6, 0, 3));
  const hb = writes.filter((w) => /INSERT INTO fleet_heartbeat/.test(w.sql));
  ok(ran.length === 2 && hb.length === 2 && hb.every((w) => w.db === "audit" && w.a[0] === "qnfo-email-orchestrator" && w.a[1] === "0.5.4-folded"), "both member runs write the heartbeat as qnfo-email-orchestrator 0.5.4-folded into qnfo-audit", hb.map((w) => [w.db, w.a[0], w.a[1]]));
  ok(emailCalls === 0, "an empty queue sends nothing");
  const none = await mod.__run(env, { waitUntil() {} }, Date.UTC(2026, 9, 6, 6, 10, 3));
  ok(none.length === 0, "a :10 tick does not run the member");
}

// 4. host wiring: tick path, health route, no /run routes, props
ok(/runs\.push\(runEmailOrchMember\(env, ctx, at\)\);\n\s*for \(const d of tickDue\(AMS_SCHEDULE, at\)\)/.test(src), "the */10 tick path runs the member alongside the due jobs");
{
  const env = { OUTREACH: { prepare: () => { const s = { bind: () => s, first: async () => ({ c: 3 }) }; return s; } }, EMAIL: {}, AUDIT: {} };
  const r = await mod.default.fetch(new Request("https://qnfo-cloud-ops.q08.workers.dev/email-orch/health"), env, {});
  const j = await r.json();
  ok(r.status === 200 && j.version === "0.5.4-folded" && j.db === "ok (3 rows)" && j.email_service === "bound", "/email-orch/health serves the member's health with the mapped bindings", j);
  let reached = false;
  const env2 = Object.assign({}, env, { EMAIL: { async fetch() { reached = true; return new Response("{}"); } } });
  const r2 = await mod.default.fetch(new Request("https://qnfo-cloud-ops.q08.workers.dev/email-orch/run/replies?mode=live"), env2, {});
  ok(r2.status !== 200 && !reached, "the member's /run routes are not reachable through the host", r2.status);
}
ok(/binding = "EMAIL"\nservice = "qnfo-email"\n(#[^\n]*\n)*props = \{ caller = "qnfo-cloud-ops" \}/.test(toml), "the EMAIL binding declares props.caller");
ok(!/crons = \[[^\]]*\*\/15/.test(toml), "no extra cron is added (CRON-SINGLE-TRIGGER-1)");
ok(existsSync(new URL("../qnfo-email-orchestrator/FOLDED", import.meta.url)), "qnfo-email-orchestrator carries a FOLDED marker");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
