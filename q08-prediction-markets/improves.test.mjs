// Q08-IMPROVES-1: the self-improvement page renders from the loop's own rows and says plainly when there are none.
import test from "node:test";
import assert from "node:assert/strict";
import { renderImproves, improvesData, NAV, IMPROVES_LOOP } from "./forecast-engine.mjs";
const head = (t) => `<title>${t}</title>`;
test("empty record renders honest status and empty states", () => {
  const html = renderImproves({ params: { version: 1, recal_a: 1, recal_b: 0, blend_w: 0.5, domains_off: {} }, settled: 0, forecasts: 3, tune_after: 50, events: [], research: [], research_seen: 4, loop: IMPROVES_LOOP }, head);
  assert.match(html, /50 more must settle/); assert.match(html, /No self-change has been recorded yet/); assert.match(html, /filed no code task yet/);
});
test("changes show reason and undo, and are escaped", () => {
  const html = renderImproves({ params: { version: 2, domains_off: { crypto: "x" } }, settled: 60, forecasts: 90, tune_after: 50, events: [{ at: "2026-11-13T01:00:00Z", kind: "knob", what: "max_updates: 4 → 5", why: "<b>coverage</b>", revert: "DELETE FROM fe_config WHERE key = 'max_updates'" }], research: [], loop: IMPROVES_LOOP }, head);
  assert.match(html, /undo: DELETE FROM fe_config/); assert.doesNotMatch(html, /<b>coverage<\/b>/); assert.match(html, /crypto/);
});
test("nav links it and a missing db is empty", async () => {
  assert.ok(NAV.some((n) => n[0] === "improves"));
  assert.equal((await improvesData({})).empty, true);
});
