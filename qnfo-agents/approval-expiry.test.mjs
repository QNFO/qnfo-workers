import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approvalExpired, APPROVAL_EXPIRY_MS, APPROVAL_EXPIRY_NOTE } from "./src/lib.js";

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
test("a 25-hour-old awaiting approval is expired, a 23-hour one is not", () => {
  assert.equal(approvalExpired({ status: "awaiting", created_ms: NOW - 25 * 3600e3 }, NOW), true);
  assert.equal(approvalExpired({ status: "awaiting", created_ms: NOW - 23 * 3600e3 }, NOW), false);
  assert.equal(approvalExpired({ status: "awaiting", created_ms: NOW - APPROVAL_EXPIRY_MS }, NOW), true);
});
test("an answered row is never expired again (idempotent)", () => {
  for (const status of ["approved", "rejected", "executed", "failed"]) assert.equal(approvalExpired({ status, created_ms: NOW - 99 * 3600e3 }, NOW), false);
  assert.equal(approvalExpired(null, NOW), false);
  assert.equal(approvalExpired({ status: "awaiting", created_ms: 0 }, NOW), false);
});
test("the sweep answers through respondToApproval as rejected and resolves the card with the note", () => {
  assert.equal(APPROVAL_EXPIRY_NOTE, "default rejected after 24h");
  const src = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");
  assert.match(src, /return this\.respondToApproval\(id, callId, caller, false, "expiry-sweep", true\)/);
  assert.match(src, /resolveApprovalCard\(id, expiry \? APPROVAL_EXPIRY_NOTE : "answered"\)/);
  assert.match(src, /WHERE status = 'awaiting' AND created_ms < \?1/);
  assert.match(src, /ctx\.waitUntil\(expireApprovals\(env\)/);
  assert.ok(src.includes("default rejected after 24h"), "issue 9761 code-probe literal stays in src/index.ts");
});
