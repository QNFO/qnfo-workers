// YT-WATCH-LOOP-1 (FLOW-GAP-youtube-retention): what earlier Shorts earned chooses the lane of the next one.
import test from "node:test";
import assert from "node:assert/strict";
import { shortSignals, laneWeights, rankByInterest, baseSlug } from "./worker.js";

test("a remake suffix maps back to the paper slug", () => {
  assert.equal(baseSlug("distinction-lattice-framework@v1"), "distinction-lattice-framework");
});
test("retention wins over views, views over social engagement", () => {
  const s = shortSignals(
    [{ slug: "a@v1", avg_view_duration_s: 20, views: 5 }, { slug: "b", views: 7 }, { slug: "c" }, { slug: "d" }],
    [{ slug: "c", metric: "likes", v: 3 }, { slug: "c", metric: "reposts", v: 2 }, { slug: "a", metric: "likes", v: 99 }]);
  assert.deepEqual(s, [{ slug: "a", kind: "retention", s: 20 }, { slug: "b", kind: "views", s: 7 }, { slug: "c", kind: "social", s: 7 }]);
});
test("a lane whose Shorts did better than their kind's mean gets a weight above 1, shrunk and clamped", () => {
  const sig = [{ slug: "p1", kind: "social", s: 9 }, { slug: "p2", kind: "social", s: 9 }, { slug: "m1", kind: "social", s: 0 }, { slug: "m2", kind: "social", s: 0 }];
  const w = laneWeights(sig, { p1: "physics", p2: "physics", m1: "mathematics", m2: "mathematics" });
  assert.ok(w.physics > 1 && w.physics <= 2, String(w.physics));
  assert.ok(w.mathematics < 1 && w.mathematics >= 0.5, String(w.mathematics));
  assert.deepEqual(laneWeights([], {}), {});
});
test("the next Short comes from the lane viewers stayed with, and no signal keeps the old order", () => {
  const rows = [{ slug: "new-math" }, { slug: "old-phys" }];
  const catOf = { "new-math": "mathematics", "old-phys": "physics" };
  assert.deepEqual(rankByInterest(rows, [], null, null).map((r) => r.slug), ["new-math", "old-phys"]);
  assert.deepEqual(rankByInterest(rows, [], { physics: 1.6, mathematics: 0.7 }, catOf).map((r) => r.slug), ["old-phys", "new-math"]);
  // readers still count: a math paper outsiders read beats a slightly favoured lane with no readers
  assert.deepEqual(rankByInterest(rows, [{ slug: "new-math", ext_30d: 5, pv_30d: 9 }], { physics: 1.2, mathematics: 0.9 }, catOf).map((r) => r.slug), ["new-math", "old-phys"]);
});
