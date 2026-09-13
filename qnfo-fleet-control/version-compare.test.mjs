// qnfo-fleet-control/version-compare.test.mjs
// Run: node qnfo-fleet-control/version-compare.test.mjs
//
// Golden cases are taken from live readings on 2026-09-13:
//   fleet_drift_report (id 1615-1680), fleet_deploys (id 63-74),
//   service_registry, fleet_status.
// `live` = what the running comparator did. `want` = what the corrected rule must do.

import { deployDecision, compareVersions, extractWorkerVersion, UNORDERABLE }
  from './version-compare.mjs';

const CASES = [
  // deployed, canonical, want, live, evidence
  ['v1.1.0', '1.0.0', 'no-act', 'redeploy',
    'personal-companion drift 13:01:22 canonical-ahead; 7 hourly failed deploys (CF 10021)'],
  ['1.1.5', '1.1.4', 'no-act', 'no-act',
    'qnfo-ai-calibration deployed-ahead, hourly, every 30min scan'],
  ['0.3.4', '0.3.3', 'no-act', 'no-act',
    'qnfo-fleet-control deployed-ahead; 0.3.3 is the ADVISOR module VERSION'],
  ['2.1.0', 'qnfo-qwav/fabric-20260910', 'blocked', 'no-act',
    'build tag parses to [0]; undecidable, must never auto-redeploy'],
  ['3.6.1-subscribers', '3.6.1', 'blocked', 'no-act',
    'fleet_status=3.6.1-subscribers vs registry=3.6.1; naive semver would DOWNGRADE gateway'],
  ['1.14.1', '1.14.1-gtd-guard', 'blocked', 'no-act',
    'qnfo-cloud-ops; naive semver would strip the gtd-guard feature'],
  ['0.5.2-checker-heal', '0.5.3-failclosed', 'redeploy', 'redeploy',
    'qnfo-social deploy id 67 ok=1; core bump 0.5.2 -> 0.5.3'],
  ['1.2.6', '1.2.7', 'redeploy', 'redeploy',
    'qnfo-backlog-exec deploy id 69 ok=1'],
  ['1.0.0', '1.0.0', 'no-act', 'no-act', 'identical'],
  ['v2.0.0', '1.9.9', 'no-act', 'redeploy', 'v-prefix must not invert a genuine downgrade'],
];

let pass = 0, fail = 0;
for (const [d, c, want, live, why] of CASES) {
  const got = deployDecision(d, c);
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${d.padEnd(20)} -> ${c.padEnd(24)} want=${want.padEnd(8)} got=${got.padEnd(8)} live=${live}`
  );
  if (!ok) console.log(`      ${why}`);
}

// --- invariant: unorderable pairs must never resolve to an action ---
const UNORDERABLE_PAIRS = [
  ['3.6.1-subscribers', '3.6.1'],
  ['1.14.1', '1.14.1-gtd-guard'],
  ['2.1.0', 'qnfo-qwav/fabric-20260910'],
  ['1.0.0', 'not-a-version'],
];
for (const [a, b] of UNORDERABLE_PAIRS) {
  const r = compareVersions(a, b);
  const ok = r === UNORDERABLE;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  UNORDERABLE ${a} vs ${b} -> ${String(r)}`);
}

// --- extractor: merged bundle must yield the WORKER-scoped VERSION ---
const BUNDLE = `
var advisorMod = (function(){
  var VERSION = "0.3.3";
  var WORKER = "qnfo-fleet-advisor";
  return { default: {} };
})();
var calibratorMod = (function(){
  var VERSION = "1.0.0";
  var WORKER = "qnfo-fleet-calibrator";
  return { default: {} };
})();
`;
const EXTRACT = [
  ['qnfo-fleet-advisor', '0.3.3', 'first-VERSION extractor also returns this by accident'],
  ['qnfo-fleet-calibrator', '1.0.0', 'first-VERSION extractor returns 0.3.3 HERE — the live defect'],
  ['qnfo-fleet-control', null, 'absent from bundle -> must fail closed, not fall back to 0.3.3'],
];
for (const [w, want, why] of EXTRACT) {
  const got = extractWorkerVersion(BUNDLE, w);
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  extract(${w}) -> ${JSON.stringify(got)} want=${JSON.stringify(want)}  (${why})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
