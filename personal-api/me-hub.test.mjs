// ME-HUB-1: the hub tiles read shared data, and the sign-in cookie is shared across q08.org.
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { hubTiles } from "./companion.js";
import { meSessionOk } from "../personal-companion/travel.js";
test("hub tiles: trip, interview and reading pick on one list", async () => {
  const env = { AUDIT: { prepare: () => ({ first: async () => ({ company: "Acme", event: "interview", ts: "x" }) }) } };
  const t = await hubTiles(env, { line: "In 3 days: Lisbon." }, { url: "https://mind.q08.org/now?lane=gentle", why: "A gentle read." }, "2026-11-12");
  assert.deepEqual(t.map((x) => x.key), ["travel", "jobs", "mind"]);
  assert.match(t[0].line, /Lisbon/); assert.match(t[1].line, /Interview with Acme/); assert.ok(t.every((x) => x.url.includes(".q08.org")));
});
test("hub tiles: a missing table never throws", async () => {
  const t = await hubTiles({ AUDIT: { prepare: () => { throw new Error("no table"); } } }, null, null, "2026-11-12");
  assert.equal(t.length, 3);
});
test("travel accepts the companion cookie only when the session is live", async () => {
  const tok = "a".repeat(64); const rq = new Request("https://x/", { headers: { Cookie: "cmp_s=" + tok } });
  const db = (exp) => ({ prepare: () => ({ bind: () => ({ first: async () => ({ expires_ms: exp }) }) }) });
  assert.equal(await meSessionOk(rq, db(Date.now() + 1e6), Date.now()), true);
  assert.equal(await meSessionOk(rq, db(1), Date.now()), false);
  assert.equal(await meSessionOk(new Request("https://x/"), db(Date.now() + 1e6)), false);
});
test("session cookie is scoped to q08.org and jobs asks the companion", () => {
  assert.match(fs.readFileSync(new URL("./companion.js", import.meta.url), "utf8"), /Domain=q08\.org; "/);
  assert.match(fs.readFileSync(new URL("../qnfo-jobsearch/worker.js", import.meta.url), "utf8"), /companion\/api\/whoami/);
});
