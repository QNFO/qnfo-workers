import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// RENDER-CHECK-BUNDLE-REF-1 (issue 2562): the canonical deploy ships deployed-current.worker.js. A bundler that nests and renames the
// errata publisher module leaves the renderer's `erratapublishMod.renderSourceHtml` pointing at nothing, and /render-check answers 503 on every call.
for (const file of ["worker.js", "deployed-current.worker.js"]) {
  test(`${file}: the renderer reaches a defined errata publisher module`, () => {
    const src = readFileSync(new URL("./" + file, import.meta.url), "utf8");
    const bare = /(^|[^.\w])erratapublishMod\.renderSourceHtml/.test(src);
    const topLevel = /^var erratapublishMod = /m.test(src);
    const viaGlobal = /globalThis\.__erratapublishMod\.renderSourceHtml/.test(src) && /globalThis\.__erratapublishMod = erratapublishMod2;/.test(src);
    assert.ok((bare && topLevel) || viaGlobal, "renderSourceHtml is reached through a name that is defined where it is used");
  });
}
