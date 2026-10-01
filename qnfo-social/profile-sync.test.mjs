// Offline test (mocked fetch) for PROFILE-SYNC-1.
import assert from "node:assert/strict";
import { syncProfile, PROFILE_DESCRIPTION } from "./worker.js";

const env = { BSKY_HANDLE: "qnfo.bsky.social", BSKY_APP_PASS: "x" };
const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
let calls, publicDesc, recordValue, putBody, putStatus;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push((init.method || "GET") + " " + u.split("?")[0]);
  if (u.includes("public.api.bsky.app")) return ok({ handle: "qnfo.bsky.social", description: publicDesc });
  if (u.endsWith("com.atproto.server.createSession")) return ok({ did: "did:plc:abc", accessJwt: "jwt" });
  if (u.includes("com.atproto.repo.getRecord")) return ok({ uri: "at://did:plc:abc/app.bsky.actor.profile/self", cid: "cid1", value: recordValue });
  if (u.endsWith("com.atproto.repo.putRecord")) { putBody = JSON.parse(init.body); return ok({ cid: "cid2" }, putStatus); }
  return ok({ error: "unexpected " + u }, 404);
};
const reset = () => { calls = []; putBody = null; putStatus = 200; };

// 1. Already in sync: one public read, no sign-in, no write.
reset(); publicDesc = PROFILE_DESCRIPTION;
assert.deepEqual(await syncProfile(env), { unchanged: true });
assert.equal(calls.length, 1);

// 2. Drift: signs in, rewrites only description, keeps every other field, uses swapRecord.
reset(); publicDesc = "Philosopher-scientist";
recordValue = { $type: "app.bsky.actor.profile", displayName: "Rowan Brad Quni-Gudzinas", description: "Philosopher-scientist", avatar: { ref: "a" }, banner: { ref: "b" } };
const r = await syncProfile(env);
assert.equal(r.updated, true); assert.equal(r.previous, "Philosopher-scientist");
assert.equal(putBody.record.description, PROFILE_DESCRIPTION);
assert.deepEqual(putBody.record.avatar, { ref: "a" }); assert.deepEqual(putBody.record.banner, { ref: "b" });
assert.equal(putBody.record.displayName, "Rowan Brad Quni-Gudzinas");
assert.equal(putBody.swapRecord, "cid1"); assert.equal(putBody.rkey, "self"); assert.equal(putBody.repo, "did:plc:abc");

// 3. A failed write is reported, not thrown.
reset(); putStatus = 400;
assert.deepEqual(await syncProfile(env), { error: "putRecord 400" });

// 4. No credentials: nothing is called.
reset();
assert.deepEqual(await syncProfile({}), { skipped: "no credentials" }); assert.equal(calls.length, 0);

// 5. The bio fits Bluesky's 256-grapheme limit.
assert.ok([...new Intl.Segmenter().segment(PROFILE_DESCRIPTION)].length <= 256);
console.log("profile-sync: all assertions passed");
