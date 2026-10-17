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
const code = ['var REVIEW_TRIAGE_CAP = ' + capMatch[1] + ';', grab('patchFlexTokens'), grab('findFlexible'), grab('reviewFindingSig'),
  grab('reviewQuotedSpans'), grab('reviewStillPresent'), grab('reviewNonMechanical'), grab('triageHardFindings')]
  .join('\n') + '\nexport { findFlexible, triageHardFindings };';
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

console.log('review-converge: OK (presence + behaviour)');
