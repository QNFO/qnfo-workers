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

// 2. A superseded bio: signs in, rewrites only description, keeps every other field, uses swapRecord.
const OLD = "Philosopher-scientist, AI-focused tech entrepreneur inventing nature-inspired quantum computers";
reset(); publicDesc = OLD;
recordValue = { $type: "app.bsky.actor.profile", displayName: "Rowan Brad Quni-Gudzinas", description: OLD, avatar: { ref: "a" }, banner: { ref: "b" } };
const r = await syncProfile(env);
assert.equal(r.updated, true); assert.equal(r.previous, OLD);
assert.equal(putBody.record.description, PROFILE_DESCRIPTION);
assert.deepEqual(putBody.record.avatar, { ref: "a" }); assert.deepEqual(putBody.record.banner, { ref: "b" });
assert.equal(putBody.record.displayName, "Rowan Brad Quni-Gudzinas");
assert.equal(putBody.swapRecord, "cid1"); assert.equal(putBody.rkey, "self"); assert.equal(putBody.repo, "did:plc:abc");

// 3. A failed write is reported, not thrown.
reset(); putStatus = 400;
assert.deepEqual(await syncProfile(env), { error: "putRecord 400" });

// 3a. PROFILE-SYNC-OWNER-WINS-1: a bio the fleet does not recognise is the owner's edit. One public read, no sign-in,
// no write.
const MINE = "Founder of QNFO: independent open-science research. qnfo.org";
reset(); publicDesc = MINE;
assert.deepEqual(await syncProfile(env), { held: "owner-edited", current: MINE });
assert.equal(calls.length, 1); assert.equal(putBody, null);

// 3b. Same when the public read is unavailable: the record itself is checked before any write.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => String(url).includes("public.api.bsky.app") ? new Response("", { status: 503 }) : realFetch(url, init);
reset(); recordValue = { $type: "app.bsky.actor.profile", description: MINE };
assert.deepEqual(await syncProfile(env), { held: "owner-edited", current: MINE });
assert.equal(putBody, null);
globalThis.fetch = realFetch;

// 3b2. OWNER-DELEGATION-SOCIAL-1: the bio hand-edited on 1 Oct is superseded by the owner's delegation and replaced.
const DELEGATED = "Founder of QNFO: independent open-science research on quantum computing architectures and the energy cost of computation. Previously AARP Livability Index, US DOT NHTS, Deloitte, Publicis. qnfo.org ORCID: orcid.org/0009-0002-4317-5604";
reset(); publicDesc = DELEGATED; recordValue = { $type: "app.bsky.actor.profile", displayName: "Rowan Brad Quni-Gudzinas", description: DELEGATED };
const d2 = await syncProfile(env);
assert.equal(d2.updated, true); assert.equal(putBody.record.description, PROFILE_DESCRIPTION); assert.equal(putBody.swapRecord, "cid1");

// 3c. An empty bio is filled.
reset(); publicDesc = ""; recordValue = { $type: "app.bsky.actor.profile", displayName: "Rowan Brad Quni-Gudzinas" };
assert.equal((await syncProfile(env)).updated, true); assert.equal(putBody.record.description, PROFILE_DESCRIPTION);

// 4. No credentials: nothing is called.
reset();
assert.deepEqual(await syncProfile({}), { skipped: "no credentials" }); assert.equal(calls.length, 0);

// 5. The bio fits Bluesky's 256-grapheme limit.
assert.ok([...new Intl.Segmenter().segment(PROFILE_DESCRIPTION)].length <= 256);
console.log("profile-sync: all assertions passed");
