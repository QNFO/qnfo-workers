// CLEARED-SEND-RETRY-1 offline suite (qnfo-email-orchestrator 0.5.3): a reply cleared for auto-send whose send fails keeps
// its "cleared for auto-send" marker with a try count, so the next run retries it; after CLEARED_SEND_MAX_TRIES it is left
// escalated with the last status. Row 56 dead-ended on a 401 on 2026-10-05 because the failure overwrote the marker.
// Run: node qnfo-email-orchestrator/send-retry.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const max = src.match(/var CLEARED_SEND_MAX_TRIES = (\d+);/);
const a = src.indexOf("  async draftOne(env, row, dry) {"), b = src.indexOf("  async cheapClassify(env, row) {");
if (!max || a < 0 || b < a) throw new Error("CLEARED-SEND-RETRY-1 block not found in worker.js");
const ctx = vm.createContext({ CLEARED_SEND_MAX_TRIES: Number(max[1]), Date, Number, String, JSON, console });
const mod = vm.runInContext("({" + src.slice(a, b) + "})", ctx, { filename: "qnfo-email-orchestrator/worker.js#draftOne" });

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("FAIL " + msg); } };
const writes = [];
const env = (status) => ({
  EMAIL: { fetch: async () => ({ ok: status === 200, status, json: async () => ({}) }) },
  AUDIT_DB: { prepare(sql) { return { bind(...args) { return { run: async () => { writes.push({ sql, args }); return {}; }, first: async () => null }; } }; } }
});
const row = (skip) => ({ qid: 56, decision: "escalate", skip_reason: skip, draft_text: "Thank you, happy to talk.", sender: "team@example.org", subject: "Podcast", email_id: 926 });
const last = () => writes[writes.length - 1].args;

let r = await mod.draftOne(env(401), row("cleared for auto-send"), false);
ok(r.action === "escalate" && r.tries === 1, "first 401 escalates with try 1");
ok(/^cleared for auto-send; send-failed:401 x1 /.test(last()[1]), "first failure keeps the auto-send marker");
r = await mod.draftOne(env(401), row(last()[1]), false);
ok(r.tries === 2 && /^cleared for auto-send; send-failed:401 x2 /.test(last()[1]), "second failure still keeps the marker (retried)");
r = await mod.draftOne(env(401), row(last()[1]), false);
ok(r.tries === 3 && last()[1] === "cleared-send-failed:401 x3", "third failure drops the marker: left for a person");
r = await mod.draftOne(env(200), row("cleared for auto-send; send-failed:401 x1 2026-10-05T16:30:30Z"), false);
ok(r.action === "sent" && last()[0] === "sent" && last()[1] === "cleared-draft-sent", "a retry that succeeds is recorded sent");
r = await mod.draftOne(env(200), row("cleared for auto-send"), true);
ok(r.action === "would-send", "dry run never sends");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
