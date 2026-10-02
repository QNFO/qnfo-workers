// FLEET-CTL-STATIC-1 offline test (issue 1778): the subscribe, confirm and unsubscribe pages carry one static fleet link scoped
// to the subscribe surface; no page loads fleet.qnfo.org/ctl.js, and the link never carries a subscriber token.
// Run: node qnfo-subscribers/fleet-link.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const q = () => { const s = { bind() { return s; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { meta: { changes: 0 } }; } }; return s; };
const env = { DB: { prepare: q }, AUDIT: { prepare: q }, SUBSCRIBERS: { prepare: q } };
const ctx = { waitUntil() {} };
const want = "https://fleet.qnfo.org/cmd?from=" + encodeURIComponent("https://qnfo.org/subscribe");
for (const [p, m] of [["/confirm?token=SECRET-TOKEN-123", "GET"], ["/unsubscribe?token=SECRET-TOKEN-123", "GET"]]) {
  let r;
  try { r = await worker.fetch(new Request("https://qnfo.org" + p, { method: m }), env, ctx); } catch (e) { ok(false, p + " renders", String(e)); continue; }
  const h = await r.text();
  const links = h.match(/<a id="fleet-ctl" href="([^"]+)"/g) || [];
  if (!/^\s*</.test(h)) { ok(true, p + " (json answer, no page)"); continue; }
  ok(links.length === 1 && h.includes('href="' + want + '"'), p + ": one fleet link scoped to the subscribe surface", links);
  ok(!/SECRET-TOKEN-123[^]*fleet-ctl|fleet\.qnfo\.org\/cmd\?from=[^"]*SECRET/.test(h), p + ": the link never carries the token");
  ok(!/fleet\.qnfo\.org\/ctl\.js/.test(h), p + ": no remote fleet script");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
