import test from "node:test";
import assert from "node:assert/strict";
import { shouldEscalateUnanswered } from "./src/session.js";
import { approvalCardSpec } from "./src/lib.js";
test("escalates once, only unanswered, only budget ok", () => {
  assert.equal(shouldEscalateUnanswered(false, false, { canEscalate: true }), true);
  assert.equal(shouldEscalateUnanswered(true, false, { canEscalate: true }), false);
  assert.equal(shouldEscalateUnanswered(false, true, { canEscalate: true }), false);
  assert.equal(shouldEscalateUnanswered(false, false, { canEscalate: false }), false);
});
test("approval card carries IDENTITY-BOUND and slug", () => {
  const c = approvalCardSpec("r1", "send_email", "c1", "{}");
  assert.equal(c.slug, "approval-r1");
  assert.match(c.why, /^IDENTITY-BOUND:/);
  assert.match(c.default_in_effect, /rejected after 24 h/);
});
