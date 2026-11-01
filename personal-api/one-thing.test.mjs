// personal-api/one-thing.test.mjs (COMPANION-FOCUS-1)
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as C from "./companion.js";

const actions = [
  { id: "later", title: "Later", gtd: "someday", minutes: 2 },
  { id: "long", title: "Long", gtd: "next", minutes: 20 },
  { id: "short", title: "Short", gtd: "next", minutes: 5, context: "@home" }
];
const activities = [
  { id: "hard", title: "Hard", energy: "high", minutes: 5, active: 1 },
  { id: "easy", title: "Easy", energy: "low", minutes: 5, active: 1, category: "rest" },
  { id: "off", title: "Off", energy: "low", minutes: 5, active: 0 }
];
const five = C.focusOptions(actions, activities, 5, "low");
assert.equal(five[0].kind, "action");
assert.equal(five[0].id, "short");
assert.deepEqual(five.map((x) => x.id), ["short", "easy"]);
assert.equal(C.focusOptions([], activities, 20, "high").some((x) => x.id === "hard"), true);
assert.equal(C.focusOptions([], activities, 5, "low").some((x) => x.id === "off"), false);
assert.equal(C.focusOptions([], [], 2, "low")[0].minutes, 2);
assert.equal(C.focusOptions([], [], 999, "low")[0].minutes, 2);
console.log("ok   Focus choices fit time, energy and next-action state");

const scripts = [...C.PAGE_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
for (const script of scripts) new vm.Script(script.replace(/__VERSION__/g, "test"));
console.log("ok   all companion scripts parse");

const focus = C.PAGE_HTML.match(/<section id="v-focus"[\s\S]*?<\/section>/)[0];
assert.equal(/<(input|textarea|select)\b/i.test(focus), false);
for (const text of ["Yes — start", "No, not this", "Surprise me", "Qniverse, one tap", "Start without Yes", "aria-live"]) assert.ok(C.PAGE_HTML.includes(text), text);
assert.ok(C.PAGE_HTML.includes("data-v=\"focus\""));
assert.ok(C.PAGE_HTML.includes("focus:loadFocus"));
console.log("ok   Focus is click-only and present in the existing companion");

for (const route of ["/companion/api/actions", "/companion/api/activities", "/companion/api/activity", "/companion/api/actions/done"]) assert.ok(C.PAGE_HTML.includes(route), route);
assert.equal(C.PAGE_HTML.includes("/companion/api/focus"), false);
for (const text of ["project:'Qniverse'", "source:'focus-qniverse'", "docs/ONE-THING-BACKLOG.md"]) assert.ok(C.PAGE_HTML.includes(text), text);
console.log("ok   Focus reuses existing APIs and the Qniverse action backlog");

const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = fs.readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
assert.ok(worker.includes('var VERSION = "4.29.0-one-thing"'));
assert.ok(worker.includes('const COMPANION_VERSION = "1.14.0"'));
assert.ok(worker.includes("COMPANION-FOCUS-1"));
assert.equal(worker, mirror);
console.log("ok   versions bumped and deployed mirror is byte-identical");
console.log("COMPANION-FOCUS-1: all passed");
