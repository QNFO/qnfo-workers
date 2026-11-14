// CODE-AGENT-SOP-1 (owner directive 2026-11-14): code agents hand off at an open pull request; the server side owns merge, repair, deploy,
// verify and close. Fails when the rule leaves an instruction file, or when an instruction tells a session to watch, poll or follow a PR.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const FILES = ["CLAUDE.md", "AGENTS.md", "agent-bootstrap.md"];
const SOP_URL = "https://ultrastable.io/api/v1/sop";

// Phrases that put a local session in charge of a pull request after it opens. Lines that cite CODE-AGENT-SOP-1 may name them to forbid them.
const BABYSIT = [
  /watch(es)? (its|the) checks/i,
  /fix(es)? a red (one|check) in the same turn/i,
  /watch(es)? to the merge/i,
  /follow(s|ed)? (it|the pr|the pull request|every pr|every pull request)[^.\n]{0,60}until it merges/i,
  /\bis followed until it merges\b/i,
  /a session does it itself \(mark ready, merge/i,
  /\bpoll(s|ing)? (the )?ci\b/i,
];

function offending(text) {
  const out = [];
  let inSop = false;
  text.split("\n").forEach((line, i) => {
    if (line.startsWith("## ")) inSop = line.includes("CODE-AGENT-SOP-1");
    if (inSop || line.includes("CODE-AGENT-SOP-1")) return;
    for (const re of BABYSIT) if (re.test(line)) out.push(`${i + 1}: ${line.slice(0, 160)}`);
  });
  return out;
}

test("every instruction file carries CODE-AGENT-SOP-1 and the SOP URL", () => {
  for (const f of FILES) {
    const t = rd(f);
    assert.ok(t.includes("CODE-AGENT-SOP-1"), `${f} lost CODE-AGENT-SOP-1`);
    assert.ok(t.includes(SOP_URL), `${f} lost the SOP URL ${SOP_URL}`);
  }
});

test("CLAUDE.md and AGENTS.md keep the section with the owner's words and the server-side owners", () => {
  for (const f of ["CLAUDE.md", "AGENTS.md"]) {
    const t = rd(f);
    const at = t.indexOf("## Code agents hand off; Ultrastable owns the rest (CODE-AGENT-SOP-1");
    assert.ok(at >= 0, `${f} lost the CODE-AGENT-SOP-1 section`);
    const sec = t.slice(at, t.indexOf("\n## ", at + 5));
    for (const must of ["This is owned by UltraStable completely", "never polls CI", "conflict_repair", "canonical-deploy.yml", "DEPLOY-PROBES-1", "runtime-probe:"]) {
      assert.ok(sec.includes(must), `${f} CODE-AGENT-SOP-1 section lost "${must}"`);
    }
  }
});

test("no instruction tells a session to watch, poll or follow a pull request after opening it", () => {
  for (const f of FILES) assert.deepEqual(offending(rd(f)), [], `${f} puts a session in charge of a PR after it opens`);
});

test("the detector catches the wording it replaced", () => {
  assert.ok(offending("open the PR, watch its checks and fix a red one in the same turn, let the lane merge it").length >= 1);
  assert.equal(offending("A PR a session opened is followed until it merges and its deploy is verified live.").length, 1);
  assert.equal(offending("A code agent never polls CI (CODE-AGENT-SOP-1).").length, 0);
});
