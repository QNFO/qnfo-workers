import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

const response = await worker.fetch(new Request("https://fleet.qnfo.org/sitemap.xml"), {}, {});
const xml = await response.text();
const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);

assert.equal(response.status, 200);
assert.match(response.headers.get("Content-Type"), /^application\/xml\b/);
assert.ok(urls.length > 0, "the public sitemap must contain at least one URL");
assert.ok(urls.every((url) => new URL(url).origin === "https://fleet.qnfo.org"),
  "the sitemap must use the canonical public origin");
assert.ok(!urls.some((url) => /\/owner(?:\/|$)/.test(new URL(url).pathname)),
  "owner-only routes must not be published");

console.log("WebMCP public sitemap returns canonical, public dashboard URLs");
