// BINDING-INSTALL-FETCH-1 (1002081), D1-RESULT-CAP-1 (1002018) and W2-J-OBS-2 (1002055) offline suite. No network.
// Slices the worker's own functions out of worker.js and runs them against fakes: a flaky GitHub contents read, the fat-column guard
// and the telemetry count upsert. Run: node qnfo-ops/infra-guards.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const slice = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); if (a < 0 || b < a) throw new Error("slice not found: " + from); return src.slice(a, b); };

// 1. installDeclaredBindings: retry, raw fallback, visible skip.
const ins = slice("async function installDeclaredBindings(env, worker) {", "\n__name(installDeclaredBindings");
const TOML = '[ai]\nbinding = "AI"\n\n[observability]\nenabled = true\n';
const b64 = Buffer.from(TOML).toString("base64");
function makeInstall(fetchImpl) {
  const body = [
    "var fetch = F; function b64Utf8(b) { return Buffer.from(b, 'base64').toString('utf8'); }",
    "function parseDeclaredObservability(t) { return /\\[observability\\]/.test(t) ? { enabled: true } : null; }",
    "function parseDeclaredLimits() { return null; } function parseDeclaredPlacement() { return null; } function parseDeclaredCompat() { return null; }",
    "function sendEmailRestrictions() { return {}; } function secretsStoreBinding() { return null; } async function resolveSecretsStoreBindings() { return { bindings: [], note: null }; }",
    ins, "return installDeclaredBindings;"
  ].join("\n");
  return new Function("F", body)(fetchImpl);
}
const sleeps = [];
const envBase = { BINDING_FETCH_SLEEP: async (ms) => { sleeps.push(ms); } };
{
  const calls = [];
  const run = makeInstall(async (url) => {
    calls.push(url);
    if (calls.length === 1) return { ok: false, status: 502, json: async () => null };
    return { ok: true, status: 200, json: async () => ({ content: b64 }) };
  });
  const out = await run(envBase, "qnfo-ops");
  ok(out.installed === 1 && out.bindings[0].type === "ai" && !out.skipped && out.observability && calls.length === 2, "first read 502 then 200 installs the declared binding", { calls: calls.length, out });
  ok(sleeps[0] === 1000, "the retry waits 1 s first", sleeps);
}
{
  const calls = [];
  const run = makeInstall(async (url) => {
    calls.push(url);
    if (url.startsWith("https://raw.githubusercontent.com/")) return { ok: true, status: 200, text: async () => TOML };
    return { ok: false, status: 502, json: async () => null };
  });
  const out = await run(envBase, "qnfo-ops");
  ok(out.installed === 1 && !out.skipped && calls.filter((u) => u.includes("api.github.com")).length === 3 && calls.some((u) => u.includes("raw.githubusercontent.com/QNFO/qnfo-workers/main/qnfo-ops/wrangler.toml")), "three API failures fall back to raw.githubusercontent.com for the same path", calls);
}
{
  const run = makeInstall(async () => ({ ok: false, status: 502, json: async () => null, text: async () => "" }));
  const out = await run(envBase, "qnfo-ops");
  ok(out.installed === 0 && out.skipped === true && out.note === "wrangler.toml unreadable (502)", "every read failing returns the unreadable note and installs nothing", out);
}
{
  const run = makeInstall(async () => ({ ok: false, status: 404, json: async () => null, text: async () => "" }));
  const out = await run(envBase, "qnfo-x");
  ok(out.installed === 0 && /no wrangler\.toml in the repo/.test(out.note), "a 404 on every directory is the genuine absence", out);
}
ok(/\(bindingInstallSkipped \? " binding_install=skipped" : ""\)/.test(src), "the deployment_history notes carry binding_install=skipped");
ok(/binding_install: bindingInstallSkipped \? "skipped" : "ok"/.test(src) && /binding_install: dep\.binding_install \|\| null/.test(src), "the deploy result and the /ops/deploy log step carry binding_install");

// 2. d1FatColumnGuard.
const guardSrc = slice("var D1_FAT_COLUMNS = ", "\nasync function d1Query(env, args) {");
const guard = new Function(guardSrc + "\nreturn { d1FatColumnGuard, D1_RESULT_TOO_LARGE_RE };")();
const g = guard.d1FatColumnGuard;
ok(g("SELECT ctx FROM code_tasks").ok === false && g("SELECT ctx FROM code_tasks").code === "result_too_large" && /50 MB/.test(g("SELECT ctx FROM code_tasks").error), "an unbounded read of code_tasks.ctx is refused with the stable code");
ok(g("SELECT * FROM code_tasks LIMIT 5000").ok === false, "a large LIMIT on a fat table is refused");
ok(g("SELECT id, status FROM code_tasks").ok === true, "narrow columns of a fat table pass");
ok(g("SELECT ctx FROM code_tasks WHERE id = 'x' LIMIT 1").ok === true, "a bounded read passes");
ok(g("SELECT COUNT(*) FROM chatbox_conversations").ok === true && g("SELECT SUM(length(ctx)) FROM code_tasks").ok === true, "aggregates pass");
ok(g("SELECT id, length(body_md) AS n FROM papers").ok === true, "length() of the fat column passes");
ok(g("SELECT body_md FROM papers").ok === false && g("SELECT * FROM papers").ok === false, "papers.body_md unbounded is refused");
ok(g("SELECT * FROM chatbox_conversations").ok === false, "chatbox_conversations unbounded is refused");
ok(g("SELECT * FROM agent_issues").ok === true, "a table that is not listed passes");
ok(g("INSERT INTO papers VALUES (1)").ok === true, "non-SELECT is left to the other guards");
ok(guard.D1_RESULT_TOO_LARGE_RE.test("D1_ERROR: Query result exceeds the maximum of 50 MB") && !guard.D1_RESULT_TOO_LARGE_RE.test("no such table: x"), "the D1 result-too-large text maps to the code");
ok(/D1-RESULT-CAP-1/.test(src), "the tag D1-RESULT-CAP-1 is in the worker");

// 3. telemetry counts.
const edc = slice("var EDC_FILTERS = ", "\nasync function errorDetailCapture(env, windowMs) {");
const writes = [];
const mkDb = (copiedRows) => ({
  prepare(sql) {
    let a = [];
    const q = { bind(...x) { a = x; return q; }, async all() { return { results: /FROM worker_logs/.test(sql) ? copiedRows : [] }; }, async first() { return /edc_copy_stop/.test(sql) ? { value: "on" } : null; }, __sql: sql, __a: () => a };
    return q;
  },
  async batch(list) { for (const s of list) writes.push({ sql: s.__sql, a: s.__a() }); return []; }
});
const mk = new Function("fetch", "CF_ACCOUNT_ID", "iso", "EDC_BATCH", edc + "\nreturn { edcCountEvents, edcRecordCounts, edcStopSet };");
{
  const reqs = [];
  const f = async (url, init) => { reqs.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ success: true, result: { calculations: [{ aggregates: [{ count: 7, groups: [{ key: "$metadata.service", value: "qnfo-ai" }] }, { count: 2, groups: [{ key: "$metadata.service", value: "qnfo-ops" }] }] }] } }) }; };
  const m = mk(f, "acct", () => "2026-11-09T10:00:00Z", 25);
  const env = { CF_API_TOKEN: "t", QNFO_AUDIT: mkDb([{ s: "qnfo-ai", n: 7 }]) };
  const to = Date.UTC(2026, 10, 9, 10, 50);
  const res = await m.edcRecordCounts(env, to, new Set(["qnfo-ops"]));
  ok(reqs[0].view === "calculations" && reqs[0].parameters.groupBys[0].value === "$metadata.service" && reqs[0].parameters.filters.length === 2, "the second query counts events grouped by service with the same filters", reqs[0]);
  ok(res.ranges === 1 && writes.length === 2, "one row per worker for the hour so far", { res, writes: writes.length });
  const ai = writes.find((w) => w.a[2] === "qnfo-ai"), ops = writes.find((w) => w.a[2] === "qnfo-ops");
  ok(ai.a[0] === "2026-11-09" && ai.a[1] === 10 && ai.a[3] === 7 && ai.a[4] === 7 && ai.a[5] === "on", "platform_events and copied_rows are stored side by side", ai.a);
  ok(ops.a[4] === null && ops.a[5] === "off", "a stopped worker is stored with copy_state off", ops.a);
  const stop = await m.edcStopSet({ QNFO_AUDIT: mkDb([]) });
  ok(stop instanceof Set, "the stop set is a Set and fails open");
}
{
  const m = mk(async () => ({ ok: false, status: 500, json: async () => null }), "acct", () => "x", 25);
  const res = await m.edcRecordCounts({ CF_API_TOKEN: "t", QNFO_AUDIT: mkDb([]) }, Date.UTC(2026, 10, 9, 10, 50), new Set());
  ok(res.ranges === 0 && res.error, "an unusable counts answer writes nothing");
}
ok(/telemetry_event_counts/.test(src), "the table name telemetry_event_counts is in the worker");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
