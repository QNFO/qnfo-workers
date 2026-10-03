// Q08-QUALITY-1 offline suite: precedent ban, Title Case and metadata gate rules, reader verdict parsing, owner directives,
// prompt assembly, reader-test fail-open, and that the register exemplar no longer carries the overused guild precedent.
// Run: node q08-signal-engine/quality.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const q = mod.__quality;

// 1. overused precedents: two uses in the sample trips the ban, one does not
const bodies = ["A goldsmith stamp story.", "The guild hallmark again.", "Tulip prices once.", "Nothing here."];
const ov = q.overusedPrecedents(bodies, 2);
assert.equal(ov.length, 1); assert.match(ov[0].label, /guild|goldsmith/);
assert.equal(q.overusedPrecedents(["tulip once"], 2).length, 0);

// 2. exemplar no longer teaches the banned precedent
assert.equal(q.overusedPrecedents([q.REGISTER_EXEMPLAR], 1).filter((v) => /guild/.test(v.label)).length, 0);

// 3. reader verdict parsing
const good = q.parseReaderVerdict('x {"would_read_to_end": true, "score": 4, "slop_tells": ["a","b","c","d"], "fix": "ok"} y');
assert.equal(good.pass, true); assert.equal(good.tells.length, 3);
assert.equal(q.parseReaderVerdict('{"would_read_to_end": true, "score": 3}').pass, false);
assert.equal(q.parseReaderVerdict('{"would_read_to_end": false, "score": 5}').pass, false);
assert.equal(q.parseReaderVerdict("no json"), null);
assert.equal(q.parseReaderVerdict('{"score": "abc"}'), null);
assert.equal(q.parseReaderVerdict('{"would_read_to_end": true, "score": 99}').score, 5);

// 4. gate: metadata leak and Title Case title are problems; banned precedent is a problem
const leakText = "# Why the vendor stopped answering\n\nThe signal strength of this case was high. " + "word ".repeat(10);
const g1 = q.gate(leakText, []);
assert.ok(g1.problems.some((p) => /pipeline metadata/.test(p)), "metadata leak flagged");
const g2 = q.gate("# The Badge That Outlived The Inspection\n\nbody " + "word ".repeat(10), []);
assert.ok(g2.problems.some((p) => /Title Case/.test(p)), "Title Case flagged");
const g3 = q.gate("# The badge that outlived the inspection\n\nA guild hallmark story. " + "word ".repeat(10), q.overusedPrecedents(bodies, 2));
assert.ok(g3.problems.some((p) => /overused precedent/.test(p)), "banned precedent flagged");
const g4 = q.gate("# The badge that outlived the inspection\n\nA plain story. " + "word ".repeat(10), []);
assert.ok(!g4.problems.some((p) => /Title Case|pipeline metadata|overused/.test(p)), "sentence-case title and clean text raise none of the new rules");

// 5. owner directives: authenticated rows only, bad DB fails to []
const rows = [{ text: "  Use short sentences.  " }, { text: "" }];
const env = { AUDIT: { prepare: () => ({ all: async () => ({ results: rows }) }) } };
assert.deepEqual(await q.ownerDirectives(env), ["Use short sentences."]);
assert.deepEqual(await q.ownerDirectives({}), []);
assert.deepEqual(await q.ownerDirectives({ AUDIT: { prepare: () => { throw new Error("x"); } } }), []);

// 6. prompt assembly carries banned list and owner notes, labels metadata as internal
const fr = { core_concept: "c", friction_point: "f", signal_strength: 0.5, source: "hn", id: "1" };
const pr = q.buildPrompt(fr, [], [], { banned: ov, ownerNotes: ["Use short sentences."] });
assert.match(pr, /OVERUSED PRECEDENTS/); assert.match(pr, /OWNER EDITORIAL DIRECTIVES/); assert.match(pr, /internal pipeline metadata/);
assert.ok(!/OVERUSED PRECEDENTS/.test(q.buildPrompt(fr, [], [], {})));

// 7. a single reader read fails open (null) on an AI error and tags the family
let used = null;
const okEnv = { AI: { run: async (m) => { used = m; return { response: '{"would_read_to_end": true, "score": 5, "slop_tells": [], "fix": ""}' }; } } };
const rv = await q.readerTest(okEnv, "@cf/google/gemma-4-26b-a4b-it", "# t\n\nbody");
assert.equal(rv.pass, true); assert.equal(rv.family, "google"); assert.equal(used, "@cf/google/gemma-4-26b-a4b-it");
assert.equal(await q.readerTest({ AI: { run: async () => { throw new Error("down"); } } }, "x", "t"), null);

// 8. Q08-ENSEMBLE-1: panels never contain the writer's family, hold one judge per family, rotate with the seed
const PF = q.PANEL_POOL.map(q.familyOf);
assert.equal(new Set(PF).size, PF.length, "pool has one model per family");
assert.ok(!PF.includes("nvidia") && !PF.includes("openai"), "no writer family sits in the judge pool");
for (let sd = 0; sd < 12; sd++) {
  const pn = q.pickPanel(["nvidia"], 2, sd);
  assert.equal(pn.length, 2); assert.notEqual(q.familyOf(pn[0]), q.familyOf(pn[1]));
  assert.ok(!pn.some((m) => q.familyOf(m) === "nvidia"));
}
assert.notDeepEqual(q.pickPanel([], 2, 0), q.pickPanel([], 2, 1), "the start rotates with the seed");
const ex = q.pickPanel(["google", "zai", "alibaba", "deepseek"], 2, 0);
assert.deepEqual(ex.map(q.familyOf), ["meta"], "excluded families are skipped and a short pool returns fewer judges");
assert.deepEqual(q.pickPanel(PF, 2, 0), [], "nothing left means no panel");

// 9. aggregation: mean >= 4 and a strict majority would read; a missing judge is ignored; none means null (fail open)
const J = (score, wr) => ({ score, would_read: wr, tells: [], fix: "f" + score, pass: wr && score >= 4 });
assert.equal(q.aggregatePanel([J(5, true), J(4, true)]).pass, true);
assert.equal(q.aggregatePanel([J(5, true), J(3, false)]).pass, false, "one dissenter among two fails the panel");
assert.equal(q.aggregatePanel([J(5, true), null]).pass, true, "an errored judge is dropped");
assert.equal(q.aggregatePanel([null, null]), null);

// 10. panelRead replaces an errored judge from the spare pool and never calls a writer-family model
const seen = [];
const flaky = { AI: { run: async (m) => { seen.push(m); if (seen.length === 1) throw new Error("down"); return { response: '{"would_read_to_end": true, "score": 4, "slop_tells": [], "fix": ""}' }; } } };
const pr2 = await q.panelRead(flaky, "# t\n\nbody", ["nvidia"], 3, 2);
assert.equal(pr2.n, 2, "two valid judges after one replacement");
assert.ok(seen.length === 3 && seen.every((m) => q.familyOf(m) !== "nvidia"));
assert.equal(new Set(pr2.judges.map((j) => j.family)).size, 2);
assert.equal(await q.panelRead({ AI: { run: async () => { throw new Error("x"); } } }, "t", ["nvidia"], 0, 2), null);

// 11. effective votes: identical judges give 1, independent judges give about 2, and under 20 reads is unmeasured
const same = []; for (let i = 0; i < 30; i++) { const v = i % 2 === 0; same.push([v, v]); }
assert.equal(q.effectiveVotes(same).n_eff, 1);
const indep = []; for (let i = 0; i < 40; i++) indep.push([i % 2 === 0, i % 4 < 2]);
assert.ok(q.effectiveVotes(indep).n_eff >= 1.95);
assert.equal(q.effectiveVotes(same.slice(0, 10)).n_eff, null);
assert.equal(q.OWNER_VERDICT_WEIGHT, 3);
console.log("quality.test.mjs ok");
