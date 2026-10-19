// REVISION-LOOP-1 (0.26.0) suite: published pipeline papers go back through the pipeline on a rate and come out as the next
// version with a Version History; hand-written papers are never queued; a version that failed RL_MAX_TRIES times waits.
// Offline, scripted D1s. Run: node qnfo-research-exec/revision-loop.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ciStripPipeline, rlRegression, rlNextVersion, rlChangeSummary, rlWithHistory, rlIsRevision, rlEligible, rlErrataBlock, rlSourceId, revisionLoopTick } from "./worker.js";

// Versions move forward from the live one; a rewrite is never a fixed 2.0.0.
assert.equal(rlNextVersion("1.0.0", true), "1.1.0");
assert.equal(rlNextVersion("1.0.1", true), "1.1.0");
assert.equal(rlNextVersion("2.0.0", true), "2.1.0");
assert.equal(rlNextVersion("v0.3", true), "0.4.0");
assert.equal(rlNextVersion("", true), "1.1.0");
assert.equal(rlNextVersion("1.0.0", false), "2.0.0");
assert.equal(rlNextVersion("2.0.1", false), "3.0.0");

assert.ok(rlIsRevision({ source: "remediation", source_id: rlSourceId("a-paper", "1.0.1", 1) }));
assert.ok(!rlIsRevision({ source: "remediation", source_id: "completeness:abc" }));
assert.ok(!rlIsRevision({ source: "proposal", source_id: "revision:x@1#1" }));

// Only the pipeline's own papers, by identifier or queue row; the owner's byline on a pipeline paper does not exclude it.
assert.ok(rlEligible({ slug: "s", identifier: "qnf-2026-001", authors: "[\"QNFO Research\"]" }, {}));
assert.ok(rlEligible({ slug: "s", identifier: "x", authors: "" }, { s: 1 }));
assert.ok(rlEligible({ slug: "s", identifier: "qnf-2026-001", authors: "[\"Rowan Brad Quni-Gudzinas\"]" }, {}));
assert.ok(!rlEligible({ slug: "s", identifier: "adelic-quantum-statistics", authors: "[\"Rowan Brad Quni-Gudzinas\"]" }, {}));
assert.ok(!rlEligible({ slug: "chapter-1", identifier: "qnfo-2025-00-chapter-1", authors: "[\"QNFO Research\"]" }, {}), "imported owner writing is not a pipeline paper");
assert.ok(/ORDER BY CASE WHEN source = 'remediation' AND source_id LIKE 'revision:%' THEN 0 ELSE 1 END, CASE WHEN stage IN/.test(readFileSync(new URL("./worker.js", import.meta.url), "utf8")), "queued revisions are claimed ahead of resumable drafts and the 72-hour FIFO");
assert.equal(rlErrataBlock([]), "");
assert.match(rlErrataBlock([{ claim_text: "U = p(1-p) is concave", detected_by: "qnfo-lifecycle PAPER-LEARN-1" }]), /Reported errors[\s\S]*1\. U = p\(1-p\) is concave \(confirmed by a second model\)/);
assert.ok(!rlEligible({ slug: "s", identifier: "10.5281/zenodo.1", authors: "" }, {}));

const oldMd = "# T\n\n## Abstract\n\nA.\n\n## 1. Introduction\n\nx y z\n\n## References\n\n[1] One.\n[2] Two.\n";
const newMd = "# T\n\n## Abstract\n\nA.\n\n## 1. Introduction\n\nx y z w\n\n## 2. Prior Work\n\np\n\n## References\n\n[1] One.\n[2] Two.\n[3] Three.\n\n## Provenance and AI Involvement\n\n- p\n";
const sum = rlChangeSummary(oldMd, newMd);
assert.match(sum, /new sections: Prior Work/);
assert.match(sum, /references 2 -> 3/);

const h = rlWithHistory(newMd, "1.1.0", "2026-10-19", ["Version 1.0.1 (2026-10-19, from 1.0.0): corrected statements", "Version 1.1.0 (2026-10-19, from 1.0.1): " + sum]);
assert.match(h, /^# T\n\n> \*\*Revised \(version 1\.1\.0, 2026-10-19\):\*\*/);
assert.ok(h.indexOf("## Version History") > 0 && h.indexOf("## Version History") < h.indexOf("## References"), "history sits before the references");
assert.match(h, /- Version 1\.0\.1 .*\n- Version 1\.1\.0/);
// A second pass replaces the banner and section instead of stacking them.
const h2 = rlWithHistory(h, "1.2.0", "2026-10-20", ["Version 1.2.0 (2026-10-20, from 1.1.0): again"]);
assert.equal((h2.match(/## Version History/g) || []).length, 1);
assert.equal((h2.match(/> \*\*Revised/g) || []).length, 1);
assert.match(h2, /version 1\.2\.0/);
assert.ok(!/1\.1\.0, 2026-10-19\):\*\*/.test(h2));

// The tick: scripted qnfo-audit and living-paper.
function makeEnv(o) {
  const w = { queued: [], log: [], metrics: [] };
  const audit = { prepare: (sql) => {
    const res = (a) => {
      if (/FROM ops_config/.test(sql)) return o.cfg || [];
      if (/FROM research_queue WHERE source = 'remediation' AND status IN/.test(sql)) return o.open || [];
      if (/FROM version_queue/.test(sql)) return o.vq || [];
      if (/source_id LIKE 'revision:%'/.test(sql)) return o.tries || [];
      if (/SELECT DISTINCT paper_slug/.test(sql)) return o.pipeline || [];
      if (/FROM internal_errata/.test(sql)) return o.errata || [];
      return [];
    };
    const stmt = (a) => ({
      all: async () => ({ results: res(a) }),
      first: async () => (/SELECT idea, summary/.test(sql) ? { idea: "Original idea about " + a[0] } : /COUNT\(\*\) AS n/.test(sql) ? { n: 2 } : null),
      run: async () => {
        if (/INSERT OR IGNORE INTO research_queue/.test(sql)) w.queued.push(a);
        if (/INSERT INTO paper_revision_log/.test(sql)) w.log.push(a);
        if (/UPDATE metric_registry/.test(sql)) w.metrics.push(sql.match(/metric = '([^']+)'/)[1] + "=" + a[0]);
        return { meta: { changes: 1 } };
      }
    });
    return Object.assign(stmt([]), { bind: (...a) => stmt(a) });
  } };
  const papers = { prepare: (sql) => ({ bind: (...a) => ({ all: async () => {
    if (/slug IN/.test(sql)) { w.errataArgs = a; return { results: (o.errataPapers || []).filter((p) => a.indexOf(p.slug) > 0) }; }
    w.ageArg = a[0]; return { results: o.papers || [] };
  } }) }) };
  return { env: { QNFO_AUDIT: audit, LIVING_PAPER: papers }, w };
}
const P = (slug, extra) => Object.assign({ slug, title: "Title " + slug, abstract: "abs", version: "1.0.0", identifier: "qnf-" + slug, authors: "[\"QNFO Research\"]", release_gate_pass: 0 }, extra || {});
console.error = () => {};
{
  const { env, w } = makeEnv({ papers: [P("busy"), P("human", { identifier: "adelic-quantum-statistics", authors: "Rowan Brad Quni-Gudzinas" }), P("tried"), P("a"), P("b")], open: [{ paper_slug: "busy", source_id: "completeness:1" }], tries: [1, 2, 3].map((n) => ({ source_id: "revision:tried@1.0.0#" + n })) });
  const out = await revisionLoopTick(env);
  assert.equal(out.mode, "on");
  assert.equal(w.ageArg, "-1440 minutes");
  assert.equal(out.queued.length, 1, "one per tick by default");
  assert.equal(out.queued[0].slug, "a", "skips busy, hand-written and exhausted papers");
  assert.equal(w.queued[0][1], "revision:a@1.0.0#1");
  assert.match(w.queued[0][2], /^Original idea about a\n\nPost-publication revision/);
  assert.equal(w.log.length, 1);
  assert.deepEqual(w.metrics.sort(), ["paper_loop_revisions_24h=2", "papers_awaiting_revision=2"]);
}
{
  // Backpressure: at the in-flight cap nothing new is queued; the config raises the per-tick rate.
  const full = makeEnv({ papers: [P("a")], open: Array.from({ length: 8 }, (_, i) => ({ paper_slug: "x" + i, source_id: "revision:x" + i + "@1.0.0#1" })) });
  assert.equal((await revisionLoopTick(full.env)).queued.length, 0);
  const fast = makeEnv({ papers: [P("a"), P("b"), P("c")], cfg: [{ key: "revision_loop_per_tick", value: "2" }, { key: "revision_loop_min_age_min", value: "60" }] });
  const o2 = await revisionLoopTick(fast.env);
  assert.equal(o2.queued.length, 2);
  assert.equal(fast.w.ageArg, "-60 minutes");
  const off = makeEnv({ papers: [P("a")], cfg: [{ key: "revision_loop_mode", value: "off" }] });
  const o3 = await revisionLoopTick(off.env);
  assert.ok(o3.skipped && off.w.queued.length === 0);
  // A retry of a version counts up.
  const retry = makeEnv({ papers: [P("a")], tries: [{ source_id: "revision:a@1.0.0#1" }] });
  await revisionLoopTick(retry.env);
  assert.equal(retry.w.queued[0][1], "revision:a@1.0.0#2");
}

{
  // A paper with open errata goes first, past the min age, and its brief lists the errors.
  const e = makeEnv({ papers: [P("a"), P("b")], errata: [{ target_ref: "g", claim_text: "duty cycle is not optimal", detected_by: "qnfo-lifecycle PAPER-LEARN-1" }], errataPapers: [P("g", { authors: "Rowan Brad Quni-Gudzinas", version: "1.0.1" })] });
  const o4 = await revisionLoopTick(e.env);
  assert.equal(o4.queued[0].slug, "g");
  assert.equal(o4.queued[0].errata, 1);
  assert.equal(e.w.errataArgs[0], "-60 minutes");
  assert.match(e.w.queued[0][2], /Reported errors[\s\S]*duty cycle is not optimal \(confirmed by a second model\)/);
}

// remediationPublish carries the computed version and the history (source check: the fixed '2.0.0' literal is gone).
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const rp = src.slice(src.indexOf("async function remediationPublish("), src.indexOf("__name(remediationPublish"));
assert.ok(!/'2\.0\.0','drafted'|,'2\.0\.0',\?5/.test(rp), "remediationPublish no longer writes a fixed 2.0.0");
assert.match(rp, /rlNextVersion\(versionFrom, isRev\)/);
assert.match(rp, /rlWithHistory\(paper, versionTo/);
const pv = src.slice(src.indexOf("async function publishV2("), src.indexOf("__name(publishV2"));
assert.ok(pv.indexOf("rlArchiveVersion(env, vSlug") > 0 && pv.indexOf("rlArchiveVersion(env, vSlug") < pv.indexOf("UPDATE papers SET title=?, body_md=?, version=?, abstract="), "the live text is archived before a revision replaces it");
console.log("revision-loop: ok");

// REVISION-CLAIMGATE-1: the claim gate never reads the pipeline's own banner, Version History or Provenance as the authors' claims.
{
  const md = rlWithHistory("# T\n\nWe prove a bound.\n\n## Results\n\nThe bound holds.\n\n## Provenance and AI Involvement\n\n- This paper was drafted, reconciled, reviewed, revised and checked by the QNFO automated research pipeline.\n\n## References\n\n1. A.\n", "1.1.0", "2026-10-19", ["Version 1.1.0: revised."]);
  const s = ciStripPipeline(md);
  assert.ok(!/Revised \(version/.test(s), "banner stripped");
  assert.ok(!/Version History/.test(s), "history stripped");
  assert.ok(!/automated research pipeline/.test(s), "provenance stripped");
  assert.ok(/The bound holds\./.test(s) && /## References/.test(s) && /We prove a bound\./.test(s), "paper text kept");
}

// REVISION-NONREGRESS-1: a revision thinner than the live paper does not replace it.
{
  const refs = (n) => "## References\n\n" + Array.from({ length: n }, (_, i) => "[" + (i + 1) + "] Ref " + i + ".").join("\n") + "\n";
  const words = (n) => "# T\n\n" + "word ".repeat(n) + "\n\n";
  assert.equal(rlRegression(words(2000) + refs(10), words(2100) + refs(9)), "");
  assert.match(rlRegression(words(2000) + refs(10), words(2100) + refs(6)), /^references 10 -> 6$/);
  assert.match(rlRegression(words(5000) + refs(5), words(2500) + refs(5)), /^length/);
  assert.equal(rlRegression(words(200) + refs(1), words(50) + refs(0)), "");
  assert.ok(/rlRegression\(existing\.body_md, paper\)/.test(readFileSync(new URL("./worker.js", import.meta.url), "utf8")), "remediationPublish checks a loop revision against the live paper");
}
