// CMDLINE-HOOKS-1 (issue 8255), offline.
import assert from "node:assert/strict";
import { hookMatches, hooksFor, hookBlock } from "./src/lib.js";
assert.equal(hookMatches("*", "anything"), true);
assert.equal(hookMatches("", "x"), true);
assert.equal(hookMatches("send_email", "send_email"), true);
assert.equal(hookMatches("send_email", "send_emails"), false);
assert.equal(hookMatches("ops_github*", "ops_github_pr"), true);
assert.equal(hookMatches("a, ops_d1*", "ops_d1_query"), true);
assert.equal(hookMatches("a,b", "c"), false);
const hooks = [
  { id: "h1", event: "pre_tool", matcher: "send_email", action: "block", note: "no mail at night" },
  { id: "h2", event: "post_tool", matcher: "*", action: "notify" },
  { id: "h3", event: "pre_tool", matcher: "ops_github*", action: "notify" }
];
assert.deepEqual(hookBlock(hooks, "send_email"), { blocked: true, hook: "h1", error: "blocked by hook h1: no mail at night" });
assert.equal(hookBlock(hooks, "ops_github_pr").blocked, false);
assert.equal(hooksFor(hooks, "post_tool", "x").length, 1);
assert.equal(hooksFor(null, "pre_tool", "x").length, 0);
console.log("hooks ok");
