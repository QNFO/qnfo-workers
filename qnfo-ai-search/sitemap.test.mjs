import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "ask-sitemap-"));

try {
  writeFileSync(join(temp, "worker.mjs"), readFileSync(join(here, "worker.js"), "utf8"));
  const { default: worker } = await import(pathToFileURL(join(temp, "worker.mjs")).href);

  for (const host of ["ask.qwav.tech", "ask.qwav.org"]) {
    const sitemap = await worker.fetch(new Request(`https://${host}/sitemap.xml`), {}, {});
    const xml = await sitemap.text();
    assert.equal(sitemap.status, 200, `${host} sitemap status`);
    assert.match(sitemap.headers.get("content-type"), /application\/xml/i);
    assert.match(xml, /<loc>https:\/\/ask\.qwav\.tech\/<\/loc>/);

    const robots = await worker.fetch(new Request(`https://${host}/robots.txt`), {}, {});
    const text = await robots.text();
    assert.equal(robots.status, 200, `${host} robots status`);
    assert.match(text, /Disallow: \/api\/ask/);
    assert.match(text, /Disallow: \/api\/feedback/);
    assert.match(text, /Sitemap: https:\/\/ask\.qwav\.tech\/sitemap\.xml/);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log("ask sitemap and robots routes passed");
