import test from "node:test";
import assert from "node:assert/strict";
import { shortsLinkedInText } from "./worker.js";
test("YT-LINKEDIN-POST-1: only copy with a YouTube link and real length is posted", () => {
  const ok = "A hook line\n\nWhat the paper says in plain words.\n\nWatch it in under a minute: https://youtu.be/nFP3zxyIKWg\n";
  assert.equal(shortsLinkedInText({ linkedin: ok }), ok.trim());
  assert.equal(shortsLinkedInText({ linkedin: "short" }), null);
  assert.equal(shortsLinkedInText({ linkedin: "x".repeat(80) }), null);
  assert.equal(shortsLinkedInText(null), null);
  assert.ok(shortsLinkedInText({ linkedin: ok + "y".repeat(2000) }).length <= 1200);
});
