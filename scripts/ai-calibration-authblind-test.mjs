// AUTHBLIND-1: when qnfo-ai rejects QNFO_ROUTER_KEY, calibration must not file roster-drift
// or mark models failing; it files one "router key rejected" issue. With a valid key it stays quiet.
import fs from "node:fs";
const src = fs.readFileSync(new URL("../qnfo-ai-calibration/worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
async function run(authed) {
  const writes = [];
  const db = { prepare(sql) { return { bind(...a) { this.a = a; return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { writes.push(sql + " " + JSON.stringify(this.a || [])); return {}; } }; }, async batch() { return []; } };
  const ok = (o) => new Response(JSON.stringify(o), { status: 200 });
  const ai = { async fetch(url, init) {
    if (url.endsWith("/health")) return ok({ status: "ok", version: "t" });
    if (url.endsWith("/v1/models")) return authed ? ok({ data: [{ id: "kimi-k2.6", _router: { ctx: 1 } }] }) : ok({ data: [{ id: "qnfo" }] });
    return new Response("{}", { status: authed ? 200 : 401 });
  } };
  const env = { QNFO_AUDIT: db, QNFO_AI: ai, QNFO_OPS: ai, PT_API: ai, QNFO_ROUTER_KEY: "k" };
  await mod.default.scheduled({}, env, { waitUntil() {} });
  return writes;
}
const bad = await run(false);
const good = await run(true);
const failing = (w) => w.filter((s) => /ai_model_health/.test(s) && /failing/.test(s)).length;
const hasIssue = (w) => w.some((s) => /INSERT INTO issue_ledger/.test(s) && /router key rejected/.test(s));
const drift = (w) => w.filter((s) => /INSERT INTO issue_ledger/.test(s) && /roster drift/.test(s)).length;
if (failing(bad) !== 0) throw new Error("models marked failing under auth failure");
if (!hasIssue(bad)) throw new Error("no router-key issue filed under auth failure");
if (drift(bad) !== 0) throw new Error("false roster-drift issues filed under auth failure");
if (hasIssue(good)) throw new Error("router-key issue filed despite valid key");
console.log("authblind ok (bad-key writes:", bad.length, "good-key writes:", good.length + ")");
