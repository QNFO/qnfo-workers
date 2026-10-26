// REVIEW-CONVERGE-1 + REVISE-PATCH-FLEX-1 regression guard.
//
// Why this exists: qnfo-research-exec/worker.js is edited concurrently by the code
// orchestrator (deploy_locks held work:file:qnfo-research-exec/worker.js). Twice during
// 2026-10-17 a fleet-side rewrite bumped the version on top of these fixes. This suite makes
// their removal a test failure instead of a silent regression: it asserts the code is
// present AND that the rules still behave.
//
// node qnfo-research-exec/review-converge.test.mjs
import assert from 'node:assert';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./worker.js', import.meta.url), 'utf8');

// 1. presence
assert.ok(/function triageHardFindings\(/.test(src), 'REVIEW-CONVERGE-1: triageHardFindings missing - review loop is non-convergent again');
assert.ok(/function findFlexible\(/.test(src), 'REVISE-PATCH-FLEX-1: findFlexible missing - edits that differ by wrapping are dropped again');
assert.ok(/INSERT OR IGNORE INTO research_queue/.test(src), 'SWEEP-INSERT-IGNORE-1: remediation insert is not idempotent again');
assert.ok(/research_review_triage/.test(src), 'REVIEW-CONVERGE-1: the triage switch is gone');

// 2. behaviour - load the two helpers out of the bundle and exercise them
function grab(name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at > 0, 'missing ' + name);
  const start = src.slice(Math.max(0, at - 6), at) === 'async ' ? at - 6 : at;
  const end = src.indexOf('__name(' + name + ',', at);
  return src.slice(start, end);
}
const capMatch = src.match(/var REVIEW_TRIAGE_CAP = (\d+);/);
assert.ok(capMatch, 'REVIEW-CONVERGE-1: REVIEW_TRIAGE_CAP missing');
const winMatch = src.match(/var REVIEW_CLAIM_WINDOW = (\d+);/);
assert.ok(winMatch, 'REVIEW-TRIAGE-CLAIM-1: REVIEW_CLAIM_WINDOW missing');
assert.ok(/REVIEW-TRIAGE-CLAIM-1/.test(src.slice(src.lastIndexOf('function reviewFindingSig(') - 3000, src.lastIndexOf('function reviewFindingSig('))), 'REVIEW-TRIAGE-CLAIM-1: the comment above reviewFindingSig is gone');
const code = ['var REVIEW_TRIAGE_CAP = ' + capMatch[1] + ';', 'var REVIEW_CLAIM_WINDOW = ' + winMatch[1] + ';', grab('patchFlexTokens'), grab('findFlexible'), grab('reviewNorm'), grab('reviewFindingSig'),
  grab('reviewQuotedSpans'), grab('reviewStillPresent'), grab('reviewNonMechanical'), grab('triageHardFindings')]
  .join('\n') + '\nexport { findFlexible, triageHardFindings, reviewStillPresent, reviewQuotedSpans };';
globalThis.r2Get = async () => '[]';
globalThis.r2Put = async () => {};
globalThis.__name = () => {};
const mod = await import('data:text/javascript;base64,' + Buffer.from(
  'const r2Get = (...a) => globalThis.r2Get(...a); const r2Put = (...a) => globalThis.r2Put(...a); const __name = () => {};\n' + code
).toString('base64'));

const paper = '## Results\n\nThe measured flux was 42 units per litre\nand the control held at 7 units.\n';

// flex: a wrapped line must still match, and must be reported as flexible
const wrapped = mod.findFlexible(paper, 'per litre and the control held');
assert.ok(wrapped && wrapped.flex === 1, 'flex matcher does not bridge a line wrap');

// flex: ambiguity must be refused
assert.strictEqual(mod.findFlexible('alpha beta gamma delta. alpha beta gamma delta.', 'alpha beta gamma delta'), null,
  'flex matcher applied an ambiguous edit');

// triage: cycle 0 blocks a mechanical finding
let t = await mod.triageHardFindings({}, { id: 't1' }, paper,
  [{ id: 'H1', claim: 'the figure is wrong', fix: 'correct the figure' }], 0);
assert.strictEqual(t.block.length, 1, 'cycle 0 no longer blocks');

// triage: a demand that is not a text edit never blocks
t = await mod.triageHardFindings({}, { id: 't2' }, paper,
  [{ id: 'H2', claim: 'weak evidence', fix: 'Run additional experiments to confirm the effect.' }], 0);
assert.strictEqual(t.block.length, 0, 'non-mechanical demand blocks again (revise-noop loop returns)');

// triage: a new unanchored finding after cycle 0 is drift, not a blocker
t = await mod.triageHardFindings({}, { id: 't3' }, paper,
  [{ id: 'H3', claim: 'the framing could be sharper', fix: 'rewrite the opening' }], 3);
assert.strictEqual(t.block.length, 0, 'reviewer drift blocks again');

// REVIEW-TRIAGE-CLAIM-1: the reviewer puts the paper sentence itself in `claim`, verbatim and without quote marks, so the claim is the quote.
const sentence = 'The measured gap between the two branches was 0.31 units across all twelve trials.';
const claimPaper = '## Results\n\n' + sentence + '\n\nThe control held at 7 units.\n';
t = await mod.triageHardFindings({}, { id: 't4' }, claimPaper,
  [{ id: 'H1', claim: sentence, reason: 'The gap is stated without a derivation.', fix: 'Derive the gap from the inputs.' }], 1);
assert.strictEqual(t.block.length, 1, 'REVIEW-TRIAGE-CLAIM-1: a finding whose claim is a sentence of the paper (reason without a quote) is demoted as drift again');
assert.strictEqual(t.demoted.length, 0, 'REVIEW-TRIAGE-CLAIM-1: a present claim was recorded as demoted');
// the sentence was edited out of the paper: the finding is gone, so it is drift and the review keeps converging
t = await mod.triageHardFindings({}, { id: 't5' }, '## Results\n\nThe gap is about 92 units (Equation 5), derived above.\n\nThe control held at 7 units.\n',
  [{ id: 'H1', claim: sentence, reason: 'The gap is stated without a derivation.', fix: 'Derive the gap from the inputs.' }], 1);
assert.strictEqual(t.block.length, 0, 'REVIEW-TRIAGE-CLAIM-1: a claim edited out of the paper still blocks (the review no longer converges)');
assert.deepStrictEqual(t.demoted, ['drift:H1'], 'REVIEW-TRIAGE-CLAIM-1: an edited-out claim is not recorded as drift');

// the comparison ignores what a model changes when it copies a sentence
const present = (claim, text, reason) => mod.reviewStillPresent({ id: 'X', claim, reason: reason || 'No derivation is shown.' }, text);
assert.ok(present('Low‑overhead transversal fault tolerance. The concept aims to reduce syndrome extraction overhead.', 'Related work. *Low-overhead transversal   fault tolerance.*  The concept aims to reduce syndrome extraction overhead. Next.'), 'emphasis marks, spacing and Unicode hyphens are not a difference');
assert.ok(present('The rate is $2\\\\times10^{4}$ in Equation five of the derivation section.', 'The rate is $2\\times10^{4}$ in Equation five of the derivation section.'), 'doubled LaTeX backslashes are not a difference');
assert.ok(present('Section 4.3, second paragraph: ' + sentence, claimPaper), 'a location written before the sentence still finds it (window of the claim)');
assert.ok(present('“The gap” ' + sentence + ' This contradicts Section 6 of the same paper, which reports otherwise.', claimPaper), 'text after the sentence still finds it (window of the claim)');
assert.ok(!present('too short', 'too short to count as a quote'), 'a claim under 16 characters is no quote');
assert.ok(!present('A sentence the reviser has long since rewritten, so it is nowhere in the paper at all.', claimPaper), 'an absent claim is absent');
assert.ok(mod.reviewQuotedSpans({ id: 'X', claim: sentence, reason: 'The reviewer wrote "a quoted span of the paper" here.' }).length === 2, 'the quoted span and the claim are both quotes');

// Replay of the 8 HARD findings of cycle 391 (QNFO/qnfo-research runs/cycle-391/passive-fault-tolerance-via-bruhat-tits-tree-codes-claim-encoding-quantum-inform/review-report.md)
// against the sentences of paper qnf-d66c40b5 as published on 2026-10-26. All 8 were true; the old triage demoted all 8 as drift at cycles 1 and 2 (demoted=8 block=0) and the paper published.
const H = '‑';
const published391 = [
  '## 1. Introduction', '',
  'Consequently, the cooling infrastructure required for a surface' + H + 'code processor with $\\approx$ $10^{6}$ physical qubits would exceed the available power by a factor of $\\approx$ 2 × $10^{4}$, making deployment prohibitively expensive.  ', '',
  'If a passive error' + H + 'correction scheme could tolerate depolarizing error rates on the order of 75 % without syndrome extraction, the same logical performance could be achieved at 4 K, eliminating the cooling' + H + 'power bottleneck and dramatically lowering system cost.  ', '',
  '## 2. Background and Related Work', '',
  '*Low' + H + 'overhead transversal fault tolerance.*  The concept aims to reduce syndrome extraction overhead, though specific quantitative results are not addressed here. Our scheme removes syndrome extraction entirely, achieving the extreme limit of this approach.', '',
  '*Byzantine fault tolerance in cloud clusters.*  High fault rates in critical applications motivate architectures that minimize detection infrastructure.', '',
  '*Flag' + H + 'based error correction.*  Flag techniques aim to lower ancilla overhead by detecting high' + H + 'weight errors with few extra qubits. The tree code similarly reduces hardware overhead by encoding errors into the geometry.', '',
  '*Decentralized validation for arbitrary faults.*  Distributed systems can tolerate arbitrary (Byzantine) faults by validating state changes locally. This principle parallels the passive confinement of errors to local tree branches.', '',
  '*SignSGD robustness.*  SignSGD remains stable in the presence of blind Byzantine adversaries, illustrating that algorithmic designs can be inherently fault' + H + 'tolerant. The tree code likewise achieves robustness by design rather than by algorithmic correction.', '',
  '## 5. Results', '',
  'The cooling' + H + 'power gap of \\(2\\times10^{4}\\) (Eq. 5) demonstrates that the passive scheme can operate at 4 K without the massive refrigeration infrastructure required by active surface' + H + 'code implementations.', ''
].join('\n');
const findings391 = [
  ['H1', 'Consequently, the cooling infrastructure required for a surface' + H + 'code processor with ≈ $10^{6}$ physical qubits would exceed the available power by a factor of ≈ 2 × $10^{4}$, making deployment prohibitively expensive.', 'Quantitative claim lacks derivation or explicit projection label; no arithmetic is shown to support the factor of 2 × 10⁴.', 'Provide a detailed calculation of the cooling' + H + 'power ratio or rephrase as a projection with stated assumptions.'],
  ['H2', 'If a passive error' + H + 'correction scheme could tolerate depolarizing error rates on the order of 75 % without syndrome extraction, the same logical performance could be achieved at 4 K, eliminating the cooling' + H + 'power bottleneck and dramatically lowering system cost.', 'Quantitative claim of tolerating 75 % error rate is not derived, nor labeled as a projection; the analysis shows this cannot be achieved with the presented model.', 'Either remove the 75 % claim or label it as a speculative projection with clear assumptions, and reconcile with the analytical results.'],
  ['H3', 'The cooling' + H + 'power gap of $2\\times10^{4}$ (Eq. 5) demonstrates that the passive scheme can operate at 4 K without the massive refrigeration infrastructure required by active surface' + H + 'code implementations.', 'Equation (5) yields a factor of ≈ 92, not 2 × 10⁴; the statement is inconsistent with the derived value.', 'Correct the statement to reflect the computed factor (~92) or provide a separate derivation that justifies the 2 × 10⁴ figure.'],
  ['H4', 'Low' + H + 'overhead transversal fault tolerance. The concept aims to reduce syndrome extraction overhead, though specific quantitative results are not addressed here.', 'Citation [4] is used without a specific supporting excerpt from its full text; the statement is not verifiable from the supplied bibliography entry.', 'Replace the citation with a statement directly supported by the excerpt from [4] or remove the citation.'],
  ['H5', 'Byzantine fault tolerance in cloud clusters. High fault rates in critical applications motivate architectures that minimize detection infrastructure.', 'Citation [5] is used without a specific supporting excerpt; the claim cannot be traced to the provided bibliography entry.', 'Provide a concrete point from [5] that supports the claim or delete the citation.'],
  ['H6', 'Flag' + H + 'based error correction. Flag techniques aim to lower ancilla overhead by detecting high' + H + 'weight errors with few extra qubits.', 'Citation [6] is used without a specific supporting excerpt; the statement is not grounded in the supplied text.', 'Cite a specific result from [6] that matches the claim or remove the citation.'],
  ['H7', 'Decentralized validation for arbitrary faults. Distributed systems can tolerate arbitrary (Byzantine) faults by validating state changes locally.', 'Citation [7] is used without a specific supporting excerpt; the claim lacks grounding in the bibliography entry.', 'Add a concrete citation from [7] that supports the claim or omit the citation.'],
  ['H8', 'SignSGD robustness. SignSGD remains stable in the presence of blind Byzantine adversaries, illustrating that algorithmic designs can be inherently fault' + H + 'tolerant.', 'Citation [8] is used without a specific supporting excerpt; the claim is not verifiable from the provided bibliography entry.', 'Reference a specific passage from [8] that substantiates the claim or remove the citation.']
].map(([id, claim, reason, fix]) => ({ id, severity: 'HARD', claim, reason, fix }));
assert.ok(findings391.every((f) => mod.reviewStillPresent(f, published391)), 'REVIEW-TRIAGE-CLAIM-1: a finding of cycle 391 whose sentence is in the published text is read as absent: ' + findings391.filter((f) => !mod.reviewStillPresent(f, published391)).map((f) => f.id));
t = await mod.triageHardFindings({}, { id: 't391' }, published391, findings391, 1, 3);
assert.strictEqual(t.block.length, 6, 'REVIEW-TRIAGE-CLAIM-1: the replay of cycle 391 does not block the cap (6)');
assert.deepStrictEqual(t.demoted, ['over-cap:H7', 'over-cap:H8'], 'REVIEW-TRIAGE-CLAIM-1: the replay of cycle 391 over-caps the rest and demotes none as drift');
// the same findings against a paper whose sentences were all rewritten are drift: convergence is kept
t = await mod.triageHardFindings({}, { id: 't391b' }, '## 1. Introduction\n\nThe analysis below derives each figure it uses and cites each source for a point its full text makes.\n', findings391, 1, 3);
assert.strictEqual(t.block.length, 0, 'REVIEW-TRIAGE-CLAIM-1: findings whose sentences were rewritten block again');
assert.strictEqual(t.demoted.filter((d) => /^drift:/.test(d)).length, 8, 'REVIEW-TRIAGE-CLAIM-1: rewritten sentences are not recorded as drift');

console.log('review-converge: OK (presence + behaviour)');
