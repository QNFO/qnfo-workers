// Q08-RETRY-PROGRESS-1: compare real provider-call sites with the prior repair loop (only the cycle check removed).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("./worker.js");
const guard = '    if (reviewedDrafts.indexOf(cand.text) >= 0) { trail.push("r" + (round + 1) + " stopped: repair repeated an already rejected draft"); return fail(); }\n';
assert.equal(src.split(guard).length, 2, "the differential removes exactly the cycle check");
const prior = await import("data:text/javascript;base64," + Buffer.from(src.replace(guard, "")).toString("base64"));
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks++; }
const tags = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const lede = "The operator published a report on the queue fault and explained why customers could not upload.";
const para = (tag) => "The operator in case " + tag + " watched the queue grow while the dashboard stayed green, because the dashboard measured the database and not the disk beneath it. In case " + tag + " each hour widened the gap between what was measured and what was felt, and nobody owned the space between the two numbers.";
const title = "# The queue nobody measured";
const verdict = "worth your time: yes - names the mechanism";
const essay = title + "\n\n" + lede + "\n\n" + tags.slice(0, 7).map(para).join("\n\n")
  + "\n\n<!-- analysis -->\n\n" + tags.slice(7).map(para).join("\n\n") + "\n\n" + verdict;
const improved = essay.replace(lede, "The operator published a report on the queue fault and described the missing disk alert.");
const tail = (tag) => "In case " + tag + " each hour widened the gap between what was measured and what was felt, and nobody owned the space between the two numbers.";
const cut1 = tail("three"), cut2 = tail("four");
const cutOnce = essay.replace(" " + cut1, "");
const ground = essay + "\n" + improved;
check(mod.__title.gate(essay, []).ok && mod.__verify.prunedGateProblems(essay, []).length === 0
  && mod.__analysis.analysisDepthProblems(essay).length === 0, "fixture passes the editorial, floor and analysis checks");
check(mod.__verify.groundingProblems(essay, ground).length === 0, "fixture reaches independent review");

async function run(worker, { revision = essay, flag = () => [lede], unavailable = false, forecast = false, lucky = false } = {}) {
  const calls = [], meter = { compose: 0, verify: 0, panel: 0, factcheck: 0 };
  let composed = false;
  const env = { q08Meter: meter, AI: { run: async (model, input) => {
    const prompt = (input.messages || []).map((m) => m.content).join("\n") + (input.prompt || "");
    const review = /strict fact-checker|You check the ANALYSIS section/.test(prompt);
    calls.push({ model, review });
    if (!review) { composed = true; return { response: revision }; }
    if (unavailable) throw new Error("review unavailable (fixture)");
    const draft = prompt.slice(prompt.indexOf("--- DRAFT ---"));
    const claims = lucky && composed ? [] : flag(draft).filter((s) => draft.includes(s));
    return { response: JSON.stringify({ unsupported: claims.map((s) => "FACT: " + s + " -- invented event, not in source"), verdict: claims.length ? "fail" : "pass" }) };
  } } };
  const piece = { text: essay, model: "@cf/openai/gpt-oss-120b" };
  const result = await worker.__verify.verifyAndRevise(env, { piece, prompt: "P", banned: [], ground, seedText: "cycle", forecast });
  check(meter.verify === meter.factcheck && meter.factcheck === calls.filter((c) => c.review).length, "actual fact-check attempts match the persisted meter");
  return { result, calls, meter, piece };
}
function stopped(r) { return !r.result.ok && r.result.problems.some((p) => /stopped: repair repeated an already rejected draft/.test(p)); }
function independent(r, worker) {
  const fam = worker.__quality.familyOf, reviews = r.calls.filter((c) => c.review);
  check(reviews.length >= 2 && new Set(reviews.slice(0, 2).map((c) => fam(c.model))).size === 2
    && reviews.slice(0, 2).every((c) => fam(c.model) !== fam(r.piece.model)), "initial verdicts retain two non-writer families");
}
{
  const before = await run(prior), after = await run(mod);
  check(!before.result.ok && stopped(after), "an unchanged rejected revision still fails, with an explicit stop trail: " + JSON.stringify(after.result.problems));
  check(after.meter.factcheck === 4 && before.meter.factcheck === 8 && after.meter.compose === 1,
    "a no-op repair saves exactly four redundant report/analysis reviewer calls, not the first review or revision");
  check(after.result.piece === after.piece && after.result.problems.some((p) => p.includes(lede)),
    "the original failed piece and failure reason are retained, not returned as a successful repair");
  independent(after, mod);
  const luckyBefore = await run(prior, { lucky: true }), luckyAfter = await run(mod, { lucky: true });
  check(luckyBefore.result.ok && stopped(luckyAfter), "verdict shopping cannot pass an identical draft that was already rejected");
}
{
  const flag = (t) => t.includes(cut1) ? [cut1] : [lede];
  const before = await run(prior, { flag }), after = await run(mod, { flag });
  check(stopped(after) && after.meter.factcheck === 8 && after.meter.factcheck < before.meter.factcheck,
    "A -> prune B -> revision A stops before re-reviewing A, not only on consecutive duplicates");
  check(after.result.problems.some((p) => /r1 prune -1/.test(p)), "the useful first prune is kept in the trail");
}
{
  const before = await run(prior, { revision: improved }), after = await run(mod, { revision: improved });
  check(before.result.ok && after.result.ok && after.result.piece.text === improved,
    "a changed revision fixing the claim still passes full verification");
  check(before.meter.factcheck === after.meter.factcheck && after.meter.factcheck === 8,
    "no review calls are saved on an improving path");
  const reader = (score) => ({ AI: { run: async () => ({ response: JSON.stringify({ would_read_to_end: score >= 4, score, slop_tells: [], fix: "" }) }) } });
  const pass = await mod.__analysis.finalRead(reader(4), improved, after.result.piece.model, "final");
  const fail = await mod.__analysis.finalRead(reader(3), improved, after.result.piece.model, "final");
  check(pass.ok && !fail.ok && mod.__analysis.PUBLISH_MIN_CHARS === 2800 && mod.__analysis.FINAL_PASS_MEAN === 4,
    "repaired text still faces the unchanged final publication floor and quality threshold");
}
{
  const flag = (t) => t.includes(cut1) ? [cut1] : t.includes(cut2) ? [cut2] : [];
  const before = await run(prior, { flag }), after = await run(mod, { flag });
  check(before.result.ok && after.result.ok && !after.result.piece.text.includes(cut1) && !after.result.piece.text.includes(cut2),
    "successive prunes with equal claim counts and the same claim class are not mistaken for a cycle");
  check(after.meter.factcheck === before.meter.factcheck && after.meter.compose === 0,
    "all distinct pruned drafts are reviewed; no productive-path calls are skipped");
}
{
  const revision = improved.replace("missing disk alert", "missing disk alert in 1971");
  const before = await run(prior, { revision }), after = await run(mod, { revision });
  check(!before.result.ok && !after.result.ok && !stopped(after)
    && after.result.problems.some((p) => /year not in the source: 1971/.test(p)),
    "changed text containing an unsupported year still fails deterministic grounding");
  check(after.meter.factcheck === before.meter.factcheck, "no changed-draft verification is replaced by a cached verdict");
  const changedFailure = await run(mod, { revision: improved, flag: () => [lede, improved.split("\n\n")[1]] });
  check(!changedFailure.result.ok && !stopped(changedFailure) && changedFailure.meter.factcheck === 8,
    "a different draft that still fails independent review cannot pass or skip its review");
  const down = await run(mod, { unavailable: true });
  check(!down.result.ok && down.result.vr.unavailable && down.meter.compose === 0, "reviewer outage remains fail-closed without a revision");
}
{
  const first = await run(mod), second = await run(mod);
  check(stopped(first) && stopped(second) && first.meter.factcheck === second.meter.factcheck,
    "history is local to each invocation: the next call independently reviews the draft again");
  const forecast = await run(mod, { forecast: true });
  check(!forecast.result.ok, "a failing forecast cannot pass through the shared repair loop");
}
{
  const sql = readFileSync(new URL("../migrations/2026-10-25-q08-retry-progress.sql", import.meta.url), "utf8");
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
    CREATE TABLE belief_registry (belief_key TEXT PRIMARY KEY, claim TEXT, confidence REAL, evidence TEXT, probe_class TEXT, built_on TEXT);
    CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT);
    CREATE TABLE decision_log (actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
    CREATE TRIGGER no_decision_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;
    CREATE TRIGGER no_decision_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;
  `);
  db.exec(sql); db.exec(sql);
  check(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1
    && db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 1, "audit migration is replay-safe");
  const contracts = db.prepare("SELECT * FROM remediation_contracts").all();
  check(contracts.length === 2 && contracts.every((c) => c.expected_cadence_h === 1 && c.verify_transport === "code-read"),
    "failure mode and belief have recurring probes without changing a control disposition");
  for (const c of contracts) {
    const probe = JSON.parse(c.verify_probe);
    check(probe.paths.join() === "q08-signal-engine/worker.js" && src.includes(probe.contains)
      && !src.replace(guard, "").includes(probe.contains), "probe detects the cycle-check regression rather than passing vacuously");
  }
  db.exec(sql.match(/^-- Rollback: (.+)$/m)[1]);
  check(["failure_modes", "belief_registry", "remediation_contracts"].every((t) => db.prepare("SELECT COUNT(*) n FROM " + t).get().n === 0)
    && db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1, "rollback removes only new reversible rows and retains the decision");
  db.close();
}
console.log("retry-progress.test.mjs: " + checks + " passed, 0 failed");
