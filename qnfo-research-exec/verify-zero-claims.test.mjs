// VERIFY-ZERO-CLAIMS-1 (qnfo-research-exec 0.29.0; PAPER-LEARN-1 learning 15 of agent_issues 100234): a verify pass whose claim extraction
// finds nothing in a paper that carries many numeric equalities logs a verify-zero-claims event (the measurement behind the
// fm-verify-zero-claims-quantitative detector); a qualitative paper with few equalities logs none; the pass itself is unchanged.
// Run: node --no-warnings qnfo-research-exec/verify-zero-claims.test.mjs
import { stageVerify } from "./worker.js";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d).slice(0, 500) : "")); } };

const SENT = "The derivation in this paragraph restates an input value with its source and shows the arithmetic step that follows from it. ";
const sec = (h, n) => "## " + h + "\n\n" + SENT.repeat(n) + "\n\n";
const EQS = "The relations are x = 3, y = 4, z = 5, a = 6, b = 7 and c = 8 in these units.\n\n";
const paperWith = (extra) => "# A paper about a plant\n\n## Abstract\n\nContext, gap, approach, result and practice are stated here in order.\n\n"
  + sec("1. Introduction", 24) + sec("2. Background and Related Work", 24) + sec("3. Methods", 24) + extra + sec("4. Analysis", 24)
  + sec("5. Results", 24) + sec("6. Discussion", 24) + sec("7. Practical Implications and Engineering Pathways", 24) + sec("8. Conclusion", 8)
  + "## References\n\n" + Array.from({ length: 8 }, (_, i) => "[" + (i + 1) + "] Work " + (i + 1) + ". arXiv:2401.0000" + i).join("\n") + "\n";

function mkEnv(paper) {
  const store = { "pipeline/v1/reconciled.md": paper, "pipeline/v1/grounding.md": "" };
  const sqls = [];
  const D1 = { prepare(sql) { let args = []; const q = { bind(...x) { args = x; return q; }, async run() { sqls.push({ sql, args }); return { meta: { changes: 1 } }; }, async first() { return null; }, async all() { return { results: [] }; } }; return q; } };
  const MIRROR = { async get(k) { const v = store[k]; return v == null ? null : { text: async () => v }; }, async put(k, v) { store[k] = v; } };
  const AI = { async run(model, input) { const p = input.messages[0].content; if (p.includes("=== TASK: VERIFY_EXTRACT ===")) return { response: "[]" }; return { response: "" }; } };
  return { env: { AI, QNFO_AUDIT: D1, MIRROR }, events() { return sqls.filter((s) => /INSERT INTO cloud_ops_events/.test(s.sql)).map((s) => s.args[2] + ": " + s.args[3]); } };
}
const row = () => ({ id: "v1", context: "{}", recover_count: 0, source: "idea-hub", stage: "verify", status: "researching" });

{
  const t = mkEnv(paperWith(EQS));
  const res = await stageVerify(t.env, row());
  const ev = t.events().filter((e) => /^verify-zero-claims: /.test(e));
  ok(ev.length === 1 && /row=v1 equalities=\d+/.test(ev[0]) && Number(/equalities=(\d+)/.exec(ev[0])[1]) >= 6, "a paper with numeric equalities and no extracted claim logs verify-zero-claims", t.events());
  ok(res && res.ok === true, "the pass itself still proceeds", res);
}
{
  const t = mkEnv(paperWith("The argument here is purely verbal and states no number.\n\n"));
  const res = await stageVerify(t.env, row());
  ok(!t.events().some((e) => /^verify-zero-claims: /.test(e)), "a qualitative paper logs none", t.events());
  ok(res && res.ok === true, "and proceeds", res);
}
console.log("verify-zero-claims: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
