// NEVER-DEAD-END-1: the unknown-address page never says "not found", redirects on a confident match.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("async function notFoundPage(");
const fn = src.slice(a, src.indexOf("// LIVING-PAPERS-PAGE-1", a));
assert.ok(!/q-eyebrow">Not found/.test(fn), "page must not announce Not found");
assert.ok(!/There is (no paper|nothing) at this address/.test(fn), "no dead-end headline");
assert.ok(/status: 302/.test(fn), "confident match redirects");
assert.ok(/status: 404/.test(fn) && /robots: "noindex"/.test(fn), "crawlers still get 404 noindex");
assert.ok(/ask\.qwav\.org/.test(fn) && /Start with the newest work/.test(fn), "always offers next steps");
assert.ok(/"Paper not found"/.test(fn), "API clients keep JSON");
console.log("never-dead-end ok");
