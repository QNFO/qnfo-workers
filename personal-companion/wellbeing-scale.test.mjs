// CHECKIN-SCALE-ANCHORED-1 (owner 2026-10-17: "what is mood and energy? what is high/low score? not helpful").
// Guards the instrument, not the sampling: every rung carries the word it means, the page states the
// direction and the bands, and the API exposes the same scale machine-readably.
import test from "node:test";
import assert from "node:assert/strict";
import { handleWellbeing, nudgeMail, context } from "./wellbeing-wire.js";

const stmt = {
  bind() { return stmt; },
  first: async () => ({}),
  all: async () => ({ results: [] }),
  run: async () => ({ success: true })
};
const env = { PERSONAL: { prepare: () => stmt, batch: async () => [] } };

test("check-in page defines mood and energy, anchors every rung, states bands", async () => {
  const res = await handleWellbeing(new Request("https://c.test/wb/checkin"), env, {});
  const html = await res.text();
  assert.equal(res.status, 200, html.slice(0, 200));
  assert.match(html, /<b>Mood<\/b> is how you feel right now/);
  assert.match(html, /<b>Energy<\/b> is how much you have in the tank/);
  assert.match(html, /where 5 is best/);
  for (const w of ["rough", "low", "okay", "good", "great"]) {
    assert.ok(html.includes(">" + w + "</small>"), "missing mood anchor: " + w);
  }
  for (const w of ["empty", "thin", "steady", "strong", "full"]) {
    assert.ok(html.includes(">" + w + "</small>"), "missing energy anchor: " + w);
  }
  assert.match(html, /1-2 is low, 3 is neutral, 4-5 is high/);
  assert.match(html, /not a grade and there is no target/);
});

test("check-in mail and brief line carry the scale", async () => {
  const m = nudgeMail({ kind: "checkin", id: 1 }, {}, "tok");
  assert.match(m.body, /Mood \(how you feel\)/);
  assert.match(m.body, /1 low to 5 high/);
});

test("api publishes the same scale plus the drift thresholds in use", async () => {
  const c = await context(env, new Date().toISOString());
  assert.equal(c.scale.mood[1], "rough");
  assert.equal(c.scale.mood[5], "great");
  assert.equal(c.scale.energy[5], "full");
  assert.match(c.scale.direction, /5 is best/);
  assert.equal(c.scale.not_a_grade, true);
  assert.equal(c.scale.thresholds.mood_today_strong_low, 1);
});
