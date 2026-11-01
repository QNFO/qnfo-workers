// ERRATA-CONFIRM-COST-1 (0.34.0): the internal-errata confirm block, run offline against fakes.
// Proves: PAPER-LEARN-1 findings go to deepseek first and kimi second, reviser findings to gpt-oss then kimi; the excerpt is
// at most 24k chars; ops_config errata_confirm_max sets the batch (clamped to 48); the folded copy equals the errata-hub source.
// Run: node qnfo-research-exec/errata-confirm-cost.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8").replace(/\r\n/g, "\n");
const hub = readFileSync(join(here, "..", "errata-hub", "worker.js"), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const block = (s) => s.slice(s.indexOf("// ---- ERRATA-INTERNAL-CONFIRM-1:BEGIN"), s.indexOf("// ---- ERRATA-INTERNAL-CONFIRM-1:END"));
const code = block(src);
ok(code.length > 1000 && code === block(hub), "the folded confirm block equals the errata-hub source");
const mod = new Function(code + "\nreturn { confirmInternalErrata, logConfirmDefer, confirmReplyText, internalConfirmModels, confirmExcerpt, confirmRunInput, CONFIRM_EXCERPT_MAX };")();

{
  const events = [];
  const env = { QNFO_AUDIT: { prepare(sql) { return { bind(...args) { return { async run() { events.push({ sql, args }); } }; } }; } } };
  await mod.logConfirmDefer(env, { id: 17 }, "unreadable verdict");
  await mod.logConfirmDefer(env, { id: 18 }, "x".repeat(600));
  ok(events.every(({ sql }) => /cloud_ops_events \(id, ts, kind, job, text\)/.test(sql)), "defer inserts include the event id");
  ok(events.every(({ args }) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args[0])) && events[0].args[0] !== events[1].args[0], "each defer event receives a distinct UUID");
  ok(events.every(({ args }) => new Date(args[1]).toISOString() === args[1]), "defer timestamps are ISO UTC");
  ok(events[0].args[2] === "queue row 17: unreadable verdict" && events[1].args[2].length === 450, "defer text retains context and its length bound");
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    await mod.logConfirmDefer({ QNFO_AUDIT: { prepare() { throw new Error("D1 unavailable"); } } }, { id: 17 }, "retry");
  } finally { console.error = realError; }
  ok(errors.some((e) => e.includes("defer event write failed: D1 unavailable")), "a failed defer insert remains explicitly logged");
  for (const source of [src, hub]) {
    const inserts = [...source.matchAll(/INSERT(?: OR \w+)? INTO cloud_ops_events\s*\(([^)]+)\)/g)];
    ok(inserts.length > 0 && inserts.every((m) => m[1].split(",").some((column) => column.trim() === "id")), "all cloud_ops_events writers in each touched worker supply id");
  }
}

ok(mod.CONFIRM_EXCERPT_MAX === 24000, "the excerpt is 24k chars");
ok(mod.confirmExcerpt("x".repeat(100000), "").length === 24000, "a long body is cut to the excerpt");
const pl = mod.internalConfirmModels("qnfo-lifecycle PAPER-LEARN-1");
ok(/deepseek/.test(pl[0]) && /kimi/.test(pl[1]), "a PAPER-LEARN-1 finding is checked by deepseek, then kimi", pl);
const rv = mod.internalConfirmModels("qnfo-paper-reviser");
ok(/gpt-oss/.test(rv[0]) && /kimi/.test(rv[1]), "a reviser finding is checked by gpt-oss, then kimi", rv);
ok(mod.confirmRunInput("@cf/deepseek-ai/deepseek-v4-flash-0731", "p").chat_template_kwargs.thinking === false, "deepseek runs with thinking off");
ok(mod.confirmReplyText({ reasoning: '{"confirmed": true}' }) === '{"confirmed": true}', "a reasoning-only verdict is available to the JSON parser");
ok(mod.confirmReplyText({ output_text: '{"confirmed": false}' }) === '{"confirmed": false}', "output_text verdicts are read");

function mkEnv(cfg, rows, aiReply) {
  const calls = { ai: [], updates: [], limit: null };
  const stmt = (sql) => {
    const s = { args: [], bind(...a) { s.args = a; return s; },
      async first() {
        if (/FROM ops_config/.test(sql)) return cfg == null ? null : { value: String(cfg) };
        if (/FROM papers/.test(sql)) return { slug: "p1", title: "P", body_md: "The paper text. ".repeat(4000) };
        return null;
      },
      async all() { if (/FROM errata_queue/.test(sql)) { calls.limit = s.args[1]; return { results: rows.slice(0, s.args[1]) }; } return { results: [] }; },
      async run() { if (/^UPDATE/.test(sql)) calls.updates.push(s.args); return {}; } };
    return s;
  };
  const db = { prepare: stmt };
  return { calls, env: { WATCH_DB: db, QNFO_AUDIT: db, PAPERS_DB: db, AI: { async run(m, input) { calls.ai.push({ m, len: input.messages[0].content.length }); return aiReply(m); } } } };
}
const rows = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, sender: "qnfo-lifecycle PAPER-LEARN-1", subject: "e" + i, paper_doi: "p1", claim: "claim" }));

{
  const { env, calls } = mkEnv(null, rows, () => ({ choices: [{ message: { content: '{"confirmed": true, "why": "quoted"}' } }] }));
  const out = await mod.confirmInternalErrata(env);
  ok(calls.limit === 12 && out.max === 12 && out.confirmed === 12, "no setting: 12 rows a tick, all settled", out);
  ok(calls.ai.every((c) => /deepseek/.test(c.m)), "a readable deepseek verdict needs no kimi call", calls.ai.map((c) => c.m));
  ok(out.models["@cf/deepseek-ai/deepseek-v4-flash-0731"] === 12, "the settling model is recorded", out.models);
  ok(calls.ai.every((c) => c.len < 26000), "each prompt carries at most the 24k excerpt plus the frame", calls.ai[0]);
}
{
  const { env, calls } = mkEnv(30, rows, () => ({ choices: [{ message: { content: '{"confirmed": false, "why": "no"}' } }] }));
  const out = await mod.confirmInternalErrata(env);
  ok(calls.limit === 30 && out.rejected === 30, "errata_confirm_max 30 takes 30 rows", out);
}
{
  const { env, calls } = mkEnv(500, rows, () => ({ choices: [{ message: { content: '{"confirmed": true}' } }] }));
  await mod.confirmInternalErrata(env);
  ok(calls.limit === 48, "errata_confirm_max is clamped to 48", calls.limit);
}
{
  const { env, calls } = mkEnv(2, rows, (m) => /deepseek/.test(m) ? { choices: [{ message: { content: "" } }] } : { response: '{"confirmed": true, "why": "k"}' });
  const out = await mod.confirmInternalErrata(env);
  ok(out.confirmed === 2 && calls.ai.filter((c) => /kimi/.test(c.m)).length === 2, "an unreadable deepseek reply falls back to kimi", { out, ai: calls.ai.map((c) => c.m) });
}
{
  const { env, calls } = mkEnv(2, rows, () => ({ reasoning: '{"confirmed": true, "why": "reasoning-channel verdict"}' }));
  const out = await mod.confirmInternalErrata(env);
  ok(out.confirmed === 2 && calls.ai.length === 2, "a JSON verdict in the reasoning field settles without the more expensive fallback", { out, calls: calls.ai });
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
