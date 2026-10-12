// VERIFY-UNRUN-CAUSE-1 and VERIFY-TEXT-FALLBACK-1 offline suite (qnfo-research-exec 0.16.0, agent_issues 2221 LOOP-BREAKER-1).
// What `unrun` meant: the script had run and printed "CLAIM Qn: computed=... expected=..." without the match column (row
// 6f7dd283, 16 claims, 2026-10-12 14:04Z), and the adjudicator's regex required match=yes|no, so a verification that ran
// counted as not run. Proves: a CLAIM line is decided from its two numbers without the script's verdict; the cause of an
// undecidable output is classified and reported in the event and the done result; when the sandbox did not run the script
// the stage degrades to the text-level recomputation (basis=text) instead of failing the row; a crashed script keeps the
// bounded retry with its cause named.
// Run: node qnfo-research-exec/verify-unrun.test.mjs   -> prints "N passed, 0 failed"
import { adjudicateVerification, adjudicationMd, verifyUnrunCause, provenanceSection, stageVerify, paperCompleteness, finalGates } from "./worker.js";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d).slice(0, 700) : "")); } };

// The real 2026-10-12 output shape: no match column.
const claims = [{ id: "Q1", statement: "the plant runs 8760 hours a year", inputs: "365 days, 24 hours", formula: "365*24" }, { id: "Q2", statement: "the ratio is 2.44", inputs: "a=6.1, b=2.5", formula: "a/b" }, { id: "Q3", statement: "the factor is 0.66", inputs: "x", formula: "y" }];
let adj = adjudicateVerification("CLAIM Q1: computed=8760.00000000 expected=8760\nCLAIM Q2: computed=2.44000000 expected=2.44\nCLAIM Q3: computed=0.65000000 expected=0.66\n[exit 0]", claims);
ok(adj.ran === true && adj.rows.length === 3 && adj.undecided === 0, "CLAIM lines without a match column are decided from their numbers", adj);
ok(adj.rows[0].match && adj.rows[1].match && !adj.rows[2].match && adj.mismatches === 1 && adj.rows[0].script === null, "decisions at the stated precision; the absent script verdict is null, not 'no'", adj.rows);
adj = adjudicateVerification("CLAIM Q1: computed=8760.0 expected=8760 match=no\nCLAIM Q2: computed=n/a expected=none\nCLAIM Q3: computed=text expected=none match=yes", claims);
ok(adj.ran && adj.rows[0].match === true && adj.rows[0].script === false, "a script verdict never overrides two numbers", adj.rows[0]);
ok(adj.rows[1].decided === false && adj.rows[2].decided === true && adj.rows[2].match === true && adj.undecided === 1 && adj.mismatches === 0, "no numbers and no verdict is undecided; no numbers with a verdict follows the verdict", adj.rows);
adj = adjudicateVerification("CLAIM Q1: computed=n/a expected=none\nCLAIM Q2: computed=? expected=?", claims);
ok(adj.ran === false && adj.rows.length === 2 && adj.undecided === 2, "only undecidable lines is still 'not run'", adj);
ok(/none carried two numbers or a verdict/.test(adjudicationMd(adj)), "the report says why nothing was decided");
ok(/printed no CLAIM line/.test(adjudicationMd(adjudicateVerification("nothing", claims))), "the report says when no CLAIM line was printed");
const md = adjudicationMd(Object.assign(adjudicateVerification("CLAIM Q1: computed=8760 expected=8760", claims), { basis: "text" }));
ok(/sandbox was unavailable/.test(md) && /\| Q1 \| 8760 \| 8760 \| - \| match \|/.test(md), "the text-basis report says no code ran and prints '-' for a missing verdict", md);

// Cause classification.
const kinds = (s) => verifyUnrunCause(s).kind + ":" + verifyUnrunCause(s).runtime;
ok(kinds("EXEC ERROR: fetch failed") === "pilot-unreachable:true", "pilot unreachable is a runtime cause");
ok(kinds("no output (HTTP 403)") === "pilot-http:true", "a pilot refusal is a runtime cause");
ok(kinds("Traceback (most recent call last):\n  File \"<stdin>\", line 1\nModuleNotFoundError: No module named 'numpy'\n[exit 1]") === "missing-runtime:true", "a missing module is a runtime cause");
ok(kinds("\n[stderr]\nsh: python3: not found\n[exit 127]") === "missing-runtime:true", "a missing interpreter is a runtime cause");
const se = verifyUnrunCause("\n[stderr]\nTraceback (most recent call last):\n  File \"x.py\", line 3, in <module>\nZeroDivisionError: division by zero\n[exit 1]");
ok(se.kind === "script-error" && se.runtime === false && /ZeroDivisionError/.test(se.detail), "a crashed script is the script's defect, with the exception named", se);
ok(kinds("CLAIM Q1: computed=n/a expected=none\n[exit 0]") === "claim-lines-undecidable:false", "CLAIM lines without numbers are undecidable, not a runtime failure");
ok(kinds("VERIFICATION SUMMARY: 0 claims\n[exit 0]") === "no-claim-lines:false", "an output with no CLAIM line at all");

// Provenance states the weaker basis honestly.
ok(/second language model recomputed 3 quantitative claims step by step in text/.test(provenanceSection({ ran: true, claims: 3, mismatches: 0, basis: "text" })) && /no code was executed/.test(provenanceSection({ ran: true, claims: 3, basis: "text" })), "the provenance section says a model recomputed in text and no code ran");
ok(/separately generated script recomputed 3/.test(provenanceSection({ ran: true, claims: 3, basis: "script" })), "the script basis keeps its wording");

// The stage, end to end on mocks.
const SENT = "The derivation in this paragraph restates an input value with its source and shows the arithmetic step that follows from it. ";
const sec = (h, n) => "## " + h + "\n\n" + SENT.repeat(n) + "\n\n";
const PAPER = "# A paper about a plant\n\n## Abstract\n\nContext, gap, approach, result and practice are stated here in order.\n\n"
  + sec("1. Introduction", 24) + sec("2. Background and Related Work", 24) + sec("3. Methods", 24) + sec("4. Analysis", 24)
  + sec("5. Results", 24) + sec("6. Discussion", 24) + sec("7. Practical Implications and Engineering Pathways", 24) + sec("8. Conclusion", 8)
  + "## References\n\n" + Array.from({ length: 8 }, (_, i) => "[" + (i + 1) + "] Work " + (i + 1) + ". arXiv:2401.0000" + i).join("\n") + "\n";
ok(PAPER.length >= 20000 && paperCompleteness(PAPER).complete && finalGates(PAPER, { bibCount: 8, minChars: 20000, structure: true }).ok, "fixture: a complete paper that passes the publish gates", { len: PAPER.length, gates: finalGates(PAPER, { bibCount: 8, minChars: 20000, structure: true }).reason });
const CLAIMS_JSON = JSON.stringify([{ id: "Q1", statement: "the plant runs 8760 hours a year", inputs: "365 days, 24 hours", formula: "365*24" }, { id: "Q2", statement: "the ratio is 2.44", inputs: "a=6.1, b=2.5", formula: "a/b" }]);
function mkEnv(opts) {
  const store = { "pipeline/v1/reconciled.md": PAPER, "pipeline/v1/grounding.md": "" };
  const sqls = [], calls = [];
  const D1 = { prepare(sql) { let args = []; const q = { bind(...x) { args = x; return q; }, async run() { sqls.push({ sql, args }); return { meta: { changes: 1 } }; }, async first() { return null; }, async all() { return { results: [] }; } }; return q; } };
  const MIRROR = { async get(k) { const v = store[k]; return v == null ? null : { text: async () => v }; }, async put(k, v) { store[k] = v; } };
  const AI = { async run(model, input) { const p = input.messages[0].content; calls.push({ model, p }); if (p.includes("=== TASK: VERIFY_EXTRACT ===")) return { response: CLAIMS_JSON }; if (p.includes("=== TASK: VERIFY_GEN ===")) return { response: "```python\nimport math\nprint('CLAIM Q1: computed=%.8f expected=8760 match=yes' % (365*24))\nprint('CLAIM Q2: computed=%.8f expected=2.44 match=yes' % (6.1/2.5))\n```" }; if (p.includes("=== TASK: VERIFY_TEXT ===")) return { response: opts.text }; return { response: "" }; } };
  const env = { AI, QNFO_AUDIT: D1, MIRROR };
  if (opts.pilot) env.CONTAINERS_PILOT = { async fetch() { return { ok: true, status: 200, async json() { return opts.pilot; } }; } };
  return { env, sqls, calls, store, events() { return sqls.filter((s) => /INSERT INTO cloud_ops_events/.test(s.sql)).map((s) => s.args[2] + ": " + s.args[3]); } };
}
const row = () => ({ id: "v1", context: "{}", recover_count: 0, source: "idea-hub", stage: "verify", status: "researching" });
const realFetch = globalThis.fetch;

// A. No pilot binding and the public pilot host unreachable: text-level fallback, the row goes on to publish with basis=text.
{
  globalThis.fetch = async () => { throw new Error("ECONNREFUSED pilot"); };
  const t = mkEnv({ text: "Step 1: 365 x 24 = 8760.\nStep 2: 6.1 / 2.5 = 2.44.\nCLAIM Q1: computed=8760.0000 expected=8760 match=yes\nCLAIM Q2: computed=2.440000 expected=2.44\nVERIFICATION SUMMARY: 2 claims, 2 match, 0 mismatch" });
  const res = await stageVerify(t.env, row());
  globalThis.fetch = realFetch;
  ok(t.calls.some((c) => c.p.includes("=== TASK: VERIFY_TEXT ===") && c.p.includes("CLAIMS (JSON):")), "the text-level recomputation is asked for with the claims", t.calls.map((c) => c.model));
  const ev = t.events();
  ok(ev.some((e) => /^verify-text-fallback: /.test(e) && /cause=pilot-unreachable/.test(e) && /ECONNREFUSED/.test(e) && /decided=2/.test(e)), "the fallback event names the cause and what the text decided", ev);
  ok(ev.some((e) => /^verify-adjudication: /.test(e) && /basis=text/.test(e) && /mismatches=0/.test(e)), "the adjudication event carries basis=text", ev);
  ok(!ev.some((e) => /^verify-unrun: /.test(e)), "no verify-unrun event: the verification was carried out", ev);
  ok(res && res.ok === true && res.unrun === undefined && res.stage === "verify->publish" && res.basis === "text", "the row is not failed: it advances with basis=text", res);
  ok(/no code was executed/.test(t.store["pipeline/v1/reconciled.md"]) && /Provenance and AI Involvement/.test(t.store["pipeline/v1/reconciled.md"]), "the stamped provenance says no code ran");
  ok(/## Text-level recomputation/.test(t.store["pipeline/v1/verification.md"]) && /sandbox was unavailable/.test(t.store["pipeline/v1/verification.md"]), "the verification report carries the text recomputation and the basis");
}

// B. The pilot ran the script and it crashed: the script's defect, bounded retry, cause in the event and the done result.
{
  const t = mkEnv({ pilot: { ok: true, result: { exitCode: 1, stdout: "", stderr: "Traceback (most recent call last):\n  File \"x.py\", line 2, in <module>\nZeroDivisionError: division by zero" } }, text: "unused" });
  const res = await stageVerify(t.env, row());
  ok(!t.calls.some((c) => c.p.includes("=== TASK: VERIFY_TEXT ===")), "a crashed script gets no text-level fallback (the paper is not the sandbox)");
  ok(res && res.ok === false && res.stage === "verify" && res.unrun === 1 && res.cause === "script-error" && /ZeroDivisionError/.test(res.detail), "the done result names the cause, not a bare counter", res);
  const ev = t.events();
  ok(ev.some((e) => /^verify-unrun: /.test(e) && /cause=script-error/.test(e) && /ZeroDivisionError/.test(e)), "the verify-unrun event names the cause", ev);
  ok(t.sqls.some((s) => /UPDATE research_queue SET context=\?/.test(s.sql) && /"verifyUnrun":1/.test(s.args[0])) && !t.sqls.some((s) => /stage='ground'/.test(s.sql)), "attempt 1 waits for the retry; no re-arm from ground yet", t.sqls.map((s) => s.sql));
}

// C. The real 2026-10-12 case: the script ran and printed CLAIM lines without the match column. Decided, not unrun.
{
  const t = mkEnv({ pilot: { ok: true, result: { exitCode: 0, stdout: "CLAIM Q1: computed=8760.00000000 expected=8760\nCLAIM Q2: computed=2.44000000 expected=2.44\n", stderr: "" } }, text: "unused" });
  const res = await stageVerify(t.env, row());
  ok(res && res.ok === true && res.unrun === undefined && res.stage === "verify->publish" && res.basis === "script", "CLAIM lines without match= are adjudicated from their numbers and the row advances", res);
  ok(t.events().some((e) => /^verify-adjudication: /.test(e) && /basis=script/.test(e) && /claims=2/.test(e) && /undecided=0/.test(e)), "the adjudication event records the script basis", t.events());
  ok(!t.calls.some((c) => c.p.includes("=== TASK: VERIFY_TEXT ===")), "no text fallback was needed");
}

// D. A second mismatch pass: the existing loop bound still fails the row with its reason (regression guard).
{
  const t = mkEnv({ pilot: { ok: true, result: { exitCode: 0, stdout: "CLAIM Q1: computed=8000 expected=8760\nCLAIM Q2: computed=2.44 expected=2.44", stderr: "" } }, text: "unused" });
  const r = row(); r.context = JSON.stringify({ verifyPass: 1 });
  const res = await stageVerify(t.env, r);
  ok(res && res.ok === false && res.withheld === "verify-unresolved" && res.mismatches === 1, "a mismatch on the second pass is withheld as before", res);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
