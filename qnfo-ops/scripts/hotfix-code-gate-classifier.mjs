#!/usr/bin/env node
/**
 * HOTFIX 2026-09-12 - CODE-GATE-GUARD-1
 *
 * SYMPTOM (observed live, qnfo-ops 2.10.0):
 *   Internal memory-pipeline prompts were logged domain="code".
 *     06:37:28  "You extract durable, long-term memories for a ..."  -> domain=code
 *     06:37:17  "You decide whether a conversation span contains ..." -> domain=code
 *   Pre-deploy the same prompt families logged domain="ops" (the column was
 *   hardcoded before 2.10.0), so this is a regression introduced by the gate.
 *
 * ROOT CAUSE:
 *   classifyDomain() is applied to lastUserText(messages). For internal pipeline
 *   calls that value is the ENTIRE embedded conversation (4000 chars). That text
 *   contains ordinary words the code signal list scores:
 *     "deploy" (+2), "implement" (+2), "debug" (+2), "commit" (+2),
 *     "let " (+1), "return " (+1), ".js" (+1, also matches ".json")
 *   -> code score 8 vs threshold 3 -> "code".
 *   The classifier was classifying the embedded conversation, not the task.
 *
 * FIX (minimal + targeted):
 *   Never code-classify
 *     (a) prompts longer than 800 chars (real user code requests are short;
 *         embedded-conversation pipeline prompts are 1.3K-4K), or
 *     (b) prompts that open with a known internal-pipeline prefix.
 *   NOTE: this deliberately does NOT attempt the separate recall improvement
 *   (the gate currently only fires on "write a function ..." / fenced blocks).
 *   That is a follow-up change with its own review.
 *
 * USAGE:
 *   cd qnfo-workers/qnfo-ops
 *   node scripts/hotfix-code-gate-classifier.mjs
 *   node --input-type=module --check < worker.js && echo SYNTAX-OK
 *   npx wrangler deploy
 *   curl -s https://qnfo-ops.q08.workers.dev/health   # expect version 2.10.1
 *
 * ROLLBACK (alternative to this hotfix):
 *   git checkout fb5d431^ -- qnfo-ops/worker.js && npx wrangler deploy
 *   (fb5d431 is the 2.10.0 gate commit; ^ is the 2.9.6 state, which is also
 *    byte-identical to the pre-deploy deployed-current.worker.js)
 *
 * IDEMPOTENT: re-running is a no-op. The anchor count assertion means a
 * changed/missing anchor aborts WITHOUT writing.
 */
import fs from "node:fs";

const P = "worker.js";
let s = fs.readFileSync(P, "utf8");

if (s.includes("CODE-GATE-GUARD-1")) {
  console.log("already applied; no-op");
  process.exit(0);
}

const OLD = '  if (!t) return "chat";\n  var code = 0, ops = 0;';
const NEW =
  '  if (!t) return "chat";\n' +
  '  // CODE-GATE-GUARD-1 (2026-09-12): never code-classify embedded-conversation prompts.\n' +
  '  if (t.length > 800) return "chat";\n' +
  '  if (/^(you extract|you decide|you synthesize|you are compressing|the following sections)/.test(t)) return "chat";\n' +
  '  var code = 0, ops = 0;';

const n = s.split(OLD).length - 1;
if (n !== 1) {
  console.error("FAIL: expected exactly 1 anchor occurrence, found " + n + " - no write performed");
  process.exit(1);
}

s = s.replace(OLD, NEW);
s = s.replace('var VERSION = "2.10.0";', 'var VERSION = "2.10.1";');

fs.writeFileSync(P, s);
console.log("APPLIED CODE-GATE-GUARD-1 -> VERSION 2.10.1, new size " + s.length);
