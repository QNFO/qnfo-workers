import test from "node:test";
import assert from "node:assert/strict";
import { shortsBufferText, shortsLinkedInText } from "./worker.js";
test("YT-LINKEDIN-POST-1: only copy with a YouTube link and real length is posted", () => {
  const ok = "A hook line\n\nWhat the paper says in plain words.\n\nWatch it in under a minute: https://youtu.be/nFP3zxyIKWg\n";
  assert.equal(shortsLinkedInText({ linkedin: ok }), ok.trim());
  assert.equal(shortsLinkedInText({ linkedin: "short" }), null);
  assert.equal(shortsLinkedInText({ linkedin: "x".repeat(80) }), null);
  assert.equal(shortsLinkedInText(null), null);
  assert.ok(shortsLinkedInText({ linkedin: ok + "y".repeat(2000) }).length <= 1200);
});
test("YT-SOCIAL-XMASTO-TEXT-1: X copy needs a YouTube link and fits 280", () => {
  const x = "A hook line for the paper\nhttps://youtu.be/nFP3zxyIKWg";
  assert.equal(shortsBufferText({ x }, "twitter"), x);
  assert.equal(shortsBufferText({ x: "no link here at all, just words" }, "twitter"), null);
  assert.ok(shortsBufferText({ x: x + "z".repeat(400) }, "twitter").length <= 280);
});
