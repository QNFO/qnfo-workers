// REVISE-SHRINK-GUARD-1 (RESEARCH-FLOOR-1, qnfo-research-exec 0.24.0, agent_issues 99913): a revise patch may not take a paper from
// at or above the publish floor to below it, may not cut more than 20% of it in one pass, and may not drop its cited references
// under the reference floor. Runs the worker's real stageRevise and reviseShrinkRefusal against in-memory R2, AI and D1 mocks.
// Measured on 2026-10-19 (60 applied revise-patch events against the preceding complete chars): a single patch shrank a paper by
// 0-16%; one before the guard cut a 41k paper to 17k.
// Run: node qnfo-research-exec/revise-shrink-guard.test.mjs   -> prints "N passed, 0 failed"
import { stageRevise, reviseShrinkRefusal, paperCompleteness } from "./worker.js";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " -- " + JSON.stringify(d).slice(0, 700) : "")); } };

const S = (i) => "Step " + i + " of the derivation fixes the intermediate value " + (i * 7) + " from the stated inputs and carries it forward with the arithmetic shown. ";
const run = (from, n, cite) => Array.from({ length: n }, (_, k) => S(from + k)).join("") + (cite ? "Prior work [" + cite + "] supplies the comparison used in this step. " : "");
const sec = (h, from, n, cite) => "## " + h + "\n\n" + run(from, n, cite) + "\n\n";
const BIB = 12;
const grounding = "INPUT BLOCK\n\n## Bibliography\n" + Array.from({ length: BIB }, (_, i) => "[" + (i + 1) + "] arXiv:2401.0000" + (i + 1) + " | Work number " + (i + 1)).join("\n") + "\n";
const refList = (nums) => "## References\n\n" + nums.map((k) => "[" + k + "] Work number " + k + ". arXiv:2401.0000" + k).join("\n") + "\n";
// n sentences per section (a section is about n * 140 chars); cites 1..9 in the body.
function mkPaper(n) {
  return "# A paper about a model\n\n## Abstract\n\nContext, gap, approach, result and practice are stated here in order.\n\n"
    + sec("1. Introduction", 1, n, 1) + sec("2. Background and Related Work", 1000, n, 2) + sec("3. Methods", 2000, n, 3) + sec("4. Analysis", 3000, n, 4)
    + sec("5. Results", 4000, n, 5) + sec("6. Discussion", 5000, n, 6) + sec("7. Practical Implications and Engineering Pathways", 6000, n, 7)
    + sec("8. Conclusion", 7000, Math.max(3, Math.floor(n / 4)), "8, 9") + refList([1, 2, 3, 4, 5, 6, 7, 8, 9]);
}
const BIGP = mkPaper(41); // about 41k
const SMALL = mkPaper(15); // about 15k, under the floor
ok(BIGP.length > 38000 && BIGP.length < 46000 && paperCompleteness(BIGP).complete, "fixture: a complete paper of about 41k chars", BIGP.length);
ok(SMALL.length > 12000 && SMALL.length < 19000 && paperCompleteness(SMALL).complete, "fixture: a complete paper under the floor", SMALL.length);

const row = (extra) => Object.assign({ id: "r1", context: "{}", recover_count: 0, source: "idea-hub", stage: "revise", status: "researching" }, extra || {});

// ---- reviseShrinkRefusal, the decision ----
const cut = (paper, from, to) => paper.slice(0, from) + paper.slice(to);
{
  const a = BIGP.indexOf("## 2. Background"), b = BIGP.indexOf("## 7. Practical");
  const big = cut(BIGP, a, b);
  ok(big.length < 20000 && /below the 20000-char floor/.test(reviseShrinkRefusal(row(), BIGP, big, grounding)), "a patch that cuts 41k to under the floor is refused", { before: BIGP.length, after: big.length });
  const mid = cut(BIGP, a, a + Math.floor(BIGP.length * 0.25));
  ok(mid.length > 20000 && /cuts 2\d% of the paper in one pass/.test(reviseShrinkRefusal(row(), BIGP, mid, grounding)), "a 25% cut that stays above the floor is refused for its size", { after: mid.length, why: reviseShrinkRefusal(row(), BIGP, mid, grounding) });
  const sentence = BIGP.replace(S(5), "");
  ok(reviseShrinkRefusal(row(), BIGP, sentence, grounding) === "", "a one-sentence removal is allowed");
  const tenPct = cut(BIGP, a, a + Math.floor(BIGP.length * 0.1));
  ok(tenPct.length > 20000 && reviseShrinkRefusal(row(), BIGP, tenPct, grounding) === "", "a 10% cut that stays above the floor (the measured range is 0-16%) is allowed");
  ok(reviseShrinkRefusal(row(), SMALL, SMALL.replace(S(1005), ""), grounding) === "", "a paper already under the floor may be patched (the complete stage extends it afterwards)");
  // References: dropping the citations under the reference floor (min(MIN_REFS 8, 12 entries) = 8) is refused even when the length holds.
  const stripped = BIGP.replace(/Prior work \[[0-9, ]+\] supplies the comparison used in this step\. /g, (m) => (/\[[1-5]\]/.test(m) ? m.replace(/Prior work \[\d\]/, "Prior work") : m));
  ok(stripped.length > 38000 && /drops the cited references 9 -> 4 under the floor of 8/.test(reviseShrinkRefusal(row(), BIGP, stripped, grounding)), "a patch that leaves 4 cited references of 9 is refused", reviseShrinkRefusal(row(), BIGP, stripped, grounding));
  const oneCite = BIGP.replace("Prior work [9] supplies", "Prior work supplies").replace(/\b8, 9\b/, "8");
  ok(reviseShrinkRefusal(row(), BIGP, oneCite, grounding) === "", "citations that stay at or above the floor are allowed (9 -> 8)");
  // A remediation row keeps its own floor (8,000 chars).
  const rem = row({ source: "remediation" });
  const mk12 = mkPaper(14);
  ok(/below the 8000-char floor/.test(reviseShrinkRefusal(rem, mk12, cut(mk12, mk12.indexOf("## 2. Background"), mk12.indexOf("## 7. Practical")), grounding)), "a remediation row is judged against 8,000 chars, not 20,000");
  ok(!/below the/.test(reviseShrinkRefusal(rem, mk12, cut(mk12, mk12.indexOf("## 6. Discussion"), mk12.indexOf("## 7. Practical")), grounding)), "a remediation paper above 8,000 chars is never refused for the 20,000 floor");
}

// ---- stageRevise end to end ----
function mkEnv(answerFn, opts) {
  const o = opts || {};
  const store = { "pipeline/r1/reconciled.md": o.paper || BIGP, "pipeline/r1/grounding.md": grounding, "pipeline/r1/fixes.json": JSON.stringify({ hard: [{ id: "h1", severity: "HARD", claim: "the step value", reason: "stated without derivation", fix: "derive or remove" }], soft: [] }) };
  const sqls = [], calls = [];
  const D1 = { prepare(sql) { let args = []; const q = { bind(...x) { args = x; return q; }, async run() { sqls.push({ sql, args }); return { meta: { changes: 1 } }; }, async first() { if (/FROM ops_config/.test(sql) && o.flags && o.flags[args[0]] !== undefined) return { value: o.flags[args[0]] }; return null; }, async all() { return { results: [] }; } }; return q; } };
  const MIRROR = { async get(k) { const v = store[k]; return v == null ? null : { text: async () => v }; }, async put(k, v) { store[k] = v; } };
  const AI = { async run(model, input) { const prompt = input.messages[0].content; calls.push({ model, prompt }); return { response: answerFn(calls.length, prompt) }; } };
  return { env: { AI, QNFO_AUDIT: D1, MIRROR }, sqls, calls, store };
}
const events = (t) => t.sqls.filter((s) => /INSERT INTO cloud_ops_events/.test(s.sql)).map((s) => ({ kind: s.args[2], text: s.args[3], status: s.args[6] }));
const stageUpdates = (t) => t.sqls.filter((s) => /UPDATE research_queue SET stage=/.test(s.sql));
const BIG_FIND = BIGP.slice(BIGP.indexOf("## 2. Background"), BIGP.indexOf("## 7. Practical"));
const BIG_CUT = JSON.stringify([{ find: BIG_FIND, replace: "" }]);
const SMALL_EDIT = JSON.stringify([{ find: S(5), replace: "Step 5 of the derivation fixes the intermediate value 35 from the stated inputs and carries it forward with the arithmetic shown in full detail. " }]);

// 1. The destructive patch is refused, the second model (with the limit stated) edits a sentence, the row advances with that edit.
{
  const t = mkEnv((n) => n === 1 ? BIG_CUT : SMALL_EDIT);
  const res = await stageRevise(t.env, row());
  const stored = t.store["pipeline/r1/reconciled.md"];
  ok(t.calls.length === 2 && t.calls[0].model !== t.calls[1].model, "the refused answer is retried once on the other model", t.calls.map((c) => c.model));
  ok(/LENGTH FLOOR: 20000 characters \(the paper is \d+\); at most \d+ characters may be removed in total\./.test(t.calls[0].prompt), "the first prompt states the floor and the allowed removal");
  ok(t.calls[1].prompt.startsWith(t.calls[0].prompt) && /LENGTH RETRY: the previous answer's edits below the 20000-char floor\./.test(t.calls[1].prompt.slice(t.calls[0].prompt.length)), "the retry keeps the cached prefix and names the refused shrink");
  ok(res && res.ok === true && res.stage === "revise->review" && res.patch === 1, "the row advances with the second model's edit", res);
  ok(stored.length > BIGP.length - 200 && stored.includes("in full detail") && stored.includes("## 4. Analysis"), "the stored paper keeps its sections and carries only the small edit", stored.length);
  const ev = events(t);
  ok(ev.some((e) => e.kind === "revise-shrink-refused" && /chars \d+->\d+: below the 20000-char floor/.test(e.text) && e.status === "warn"), "revise-shrink-refused is logged with the sizes and the reason", ev);
  ok(ev.some((e) => e.kind === "revise-patch" && /refused=below the 20000-char floor/.test(e.text) && /applied=0/.test(e.text)), "the first revise-patch event records applied=0 and the refusal");
}

// 1b. A mixed patch retains safe edits while refusing the destructive edit; the next review still judges the result.
{
  const replacement = "Step 1 of the derivation fixes the intermediate value 7 from the stated inputs and carries it forward with the arithmetic shown in full detail. ";
  const mixed = JSON.stringify([{ find: S(1), replace: replacement }, { find: BIG_FIND, replace: "" }]);
  const t = mkEnv(() => mixed);
  const res = await stageRevise(t.env, row());
  const stored = t.store["pipeline/r1/reconciled.md"];
  const ev = events(t);
  ok(t.calls.length === 1 && res && res.ok === true && res.stage === "revise->review" && res.patch === 1, "a safe edit is retained without paying for a retry of the destructive edit", { calls: t.calls.length, res });
  ok(stored.includes(replacement) && stored.includes("## 2. Background and Related Work") && stored.length >= BIGP.length * 0.8, "the safe correction is applied while the paper floor and shrink bound hold", { before: BIGP.length, after: stored.length });
  ok(ev.some((e) => e.kind === "revise-shrink-salvaged" && /proposed=2 applied=1 rejected=1/.test(e.text)), "the salvaged and rejected edit counts are observable", ev);
  ok(!ev.some((e) => e.kind === "revise-shrink-refused" || e.kind === "revise-noop"), "a mixed patch with a safe edit is not counted as a refused no-op", ev.map((e) => e.kind));
}

// 2. A one-sentence removal is applied by the first model: no refusal, no retry.
{
  const t = mkEnv(() => JSON.stringify([{ find: S(5), replace: "" }]));
  const res = await stageRevise(t.env, row());
  ok(t.calls.length === 1 && res.stage === "revise->review" && !t.store["pipeline/r1/reconciled.md"].includes(S(5)) && !events(t).some((e) => e.kind === "revise-shrink-refused"), "a one-sentence removal is applied with one call and no refusal", res);
}

// 3. Both models answer with the destructive patch: nothing is stored, the pass fails as revise-noop and names the refusal.
{
  const t = mkEnv(() => BIG_CUT);
  const res = await stageRevise(t.env, row());
  ok(t.calls.length === 3, "three answers (gpt-oss-120b, glm-5.3-flash, kimi-k2.6 as the last resort), all refused", t.calls.length);
  ok(t.store["pipeline/r1/reconciled.md"] === BIGP, "the stored paper is untouched");
  ok(res && res.ok === false && res.withheld === "revise-noop", "the pass fails as revise-noop (recover path), it does not advance", res);
  ok(!stageUpdates(t).some((s) => /stage='review'/.test(s.sql)), "the row is not advanced to review");
  const ev = events(t);
  ok(ev.filter((e) => e.kind === "revise-shrink-refused").length === 3 && ev.some((e) => e.kind === "revise-noop" && /shrink refused: below the 20000-char floor/.test(e.text)), "every refusal and the noop reason are logged", ev.map((e) => e.kind));
}

// 4. The same model family twice: the first fallback already ran on MODELS[2] (no '[' in the first answer), then a refused answer still gets its retry.
{
  const t = mkEnv((n) => n === 1 ? "I cannot find a suitable edit." : n === 2 ? BIG_CUT : SMALL_EDIT);
  const res = await stageRevise(t.env, row());
  ok(t.calls.length === 3 && /LENGTH RETRY/.test(t.calls[2].prompt) && res.stage === "revise->review", "a refusal after the no-bracket fallback is retried with the limit stated", { calls: t.calls.length, res });
}

// 5. ops_config research_revise_shrink_guard = measure logs the refusal and applies the patch (the reversible lever).
{
  const t = mkEnv(() => JSON.stringify([{ find: BIG_FIND, replace: "" }]), { flags: { research_revise_shrink_guard: "measure" } });
  const res = await stageRevise(t.env, row());
  ok(t.calls.length === 1 && res.stage === "revise->review" && t.store["pipeline/r1/reconciled.md"].length < 20000, "measure mode applies the patch", res);
  ok(events(t).some((e) => e.kind === "revise-shrink-refused" && /mode=measure, applied/.test(e.text)), "measure mode still logs what it would have refused");
}

// 6. A paper already under the floor is patched as before (the guard only protects a paper that is at the floor).
{
  const t = mkEnv(() => SMALL_EDIT, { paper: SMALL });
  const res = await stageRevise(t.env, row());
  ok(t.calls.length === 1 && res.stage === "revise->review" && t.store["pipeline/r1/reconciled.md"].includes("in full detail"), "a sub-floor paper is patched with one call", res);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
