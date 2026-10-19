// OPS-RESEARCH-KICK-1 (qnfo-ops 2.51.0, agent_issues 100187), offline. No network.
// Proves: the tool is declared, dispatched, named in the prompt's tool list and audited; researchKick posts /run?sync=1 to an internal
// host on the CH_QNFO_RESEARCH_EXEC binding (so RUN-INTERNAL-1 admits it), maps 409 to busy, mode deferred drops ?sync=1, and a
// missing binding or a thrown fetch is reported, not thrown.
// ADVERSARIAL: does not prove the deployed binding answers; the live proof is a cloud_ops_events kind kick or a research stage row
// written right after an ops job that called the tool.
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
ok(/\{ name: "ops_research_kick", description:/.test(src), "tool declared in OPS_TOOLS");
ok(/else if \(name === "ops_research_kick"\) res = await researchKick\(env, args\);/.test(src), "tool dispatched in execTool");
ok(/ops_research_kick: "completed",/.test(src), "tool recorded in AUDIT_TRAIL_ACTIONS");
ok(/Tools: [^\n]*ops_research_kick/.test(src), "tool named in the system prompt's tool list");
ok(/binding = "CH_QNFO_RESEARCH_EXEC"\nservice = "qnfo-research-exec"/.test(readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8")), "wrangler.toml declares the binding");
const a = src.indexOf("var RESEARCH_KICK_TIMEOUT_MS"), b = src.indexOf("async function triggerBacklog(");
const researchKick = new Function(src.slice(a, b) + "\nreturn researchKick;")();
const calls = [];
const env = (status, body, thrown) => ({ CH_QNFO_RESEARCH_EXEC: { fetch: async (url, init) => { calls.push({ url, method: init.method }); if (thrown) throw new Error(thrown); return new Response(JSON.stringify(body), { status }); } } });
let r = await researchKick(env(200, { ok: true, version: "0.9.x", out: { stage: "draft" } }), {});
ok(calls[0].url === "https://ch_qnfo_research_exec.internal/run?sync=1" && calls[0].method === "POST", "sync posts /run?sync=1 on an internal host", calls[0]);
ok(!/\.workers\.dev|qnfo\.org/.test(new URL(calls[0].url).hostname), "host is not public (RUN-INTERNAL-1 admits it)");
ok(r.ok && !r.busy && r.out.stage === "draft" && r.mode === "sync", "a stage result is returned", r);
r = await researchKick(env(409, { busy: true, note: "another run holds the single-flight lease" }), {});
ok(r.ok && r.busy && r.http === 409, "409 maps to busy, not an error", r);
r = await researchKick(env(202, { accepted: true, note: "deferred" }), { mode: "deferred" });
ok(calls[2].url === "https://ch_qnfo_research_exec.internal/run" && r.mode === "deferred", "deferred drops ?sync=1", calls[2]);
r = await researchKick(env(403, { error: "forbidden" }), {});
ok(!r.ok && r.http === 403 && r.out === "forbidden", "a refusal is reported with its text", r);
r = await researchKick(env(0, null, "network down"), {});
ok(!r.ok && r.error === "network down", "a thrown fetch is reported", r);
r = await researchKick({}, {});
ok(!r.ok && /binding/.test(r.error), "missing binding reported", r);
console.log(`research-kick: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
