// ULTRASTABLE-SITE-1: host routing, pages, design lint and fail-soft proof.
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
const mod = (await import(pathToFileURL(fileURLToPath(new URL("./worker.js", import.meta.url))).href)).default;
const get = (u) => mod.fetch(new Request(u));
globalThis.fetch = async () => { throw new Error("offline"); };
let r = await get("https://ultrastable.app/anything");
assert.equal(r.status, 301); assert.equal(r.headers.get("location"), "https://ultrastable.io/pilot");
r = await get("https://ultrastable.net/"); assert.equal(r.headers.get("location"), "https://ultrastable.io/proof");
r = await get("https://www.ultrastable.io/how"); assert.equal(r.headers.get("location"), "https://ultrastable.io/how");
for (const p of ["/", "/how", "/proof", "/pilot"]) {
  r = await get("https://ultrastable.io" + p); assert.equal(r.status, 200, p);
  const h = await r.text(); assert.match(h, /<body class="ds"/); assert.match(h, /rel="canonical"/);
  assert.ok(((h.replace(/<style>[\s\S]*?<\/style>/, "")).match(/class="btn btn-primary"/g) || []).length <= 1, p + " has at most one primary action");
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(h.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<meta name="theme-color"[^>]*>/g, "")), p + " no raw hex outside the style block");
}
assert.match(await (await get("https://ultrastable.io/")).text(), /loading from QNFO/, "offline claims fail soft");
assert.equal((await get("https://ultrastable.io/nope")).status, 404);
assert.equal((await (await get("https://ultrastable.io/health")).json()).worker, "ultrastable-site");
assert.match(await (await get("https://ultrastable.io/robots.txt")).text(), /Sitemap/);
console.log("ultrastable-site ok");
