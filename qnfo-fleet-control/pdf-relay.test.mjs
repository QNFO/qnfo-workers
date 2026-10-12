// qnfo-fleet-control pdf-relay.test.mjs: PDF-BACKLOG-RELAY-1 (0.19.0, agent_issues 2410).
// The */20 tick relays qnfo-pdf's SCHOLAR-PDF-ALL-1 batch through the SVC_QNFO_PDF service binding only while no
// pdf-backlog event (cron or relay) has landed for PDF_RELAY_QUIET_MIN minutes, and writes one ledger row per decision.
// Output MUST contain "0 failed" on success.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const start = src.indexOf("var PDF_RELAY_QUIET_MIN");
const end = src.indexOf("// ---- CHARTER-LOOP-1:BEGIN");
if (start < 0 || end < 0 || end < start) { console.error("pdf-relay.test: PDF-BACKLOG-RELAY-1 block not found"); process.exit(1); }
const sandbox = { console, Date, JSON, Math, Number, String, Promise, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end) + "\n__export = { pdfBacklogRelay, PDF_RELAY_QUIET_MIN };", sandbox, { filename: "pdf-relay-block.js" });
const { pdfBacklogRelay, PDF_RELAY_QUIET_MIN } = sandbox.__export;

let passed = 0, failed = 0;
const eq = (a, b, msg) => { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; console.log("FAIL", msg, "got", JSON.stringify(a), "want", JSON.stringify(b)); } };

function fakeEnv(lastTs, fetchImpl) {
  const writes = [];
  const audit = {
    prepare(sql) {
      return {
        bind(...params) { return { run: async () => { writes.push({ sql, params }); return {}; } }; },
        first: async () => ({ ts: lastTs }),
      };
    },
  };
  const env = { AUDIT: audit, SVC_QNFO_PDF: fetchImpl ? { fetch: fetchImpl } : undefined };
  return { env, writes };
}
const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

// 1. a recent pdf-backlog event (the cron works): the relay stays idle
{
  let called = 0;
  const { env, writes } = fakeEnv(new Date(Date.now() - 5 * 60000).toISOString(), async () => { called++; return jsonResponse(200, {}); });
  const out = await pdfBacklogRelay(env);
  eq(out.ran, false, "idle when the last pdf-backlog event is 5 minutes old");
  eq(called, 0, "no service-binding call while idle");
  eq(/^pdf-backlog event \d+ min ago$/.test(out.skipped), true, "the skip reason names the age");
  eq(writes.length, 0, "an idle tick writes no ledger row (72 a day would be noise; the cron's own pdf-backlog rows are the record)");
}
// 2. no event for longer than the quiet window: the relay calls POST /backlog/tick and records the batch
{
  let seen = null;
  const { env, writes } = fakeEnv(new Date(Date.now() - (PDF_RELAY_QUIET_MIN + 1) * 60000).toISOString(), async (url, init) => { seen = { url, method: init && init.method }; return jsonResponse(200, { rendered: 6, backlog_after: 470, errors: [] }); });
  const out = await pdfBacklogRelay(env);
  eq(out.ran, true, "relays once the last event is older than the quiet window");
  eq(seen, { url: "https://qnfo-pdf/backlog/tick?budget_ms=60000", method: "POST" }, "POST to the service-binding hostname (PDF-RENDER-INTERNAL-1 form)");
  eq([out.rendered, out.backlog_after, out.http], [6, 470, 200], "the batch result is carried");
  eq(writes[0].params[2].includes('"ran":true'), true, "the ledger meta carries the result");
  eq(/relayed one SCHOLAR-PDF-ALL-1 batch: rendered 6, backlog 470/.test(writes[0].params[1]), true, "the ledger text names the batch");
}
// 3. never ran (no event at all): relays
{
  const { env } = fakeEnv(null, async () => jsonResponse(200, { rendered: 0, backlog_after: 476, errors: [] }));
  eq((await pdfBacklogRelay(env)).ran, true, "no pdf-backlog event ever: the relay runs");
}
// 4. the callee refuses or fails: the ledger row is an error, nothing throws
{
  const { env, writes } = fakeEnv(null, async () => jsonResponse(403, { ok: false, error: "forbidden" }));
  const out = await pdfBacklogRelay(env);
  eq([out.ran, out.http, out.error], [false, 403, "http 403"], "a 403 is recorded as an error, not thrown");
  eq(writes[0].params[3], "error", "the ledger row is status error");
}
{
  const { env, writes } = fakeEnv(null, async () => { throw new Error("binding unavailable"); });
  const out = await pdfBacklogRelay(env);
  eq([out.ran, out.error], [false, "binding unavailable"], "a thrown fetch is recorded");
  eq(writes.length, 1, "and still gets its ledger row");
}
// 5. no binding: skipped without a D1 read
{
  const { env, writes } = fakeEnv(null, null);
  const out = await pdfBacklogRelay(env);
  eq(out.skipped, "no SVC_QNFO_PDF binding", "no binding: skipped");
  eq(writes.length, 0, "no ledger row before the binding exists");
}
eq(PDF_RELAY_QUIET_MIN, 25, "quiet window is 25 minutes (two cron ticks and a half)");

console.log(`pdf-relay.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
