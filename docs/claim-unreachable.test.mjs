// CLAIM-UNREACHABLE-1 (2026-10-30): the work-claim rule has a fallback, so an unreachable qnfo-deploy-guard (the GitHub cloud sandbox's host allowlist refused it
// during the 2026-10-30 run that left 67 draft pull requests) never ends an issue as an empty or draft pull request. Pins the rule in the three files a session reads.
// Run: node docs/claim-unreachable.test.mjs   -> prints "claim-unreachable ok"
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const claude = read("CLAUDE.md");
const start = claude.indexOf("- CLAIM-UNREACHABLE-1");
assert.ok(start > 0, "CLAUDE.md states CLAIM-UNREACHABLE-1 in the work claims section");
const rest = claude.slice(start);
const end = rest.indexOf("\n- Before you bump");
const rule = rest.slice(0, end > 0 ? end : undefined).replace(/\s+/g, " ");
for (const needle of [
  "never a stop",
  "empty or draft pull request",
  "list the open pull requests that touch it",
  "non-draft pull request",
  "work claim unreachable:",
  "retry the claim before you merge",
  "holder",
  "the secret lock",
  "never licenses a hand deploy",
]) assert.ok(rule.includes(needle), "the CLAUDE.md rule names: " + needle);

for (const p of ["AGENTS.md", ".github/agents/quniverse.agent.md"]) {
  assert.ok(read(p).replace(/\s+/g, " ").includes("CLAIM-UNREACHABLE-1"), p + " points to CLAIM-UNREACHABLE-1");
}

// the original procedure is intact: a reachable endpoint still decides
assert.ok(claude.includes("/work-lock/acquire") && claude.includes("`holder` is on it until `expires_at`"), "the acquire procedure is unchanged");
console.log("claim-unreachable ok");
