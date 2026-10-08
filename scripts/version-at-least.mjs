// VERSION-PIN-TESTS-1 (2026-10-08): suites assert a minimum VERSION, never a range regex. A pattern such as
// /^0\.9\.6[4-9]/ stops matching at the next bump (0.9.70), so every later change to the worker failed CI:
// the code loop's tasks for #2137, #2116 (qnfo-research-exec) and #1815 (qnfo-infra) each failed on it.
// versionAtLeast("0.9.70-codeagent", "0.9.64") === true; the suffix after the numeric core is ignored.
export function versionAtLeast(v, min) {
  const core = (s) => (String(s || "").match(/^(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
  const a = core(v), b = core(min);
  if (a.length !== 3 || b.length !== 3) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
