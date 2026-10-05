// AI-STAGE-ATTRIBUTION-1 offline suite (qnfo-research-exec 0.9.62, #1795/#1780): Workers AI counter rows carry the
// pipeline stage, and nothing else about the AI call changes (same model, same input, same result, fail-soft).
// Run: node qnfo-research-exec/stage-attr.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d) : "")); } };

// Every stage function labels its calls on entry.
for (const st of ["Ground", "Ensemble", "Reconcile", "Review", "Revise", "Verify"]) {
  const re = new RegExp("async function stage" + st + "\\(env, row\\) \\{\\n  __AI_ATTR_STAGE = \"" + st.toLowerCase() + "\";");
  ok(re.test(src), "stage" + st + " sets its label on entry");
}

// Evaluate the real wrapper from the source.
const a = src.indexOf("var __AI_ATTR_RATES");
const b = src.indexOf("var WORKER = ");
const body = src.slice(a, b);
const mk = new Function(body + "\nreturn { wrap: __aiAttrEnv, setStage: function (s) { __AI_ATTR_STAGE = s; } };");
const W = mk();

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))");
const D1 = { prepare(sql) { let args = []; const q = { bind(...x) { args = x; return q; }, async run() { db.prepare(sql).run(...args); return {}; } }; return q; } };
const seen = [];
const AI = { async run(model, input) { seen.push({ model, input }); if (input && input.boom) throw new Error("boom"); return { response: "ok:" + model, usage: { prompt_tokens: 1000, completion_tokens: 100 } }; } };
const env = W.wrap({ AI, QNFO_AUDIT: D1 }, "qnfo-research-exec", "AI", "QNFO_AUDIT");

const r0 = await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [{ role: "user", content: "x" }] });
W.setStage("ensemble");
const r1 = await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [{ role: "user", content: "y" }] });
await env.AI.run("@cf/zai-org/glm-5.3-flash", { messages: [{ role: "user", content: "z" }] });
W.setStage("verify");
let threw = false;
try { await env.AI.run("@cf/openai/gpt-oss-120b", { boom: 1 }); } catch (e) { threw = true; }

const rows = db.prepare("SELECT purpose, model, calls, errors, neurons FROM ai_call_counters ORDER BY purpose").all();
const by = Object.fromEntries(rows.map((r) => [r.purpose + "|" + r.model, r]));
ok(by["binding|@cf/zai-org/glm-5.3-flash"] && by["binding|@cf/zai-org/glm-5.3-flash"].calls === 1, "a call outside any stage keeps purpose 'binding'", rows);
ok(by["binding:ensemble|@cf/zai-org/glm-5.3-flash"] && by["binding:ensemble|@cf/zai-org/glm-5.3-flash"].calls === 2, "calls in a stage are counted under binding:<stage>", rows);
ok(by["binding:ensemble|@cf/zai-org/glm-5.3-flash"].neurons > 0, "neurons are still computed per stage row");
ok(by["binding:verify|@cf/openai/gpt-oss-120b"] && by["binding:verify|@cf/openai/gpt-oss-120b"].errors === 1 && threw, "a failing call is counted as an error and still throws to the caller", rows);
ok(r0.response === "ok:@cf/zai-org/glm-5.3-flash" && r1.response === "ok:@cf/zai-org/glm-5.3-flash", "the AI result is returned unchanged");
ok(seen.length === 4 && seen[1].model === "@cf/zai-org/glm-5.3-flash" && seen[1].input.messages[0].content === "y", "model and input reach the binding unchanged");
const total = rows.reduce((s, r) => s + r.neurons, 0);
ok(total > 0 && rows.every((r) => r.purpose.indexOf("binding") === 0), "every row still starts with 'binding', so per-worker and per-day sums are unchanged");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
