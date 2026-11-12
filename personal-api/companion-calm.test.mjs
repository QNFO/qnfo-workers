// personal-api/companion-calm.test.mjs (COMPANION-CALM-1): the "too much right now" screen is on Today, taps only, no model.
import assert from "node:assert/strict";
import * as C from "./companion.js";

const html = (await C.handleCompanion(new Request("https://me.q08.org/companion"), { PERSONAL: null }, { waitUntil() {} }, {}).then((r) => r.text()));
assert.ok(!html.includes("__CALM_JS__"), "placeholder replaced");
assert.ok(html.includes("function calmCard()") && html.includes("calmCard()"), "calm card is rendered on Today");
assert.ok(html.includes("Too much right now?") && html.includes("Calm down"));
assert.deepEqual(C.CALM_STEPS.map((x) => x.id), ["pause", "breathe", "ground", "after"]);
assert.equal(C.CALM_STEPS.find((x) => x.id === "ground").prompts.length, 5, "5-4-3-2-1");
assert.ok(html.includes("prefers-reduced-motion: reduce"), "calm respects reduced motion");
assert.ok(html.includes("tel:113") && html.includes("0800-0113"), "Worse shows the crisis line");
assert.ok(!/<input|<textarea|placeholder/.test(C.CALM_JS), "no typing anywhere in the calm flow");
assert.ok(!/\/companion\/api\/(talk|chat|clarify)/.test(C.CALM_JS), "no model call");
assert.ok(C.CALM_JS.includes("/companion/api/activity") && C.CALM_JS.includes("category:'rest'"), "outcome is saved for what-helps");
// the whole inline script must still parse
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.ok(scripts.some((x) => x.includes("function calmOpen")));
for (const sc of scripts) new Function(sc);
console.log("ok   calm flow on Today: taps only, no model, parses, crisis line on Worse");
